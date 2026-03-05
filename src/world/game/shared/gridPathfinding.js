// src/world/game/shared/gridPathfinding.js
// Shared grid pathfinding helpers for gameplay systems.

export function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function makeKey(x, y) {
  return `${x},${y}`;
}

export function linePath(passableFn, sx, sy, gx, gy, maxNodes = 2000, includeStart = false) {
  const path = includeStart ? [{ x: sx, y: sy }] : [];

  let x0 = sx;
  let y0 = sy;
  const x1 = gx;
  const y1 = gy;

  let dx = Math.abs(x1 - x0);
  const sxn = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0);
  const syn = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sxn;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += syn;
    }

    if (!passableFn(x0, y0)) break;
    path.push({ x: x0, y: y0 });

    if (path.length > maxNodes) break;
  }

  return path;
}

export function aStarPath(start, goal, opts) {
  const {
    passableFn,
    maxNodes = 8000,
    maxDistance = 180,
    margin = 18,
    includeStart = false,
    blockedGoalFallback,
    directFallback,
  } = opts;

  const sx = start.x;
  const sy = start.y;
  const gx = goal.x;
  const gy = goal.y;

  if (sx === gx && sy === gy) return includeStart ? [{ x: sx, y: sy }] : [];

  if (typeof blockedGoalFallback === 'function' && !passableFn(gx, gy)) {
    const fallbackGoal = blockedGoalFallback(start, goal);
    if (!fallbackGoal) return includeStart ? [{ x: sx, y: sy }] : [];
    if (fallbackGoal.x === gx && fallbackGoal.y === gy) return includeStart ? [{ x: sx, y: sy }] : [];
    return aStarPath(start, fallbackGoal, {
      passableFn,
      maxNodes,
      maxDistance,
      margin,
      includeStart,
      blockedGoalFallback,
      directFallback,
    });
  }

  const dist0 = manhattan(sx, sy, gx, gy);
  if (dist0 > maxDistance) {
    if (typeof directFallback === 'function') return directFallback(start, goal);
    return linePath(passableFn, sx, sy, gx, gy, maxNodes, includeStart);
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
    const k = makeKey(x, y);
    open.push({ x, y, g, f, k });
    openSet.add(k);
    pos.set(k, { x, y });
  }

  function popBest() {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bi].f) bi = i;
    }
    const n = open[bi];
    const last = open.pop();
    if (bi < open.length) open[bi] = last;
    openSet.delete(n.k);
    return n;
  }

  const sk = makeKey(sx, sy);
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
      return reconstruct(makeKey(gx, gy), sk);
    }

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      if (!passableFn(nx, ny)) continue;

      const nk = makeKey(nx, ny);
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

  if (typeof directFallback === 'function') return directFallback(start, goal);
  return linePath(passableFn, sx, sy, gx, gy, maxNodes, includeStart);

  function reconstruct(goalK, startK) {
    const out = includeStart ? [{ x: gx, y: gy }] : [];
    let k = goalK;
    while (k !== startK) {
      const pk = parent.get(k);
      if (!pk) break;
      k = pk;
      const p = pos.get(k);
      if (!p) continue;
      if (includeStart || k !== startK) out.push({ x: p.x, y: p.y });
    }
    out.reverse();
    return out;
  }
}
