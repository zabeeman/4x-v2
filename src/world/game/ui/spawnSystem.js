// src/world/game/ui/spawnSystem.js
// Compatibility layer over spawnManager to avoid logic drift.

import {
  findSpawn,
  isValidSpawn,
  loadSpawnRegistry,
  addSpawnToRegistry,
  clearSpawnRegistry,
} from "./spawnManager.js";

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function clampSpawnMinDist(dist) {
  const d = Number(dist);
  if (!Number.isFinite(d)) return 200;
  return clamp(Math.floor(d), 200, 1000);
}

export function isValidSpawnTile(cfg, seed, tx, ty) {
  const gameCfg = {
    spawn: {
      disallowSurfaces: new Set(["shallow_water", "deep_water"]),
      disallowCliffs: true,
      maxSlope: cfg.spawnMaxSlope ?? 0.72,
    },
  };

  return isValidSpawn(seed, tx, ty, cfg, gameCfg);
}

export function findSafeSpawn(cfg, seed, attempt, existingSpawns, minDist) {
  const gameCfg = {
    spawn: {
      disallowSurfaces: new Set(["shallow_water", "deep_water"]),
      disallowCliffs: true,
      maxSlope: cfg.spawnMaxSlope ?? 0.72,
      attempts: Math.max(200, 500 + ((attempt | 0) * 120)),
      searchRadiusTiles: Math.max((minDist | 0) * 8, 2400),
    },
  };

  const safeDist = clampSpawnMinDist(minDist);
  return findSpawn(seed, cfg, gameCfg, existingSpawns ?? [], safeDist);
}

export function createSpawnRegistry(worldSeed) {
  const worldTag = worldSeed >>> 0;

  return {
    getAll() {
      return loadSpawnRegistry()
        .filter((p) => (p.w ?? worldTag) === worldTag)
        .map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) }));
    },
    addSpawn(p) {
      addSpawnToRegistry({ x: Math.floor(p.x), y: Math.floor(p.y), w: worldTag });
    },
    clear() {
      clearSpawnRegistry();
    },
    reload() {
      // no-op; load happens on each getAll() for compatibility
    },
  };
}
