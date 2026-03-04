// src/world/game/pathfinding.js
import { sampleHM } from "../infinite/terrainSampler.js";

function manhattan(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }

export function isPassableTile(seed, tx, ty, infiniteCfg, gameCfg) {
  const s = sampleHM(seed, tx, ty, infiniteCfg);
  if (gameCfg.units.disallowSurfaces.has(s.surface)) return false;
  if ((s.slope ?? 0) > gameCfg.units.maxSlope) return false;
  return true;
}

// Straight-line stepping (Bresenham-ish) with early stop.
// Returns path excluding start tile, including last reachable tile.
export function linePath(seed, sx, sy, gx, gy, infiniteCfg, gameCfg) {
  const path = [];
  let x0 = sx, y0 = sy, x1 = gx, y1 = gy;
  let dx = Math.abs(x1 - x0), sxn = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0), syn = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sxn; }
    if (e2 <= dx) { err += dx; y0 += syn; }

    if (!isPassableTile(seed, x0, y0, infiniteCfg, gameCfg)) break;
    path.push({ x: x0, y: y0 });

    if (path.length > gameCfg.units.aStarMaxNodes) break;
  }
  return path;
}

// A* on a bounded box around start-goal with margin.
// Returns path excluding start tile, including goal tile if reachable.
export function findPath(seed, start, goal, infiniteCfg, gameCfg) {
  const sx = start.x, sy = start.y, gx = goal.x, gy = goal.y;
  if (sx === gx && sy === gy) return [];

  // if target blocked -> try nearby
  if (!isPassableTile(seed, gx, gy, infiniteCfg, gameCfg)) {
    let best = null;
    let bestD = Infinity;
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = gx + dx, ny = gy + dy;
        if (!isPassableTile(seed, nx, ny, infiniteCfg, gameCfg)) continue;
        const d = manhattan(sx, sy, nx, ny);
        if (d < bestD) { bestD = d; best = { x: nx, y: ny }; }
      }
    }
    if (best) return findPath(seed, start, best, infiniteCfg, gameCfg);
    return [];
  }

  const dist = manhattan(sx, sy, gx, gy);
  if (dist > gameCfg.units.aStarMaxDistanceTiles) {
    const lp = linePath(seed, sx, sy, gx, gy, infiniteCfg, gameCfg);
    if (lp.length) return lp;
  }

  const margin = gameCfg.units.aStarMarginTiles;
  const minX = Math.min(sx, gx) - margin;
  const maxX = Math.max(sx, gx) + margin;
  const minY = Math.min(sy, gy) - margin;
  const maxY = Math.max(sy, gy) + margin;

  const open = [];
  const openSet = new Set(); // key string
  const gScore = new Map(); // k -> g
  const parent = new Map(); // k -> parentK
  const pos = new Map(); // k -> {x,y}

  const key = (x, y) => `${x},${y}`;

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
  push(sx, sy, 0, dist);

  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  let expanded = 0;
  while (open.length) {
    const cur = popBest();
    expanded++;
    if (expanded > gameCfg.units.aStarMaxNodes) break;

    if (cur.x === gx && cur.y === gy) {
      return reconstruct(key(gx, gy), sk);
    }

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      if (!isPassableTile(seed, nx, ny, infiniteCfg, gameCfg)) continue;

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
  return linePath(seed, sx, sy, gx, gy, infiniteCfg, gameCfg);

  function reconstruct(goalK, startK) {
    const out = [];
    let k = goalK;
    while (k !== startK) {
      const p = pos.get(k);
      if (p) out.push({ x: p.x, y: p.y });
      const pk = parent.get(k);
      if (!pk) break;
      k = pk;
    }
    out.reverse();
    return out;
  }
}
