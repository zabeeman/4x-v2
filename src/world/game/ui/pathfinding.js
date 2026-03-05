// src/world/game/ui/pathfinding.js
import { sampleHM } from "../../infinite/terrainSampler.js";
import { aStarPath, linePath as sharedLinePath, manhattan } from "../shared/gridPathfinding.js";

export function isPassableTile(seed, tx, ty, infiniteCfg, gameCfg) {
  const s = sampleHM(seed, tx, ty, infiniteCfg);
  if (gameCfg.units.disallowSurfaces.has(s.surface)) return false;
  if ((s.slope ?? 0) > gameCfg.units.maxSlope) return false;
  return true;
}

// Straight-line stepping (Bresenham-ish) with early stop.
// Returns path excluding start tile, including last reachable tile.
export function linePath(seed, sx, sy, gx, gy, infiniteCfg, gameCfg) {
  return sharedLinePath(
    (x, y) => isPassableTile(seed, x, y, infiniteCfg, gameCfg),
    sx,
    sy,
    gx,
    gy,
    gameCfg.units.aStarMaxNodes,
    false,
  );
}

// A* on a bounded box around start-goal with margin.
// Returns path excluding start tile, including goal tile if reachable.
export function findPath(seed, start, goal, infiniteCfg, gameCfg) {
  const blockedGoalFallback = (s, g) => {
    let best = null;
    let bestD = Infinity;
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = g.x + dx;
          const ny = g.y + dy;
          if (!isPassableTile(seed, nx, ny, infiniteCfg, gameCfg)) continue;
          const d = manhattan(s.x, s.y, nx, ny);
          if (d < bestD) {
            bestD = d;
            best = { x: nx, y: ny };
          }
        }
      }
    }
    return best;
  };

  return aStarPath(start, goal, {
    passableFn: (x, y) => isPassableTile(seed, x, y, infiniteCfg, gameCfg),
    maxNodes: gameCfg.units.aStarMaxNodes,
    maxDistance: gameCfg.units.aStarMaxDistanceTiles,
    margin: gameCfg.units.aStarMarginTiles,
    includeStart: false,
    blockedGoalFallback,
    directFallback: (s, g) => linePath(seed, s.x, s.y, g.x, g.y, infiniteCfg, gameCfg),
  });
}
