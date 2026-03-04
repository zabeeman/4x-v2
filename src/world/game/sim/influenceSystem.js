// src/world/game/sim/influenceSystem.js
import { dist } from './utils.js';

export function computeCityInfluenceRadius(balance, cityStats, city) {
  const base = balance.influence?.baseRadiusTiles ?? 10;
  const perBuilding = balance.influence?.perBuildingTiles ?? 0.4;
  const perHubLevel = balance.influence?.perHubLevelTiles ?? 1.0;
  const hubLvl = city.hub?.level ?? 1;
  const flatInfluence = cityStats.flat?.Influence ?? 0;
  const statBonus = flatInfluence * (balance.influence?.perInfluenceStatTiles ?? 0.2);
  return base + perBuilding * city.buildings.length + perHubLevel * (hubLvl - 1) + statBonus;
}

export function estimateRouteSafety(state, cityA, cityB) {
  // Simple: sample a few points on straight segment and see if covered by any city influence.
  const steps = 6;
  let covered = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    const x = cityA.hub.tx + (cityB.hub.tx - cityA.hub.tx) * t;
    const y = cityA.hub.ty + (cityB.hub.ty - cityA.hub.ty) * t;

    let ok = false;
    for (const c of state.cities) {
      const rr = c.influenceRadiusTiles ?? 0;
      if (dist(x, y, c.hub.tx, c.hub.ty) <= rr) { ok = true; break; }
    }
    if (ok) covered++;
  }
  const frac = covered / steps;
  return 0.6 + 0.4 * frac;
}

export function estimateRouteSafetyFromPath(state, path) {
  if (!path || path.length === 0) return 0.6;
  // sample up to N points uniformly
  const steps = 10;
  let covered = 0;
  for (let i = 0; i < steps; i++) {
    const idx = Math.floor((i / (steps - 1)) * (path.length - 1));
    const p = path[idx];
    let ok = false;
    for (const c of state.cities) {
      const rr = c.influenceRadiusTiles ?? 0;
      if (dist(p.x, p.y, c.hub.tx, c.hub.ty) <= rr) { ok = true; break; }
    }
    if (ok) covered++;
  }
  const frac = covered / steps;
  return 0.6 + 0.4 * frac;
}

export function influenceStrengthAt(state, tx, ty) {
  // 0..1, max over cities of (1 - d/r)
  let best = 0;
  for (const c of state.cities) {
    const r = c.influenceRadiusTiles ?? 0;
    if (r <= 0) continue;
    const d = dist(tx, ty, c.hub.tx, c.hub.ty);
    const t = 1 - (d / r);
    if (t > best) best = t;
  }
  return Math.max(0, Math.min(1, best));
}
