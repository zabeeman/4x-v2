// src/world/game/ui/spawnManager.js
import { sampleHM } from "../../infinite/terrainSampler.js";

function hash01(seed, x, y) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed >>> 0, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return (n >>> 0) / 4294967296;
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export function isValidSpawn(seed, tx, ty, infiniteCfg, gameCfg) {
  const s = sampleHM(seed, tx, ty, infiniteCfg);
  if (gameCfg.spawn.disallowSurfaces.has(s.surface)) return false;
  if (gameCfg.spawn.disallowCliffs && s.surface === "coast_cliff") return false;
  if ((s.slope ?? 0) > gameCfg.spawn.maxSlope) return false;
  return true;
}

export function findSpawn(seed, infiniteCfg, gameCfg, otherSpawns, safeDistTiles) {
  const attempts = gameCfg.spawn.attempts;
  const R = gameCfg.spawn.searchRadiusTiles;
  const minD2 = safeDistTiles * safeDistTiles;

  for (let i = 0; i < attempts; i++) {
    // pick candidate in a disk-ish area
    const a = hash01(seed + 11, i, 0) * Math.PI * 2;
    const rr = Math.sqrt(hash01(seed + 17, i, 0)) * R;
    const tx = Math.floor(Math.cos(a) * rr);
    const ty = Math.floor(Math.sin(a) * rr);

    if (!isValidSpawn(seed, tx, ty, infiniteCfg, gameCfg)) continue;

    let ok = true;
    for (const p of otherSpawns) {
      if (dist2(tx, ty, p.x, p.y) < minD2) { ok = false; break; }
    }
    if (!ok) continue;

    return { x: tx, y: ty };
  }

  // fallback: search spiral around origin
  for (let r = 0; r <= R; r += 8) {
    for (let t = 0; t < 64; t++) {
      const a = (t / 64) * Math.PI * 2;
      const tx = Math.floor(Math.cos(a) * r);
      const ty = Math.floor(Math.sin(a) * r);
      if (!isValidSpawn(seed, tx, ty, infiniteCfg, gameCfg)) continue;
      let ok = true;
      for (const p of otherSpawns) {
        if (dist2(tx, ty, p.x, p.y) < minD2) { ok = false; break; }
      }
      if (ok) return { x: tx, y: ty };
    }
  }

  // worst-case: origin
  return { x: 0, y: 0 };
}

// Simple "registry" of spawns for local multi-tab testing.
// In real multiplayer this must be server-side.
const LS_KEY = "ANDREI_PROJ_SPAWNS_V1";

export function loadSpawnRegistry() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0, 2000);
  } catch {
    return [];
  }
}

export function addSpawnToRegistry(p) {
  const arr = loadSpawnRegistry();
  arr.push({ x: p.x, y: p.y, t: Date.now(), w: Number.isFinite(p.w) ? (p.w >>> 0) : undefined });
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch {}
}

export function clearSpawnRegistry() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}
