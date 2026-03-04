// src/world/game/sim/buildZoneSystem.js

function manhattan(tx, ty, sx, sy) {
  return Math.abs(tx - sx) + Math.abs(ty - sy);
}

function compareCityId(a, b) {
  if (a === b) return 0;
  return String(a) < String(b) ? -1 : 1;
}

function resolveCandidateForCity(tx, ty, sources, cityId) {
  let minDist = Infinity;
  let bestPriority = -Infinity;

  for (const s of sources) {
    if (s.cityId !== cityId) continue;
    const d = manhattan(tx, ty, s.tx, s.ty);
    if (d < minDist) {
      minDist = d;
      bestPriority = s.priority ?? 0;
    } else if (d === minDist) {
      bestPriority = Math.max(bestPriority, s.priority ?? 0);
    }
  }

  if (!Number.isFinite(minDist)) return null;
  return {
    cityId,
    dist: minDist,
    priority: Number.isFinite(bestPriority) ? bestPriority : 0,
  };
}

// Resolves build-zone owner only inside covered union.
// Rules:
// 1) min Manhattan to nearest zone source (per city)
// 2) tie -> max source priority
// 3) tie -> min cityId (lexicographic)
export function resolveBuildZoneOwnerMeta(tx, ty, zoneSources) {
  if (!zoneSources || zoneSources.length === 0) return null;

  const covered = [];
  for (const s of zoneSources) {
    const r = s.rTiles ?? 0;
    if (r <= 0) continue;
    const dx = tx - s.tx;
    const dy = ty - s.ty;
    if (dx * dx + dy * dy <= r * r) covered.push(s);
  }

  if (covered.length === 0) return null;

  const cityIds = new Set(covered.map((s) => s.cityId).filter(Boolean));

  let best = null;
  for (const cityId of cityIds) {
    const cand = resolveCandidateForCity(tx, ty, covered, cityId);
    if (!cand) continue;

    if (!best) {
      best = cand;
      continue;
    }

    if (cand.dist < best.dist) {
      best = cand;
      continue;
    }
    if (cand.dist > best.dist) continue;

    if (cand.priority > best.priority) {
      best = cand;
      continue;
    }
    if (cand.priority < best.priority) continue;

    if (compareCityId(cand.cityId, best.cityId) < 0) best = cand;
  }

  return best;
}

export function resolveBuildZoneOwner(tx, ty, zoneSources) {
  return resolveBuildZoneOwnerMeta(tx, ty, zoneSources)?.cityId ?? null;
}
