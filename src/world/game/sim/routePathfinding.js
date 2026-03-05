// src/world/game/sim/routePathfinding.js
// Simple A* pathfinding for trade routes (land / water) with custom passability.

import { sampleHM } from '../../infinite/terrainSampler.js';
import { aStarPath, linePath as sharedLinePath } from '../shared/gridPathfinding.js';

function isWaterSurface(surf) {
  return surf === 'shallow_water' || surf === 'deep_water';
}

export function isLandPassable(seed, tx, ty, infiniteCfg, balance) {
  const s = sampleHM(seed, tx, ty, infiniteCfg);
  if (isWaterSurface(s.surface)) return false;
  const maxSlope = balance?.building?.maxSlope ?? 0.78;
  if ((s.slope ?? 0) > maxSlope) return false;
  // Allow all other surfaces.
  return true;
}

export function isWaterPassable(seed, tx, ty, infiniteCfg, _balance) {
  const s = sampleHM(seed, tx, ty, infiniteCfg);
  return isWaterSurface(s.surface);
}

function linePath(passableFn, seed, sx, sy, gx, gy, infiniteCfg, balance, maxNodes = 2000) {
  return sharedLinePath(
    (x, y) => passableFn(seed, x, y, infiniteCfg, balance),
    sx,
    sy,
    gx,
    gy,
    maxNodes,
    true,
  );
}

export function findPath(passableFn, seed, start, goal, infiniteCfg, balance, opts = {}) {
  const maxNodes = opts.maxNodes ?? 8000;
  const maxDistance = opts.maxDistanceTiles ?? 180;
  const margin = opts.marginTiles ?? 18;

  return aStarPath(start, goal, {
    passableFn: (x, y) => passableFn(seed, x, y, infiniteCfg, balance),
    maxNodes,
    maxDistance,
    margin,
    includeStart: true,
    directFallback: (s, g) => linePath(passableFn, seed, s.x, s.y, g.x, g.y, infiniteCfg, balance, maxNodes),
  });
}

function findNearestTile(seed, startTx, startTy, infiniteCfg, passableFn, balance, radius) {
  let best = null;
  let bestD = Infinity;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = startTx + dx;
      const ty = startTy + dy;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > radius) continue;
      if (!passableFn(seed, tx, ty, infiniteCfg, balance)) continue;
      if (d < bestD) {
        bestD = d;
        best = { x: tx, y: ty };
      }
    }
  }
  return best;
}

export function buildLandRoute(seed, cityA, cityB, infiniteCfg, balance) {
  const a = { x: cityA.hub.tx, y: cityA.hub.ty };
  const b = { x: cityB.hub.tx, y: cityB.hub.ty };

  const start = isLandPassable(seed, a.x, a.y, infiniteCfg, balance) ? a : findNearestTile(seed, a.x, a.y, infiniteCfg, isLandPassable, balance, 4) ?? a;
  const goal = isLandPassable(seed, b.x, b.y, infiniteCfg, balance) ? b : findNearestTile(seed, b.x, b.y, infiniteCfg, isLandPassable, balance, 4) ?? b;

  const path = findPath(isLandPassable, seed, start, goal, infiniteCfg, balance, {
    maxDistanceTiles: balance?.trade?.landMaxDistanceTiles ?? 200,
    maxNodes: balance?.trade?.landMaxNodes ?? 10000,
    marginTiles: balance?.trade?.landMarginTiles ?? 22,
  });

  const full = [{ x: a.x, y: a.y }, ...path, { x: b.x, y: b.y }];
  return { ok: true, segments: [{ mode: 'land', path: full }] };
}

export function buildWaterRoute(seed, cityA, cityB, infiniteCfg, balance) {
  const portR = balance?.trade?.portSearchRadiusTiles ?? 6;

  const aHub = { x: cityA.hub.tx, y: cityA.hub.ty };
  const bHub = { x: cityB.hub.tx, y: cityB.hub.ty };

  const aPort = findNearestTile(seed, aHub.x, aHub.y, infiniteCfg, isWaterPassable, balance, portR);
  const bPort = findNearestTile(seed, bHub.x, bHub.y, infiniteCfg, isWaterPassable, balance, portR);

  if (!aPort || !bPort) return { ok: false, reason: 'no_port' };

  const water = findPath(isWaterPassable, seed, aPort, bPort, infiniteCfg, balance, {
    maxDistanceTiles: balance?.trade?.waterMaxDistanceTiles ?? 220,
    maxNodes: balance?.trade?.waterMaxNodes ?? 12000,
    marginTiles: balance?.trade?.waterMarginTiles ?? 26,
  });

  const landA = linePath(isLandPassable, seed, aHub.x, aHub.y, aPort.x, aPort.y, infiniteCfg, balance, 400);
  const landB = linePath(isLandPassable, seed, bPort.x, bPort.y, bHub.x, bHub.y, infiniteCfg, balance, 400);

  return {
    ok: true,
    segments: [
      { mode: 'land', path: landA },
      { mode: 'water', path: water },
      { mode: 'land', path: landB },
    ],
  };
}
