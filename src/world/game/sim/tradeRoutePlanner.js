// src/world/game/sim/tradeRoutePlanner.js
// Validates manual trade routes by land/water using a bounded A*.

import { sampleHM } from '../../infinite/terrainSampler.js';
import { dist, dist2 } from './utils.js';

const WATER = new Set(['shallow_water', 'deep_water']);

function isLandPassable(seed, tx, ty, infiniteCfg, balance) {
  const s = sampleHM(seed, tx, ty, infiniteCfg);
  if (WATER.has(s.surface)) return false;
  if (s.surface === 'coast_cliff') return false;
  const maxSlope = balance.trade?.landMaxSlope ?? balance.building?.maxSlope ?? 0.78;
  if ((s.slope ?? 0) > maxSlope) return false;
  return true;
}

function isWaterPassable(seed, tx, ty, infiniteCfg) {
  const s = sampleHM(seed, tx, ty, infiniteCfg);
  // allow beach as transitional tile
  return WATER.has(s.surface) || s.surface === 'beach';
}

function nearestAround(seed, tx, ty, infiniteCfg, pred, maxR = 3) {
  if (pred(seed, tx, ty, infiniteCfg)) return { tx, ty };
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (pred(seed, nx, ny, infiniteCfg)) return { tx: nx, ty: ny };
      }
    }
  }
  return null;
}

function aStar(seed, infiniteCfg, start, goal, passable, maxNodes, margin) {
  const sx = start.tx, sy = start.ty, gx = goal.tx, gy = goal.ty;
  if (sx === gx && sy === gy) return [];

  const minX = Math.min(sx, gx) - margin;
  const maxX = Math.max(sx, gx) + margin;
  const minY = Math.min(sy, gy) - margin;
  const maxY = Math.max(sy, gy) + margin;

  const key = (x, y) => `${x},${y}`;
  const open = [];
  const openSet = new Set();
  const gScore = new Map();
  const parent = new Map();
  const pos = new Map();

  function manhattan(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }

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
  push(sx, sy, 0, manhattan(sx, sy, gx, gy));

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
      if (!passable(seed, nx, ny, infiniteCfg)) continue;

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

  return null;

  function reconstruct(goalK, startK) {
    const out = [];
    let k = goalK;
    while (k !== startK) {
      const p = pos.get(k);
      if (p) out.push({ tx: p.x, ty: p.y });
      const pk = parent.get(k);
      if (!pk) break;
      k = pk;
    }
    out.reverse();
    return out;
  }
}

export function validateTradePath(seed, infiniteCfg, balance, hubA, hubB, mode) {
  const d = dist(hubA.tx, hubA.ty, hubB.tx, hubB.ty);
  const maxD = balance.trade?.manualMaxDistanceTiles ?? 140;
  if (d > maxD) return { ok: false, reason: 'too_far', path: null };

  const maxNodes = balance.trade?.pathMaxNodes ?? 4000;
  const margin = balance.trade?.pathMarginTiles ?? 12;
  const portR = balance.trade?.portSearchRadiusTiles ?? 3;

  if (mode === 'water') {
    const aW = nearestAround(seed, hubA.tx, hubA.ty, infiniteCfg, isWaterPassable, portR);
    const bW = nearestAround(seed, hubB.tx, hubB.ty, infiniteCfg, isWaterPassable, portR);
    if (!aW || !bW) return { ok: false, reason: 'no_port', path: null };

    const path = aStar(seed, infiniteCfg, aW, bW, isWaterPassable, maxNodes, margin);
    if (!path) return { ok: false, reason: 'no_path', path: null };

    // include endpoints for visualization, with hub connectors
    const out = [{ tx: hubA.tx, ty: hubA.ty }, aW, ...path, bW, { tx: hubB.tx, ty: hubB.ty }];
    return { ok: true, path: out };
  }

  // land
  // if start or goal is not land-passable, still allow (hub tile can be on land always)
  const pass = (sd, x, y, cfg) => isLandPassable(sd, x, y, cfg, balance);
  if (!pass(seed, hubA.tx, hubA.ty, infiniteCfg) || !pass(seed, hubB.tx, hubB.ty, infiniteCfg)) {
    // very defensive; if hubs on coast cliff etc
  }

  const path = aStar(seed, infiniteCfg, hubA, hubB, pass, maxNodes, margin);
  if (!path) return { ok: false, reason: 'no_path', path: null };
  const out = [{ tx: hubA.tx, ty: hubA.ty }, ...path, { tx: hubB.tx, ty: hubB.ty }];
  return { ok: true, path: out };
}
