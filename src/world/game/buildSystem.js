// src/world/game/buildSystem.js
import { sampleHM } from "../infinite/terrainSampler.js";

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function isLandSurface(surface) {
  return surface !== "shallow_water" && surface !== "deep_water";
}

export function createBuildSystem(cfg, worldSeed) {
  const seed = worldSeed >>> 0;

  const buildings = []; // { id, type, x, y, buildRadius }
  const zones = [];     // { x, y, r }

  let nextId = 1;
  let spawn = null; // {x,y}

  function isLandTile(tx, ty) {
    const s = sampleHM(seed, tx, ty, cfg);
    if (!isLandSurface(s.surface)) return false;
    if (s.surface === "coast_cliff") return false;
    const maxSlope = cfg.buildMaxSlope ?? 0.82;
    if ((s.slope ?? 0) > maxSlope) return false;
    return true;
  }

  function setSpawn(tx, ty, firstBuildRadius = 10) {
    spawn = { x: tx, y: ty, r: firstBuildRadius };
    // first build zone around spawn
    zones.length = 0;
    zones.push({ x: tx, y: ty, r: firstBuildRadius });
  }

  function addBuildZone(tx, ty, r = 5) {
    zones.push({ x: tx, y: ty, r });
  }

  function isInAnyZone(tx, ty) {
    for (const z of zones) {
      if (dist2(tx, ty, z.x, z.y) <= z.r * z.r) return true;
    }
    return false;
  }

  function isOccupied(tx, ty) {
    return buildings.some((b) => b.x === tx && b.y === ty);
  }

  function canPlace(type, tx, ty) {
    if (!spawn) return false;
    if (!isLandTile(tx, ty)) return false;
    if (isOccupied(tx, ty)) return false;

    // First building: must be within radius 10 of spawn
    if (buildings.length === 0 && type === "house1") {
      const r = spawn.r ?? 10;
      return dist2(tx, ty, spawn.x, spawn.y) <= r * r;
    }

    // Other buildings: must be in any build zone
    return isInAnyZone(tx, ty);
  }

  function place(type, tx, ty) {
    if (!canPlace(type, tx, ty)) return null;

    const buildRadius = (type === "house1") ? (cfg.house1BuildRadius ?? 5) : 5;

    const b = { id: nextId++, type, x: tx, y: ty, buildRadius };
    buildings.push(b);

    // Each building expands buildable area
    addBuildZone(tx, ty, Math.max(5, buildRadius));

    return b;
  }

  return {
    buildings,
    zones,
    setSpawn,
    canPlace,
    place,
    isLandTile,
    isInAnyZone,
  };
}
