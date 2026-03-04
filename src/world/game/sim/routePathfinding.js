// src/world/game/sim/routePathfinding.js
// Simple A* pathfinding for trade routes (land / water) with custom passability.

import { sampleHM } from '../../infinite/terrainSampler.js';

function manhattan(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }

function key(x, y) { return `${x},${y}`; }

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
  const path = [{ x: sx, y: sy }];
  let x0 = sx, y0 = sy, x1 = gx, y1 = gy;
  let dx = Math.abs(x1 - x0), sxn = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0), syn = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sxn; }
    if (e2 <= dx) { err += dx; y0 += syn; }

    if (!passableFn(seed, x0, y0, infiniteCfg, balance)) break;
    path.push({ x: x0, y: y0 });
    if (path.length > maxNodes) break;
  }
  return path;
}

export function findPath(passableFn, seed, start, goal, infiniteCfg, balance, opts = {}) {
  const sx = start.x, sy = start.y, gx = goal.x, gy = goal.y;
  const maxNodes = opts.maxNodes ?? 8000;
  const maxDistance = opts.maxDistanceTiles ?? 180;
  const margin = opts.marginTiles ?? 18;

  if (sx === gx && sy === gy) return [{ x: sx, y: sy }];

  const dist0 = manhattan(sx, sy, gx, gy);
  if (dist0 > maxDistance) {
    return linePath(passableFn, seed, sx, sy, gx, gy, infiniteCfg, balance, maxNodes);
  }

  const minX = Math.min(sx, gx) - margin;
  const maxX = Math.max(sx, gx) + margin;
  const minY = Math.min(sy, gy) - margin;
  const maxY = Math.max(sy, gy) + margin;

  const open = [];
  const openSet = new Set();
  const gScore = new Map();
  const parent = new Map();
  const pos = new Map();

  function push(x, y, g, f) {
    const k = key(x, y);
    open.push({ x, y, g, f, k });
    openSet.add(k);
    pos.set(k, { x, y });
  }

  function popBest() {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const n = open[bi];
    const last = open.pop();
    if (bi < open.length) open[bi] = last;
    openSet.delete(n.k);
    return n;
  }

  const sk = key(sx, sy);
  gScore.set(sk, 0);
  push(sx, sy, 0, dist0);

  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  let expanded = 0;
  while (open.length) {
    const cur = popBest();
    expanded++;
    if (expanded > maxNodes) break;

    if (cur.x === gx && cur.y === gy) {
      return reconstruct(key(gx, gy), sk);
    }

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      if (!passableFn(seed, nx, ny, infiniteCfg, balance)) continue;

      const nk = key(nx, ny);
      const step = (dx && dy) ? 1.41421356237 : 1;
      const tentativeG = cur.g + step;
      const oldG = gScore.get(nk);
      if (oldG == null || tentativeG < oldG) {
        parent.set(nk, cur.k);
        gScore.set(nk, tentativeG);

        const h = manhattan(nx, ny, gx, gy);
        const f = tentativeG + h;
        if (!openSet.has(nk)) push(nx, ny, tentativeG, f);
      }
    }
  }

  // fallback
  return linePath(passableFn, seed, sx, sy, gx, gy, infiniteCfg, balance, maxNodes);

  function reconstruct(goalK, startK) {
    const out = [{ x: gx, y: gy }];
    let k = goalK;
    while (k !== startK) {
      const pk = parent.get(k);
      if (!pk) break;
      k = pk;
      const p = pos.get(k);
      if (p) out.push({ x: p.x, y: p.y });
    }
    out.reverse();
    return out;
  }
}

function findNearestTile(seed, startTx, startTy, infiniteCfg, passableFn, balance, radius) {
  // BFS within square radius; returns closest passable by manhattan.
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

  // allow start/end even if on non-passable (hub might be on coast_cliff); snap to nearest land tile.
  const start = isLandPassable(seed, a.x, a.y, infiniteCfg, balance) ? a : findNearestTile(seed, a.x, a.y, infiniteCfg, isLandPassable, balance, 4) ?? a;
  const goal = isLandPassable(seed, b.x, b.y, infiniteCfg, balance) ? b : findNearestTile(seed, b.x, b.y, infiniteCfg, isLandPassable, balance, 4) ?? b;

  const path = findPath(isLandPassable, seed, start, goal, infiniteCfg, balance, {
    maxDistanceTiles: balance?.trade?.landMaxDistanceTiles ?? 200,
    maxNodes: balance?.trade?.landMaxNodes ?? 10000,
    marginTiles: balance?.trade?.landMarginTiles ?? 22,
  });

  // include hubs at endpoints for rendering
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

  // Compose segments
  const segs = [];
  segs.push({ mode: 'land', path: landA });
  segs.push({ mode: 'water', path: water });
  segs.push({ mode: 'land', path: landB });

  return { ok: true, segments: segs };
}
