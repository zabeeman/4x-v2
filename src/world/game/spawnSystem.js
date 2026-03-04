// src/world/game/spawnSystem.js
import { sampleHM } from "../infinite/terrainSampler.js";

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Small fast seeded RNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedMix(base, attempt) {
  // attempt -> scramble
  const m = Math.imul((attempt + 1) >>> 0, 0x9E3779B1);
  return (base ^ m) >>> 0;
}

export function clampSpawnMinDist(dist) {
  const d = Number(dist);
  if (!Number.isFinite(d)) return 200;
  return clamp(Math.floor(d), 200, 1000);
}

function isLandSurface(surface) {
  return surface !== "shallow_water" && surface !== "deep_water";
}

export function isValidSpawnTile(cfg, seed, tx, ty) {
  const s = sampleHM(seed, tx, ty, cfg);
  if (!isLandSurface(s.surface)) return false;

  // Avoid steep coastal cliffs and too steep slopes for nicer start
  if (s.surface === "coast_cliff") return false;
  const maxSlope = cfg.spawnMaxSlope ?? 0.72;
  if ((s.slope ?? 0) > maxSlope) return false;

  return true;
}

export function findSafeSpawn(cfg, seed, attempt, existingSpawns, minDist) {
  const rng = mulberry32(seedMix(seed >>> 0, attempt | 0));
  const minD2 = (minDist | 0) * (minDist | 0);

  // Start search range: big enough, then expand.
  let range = Math.max(minDist * 6, 2400);

  for (let pass = 0; pass < 6; pass++) {
    const tries = 1600;
    for (let i = 0; i < tries; i++) {
      // symmetric square around origin; for infinite world this is fine for now
      const tx = Math.floor((rng() * 2 - 1) * range);
      const ty = Math.floor((rng() * 2 - 1) * range);

      if (!isValidSpawnTile(cfg, seed, tx, ty)) continue;

      let ok = true;
      for (const p of existingSpawns) {
        const dx = tx - p.x;
        const dy = ty - p.y;
        if (dx * dx + dy * dy < minD2) { ok = false; break; }
      }
      if (!ok) continue;

      return { x: tx, y: ty };
    }

    range *= 2;
  }

  // Fallback: spiral-ish local scan around origin
  let r = 0;
  while (r < 20000) {
    for (let x = -r; x <= r; x++) {
      const y1 = -r, y2 = r;
      if (isValidSpawnTile(cfg, seed, x, y1)) return { x, y: y1 };
      if (isValidSpawnTile(cfg, seed, x, y2)) return { x, y: y2 };
    }
    for (let y = -r + 1; y <= r - 1; y++) {
      const x1 = -r, x2 = r;
      if (isValidSpawnTile(cfg, seed, x1, y)) return { x: x1, y };
      if (isValidSpawnTile(cfg, seed, x2, y)) return { x: x2, y };
    }
    r += 25;
  }

  // Absolute last resort
  return { x: 0, y: 0 };
}

// --- LocalStorage-backed spawn registry (simple multiplayer simulation) ---

export function createSpawnRegistry(worldSeed) {
  const lsKey = `spawns_${worldSeed >>> 0}`;

  function load() {
    try {
      const raw = localStorage.getItem(lsKey);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
        .map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) }));
    } catch {
      return [];
    }
  }

  function save(list) {
    try { localStorage.setItem(lsKey, JSON.stringify(list)); } catch { /* ignore */ }
  }

  let spawns = load();

  return {
    getAll() { return spawns.slice(); },
    addSpawn(p) {
      const x = Math.floor(p.x), y = Math.floor(p.y);
      if (!spawns.some((s) => s.x === x && s.y === y)) {
        spawns.push({ x, y });
        save(spawns);
      }
    },
    clear() {
      spawns = [];
      try { localStorage.removeItem(lsKey); } catch { /* ignore */ }
    },
    reload() {
      spawns = load();
    },
  };
}
