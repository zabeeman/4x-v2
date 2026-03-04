// src/world/game/sim/effectEngine.js
import { dist } from './utils.js';
import { mapEffectTypeToStat } from './statMap.js';

const STACKING = Object.freeze({
  Stack: 'Stack',
  Max: 'Max',
  Min: 'Min',
  Unique: 'Unique',
});

const MODE_ORDER = Object.freeze(['SET', 'ADD', 'MUL']);

function getBuildingDefMap(state) {
  const defs = state?.gameData?.buildings ?? state?.data?.buildings ?? [];
  return new Map(defs.map((def) => [def.id, def]));
}

function normalizeStacking(stacking) {
  if (stacking === STACKING.Max || stacking === STACKING.Min || stacking === STACKING.Unique) return stacking;
  return STACKING.Stack;
}

function effectKey(effect) {
  return [
    effect.type,
    effect.mode,
    effect.scope,
    effect.radiusTiles ?? 0,
    effect.applyOnStart ? 1 : 0,
  ].join('|');
}

function shouldApplyScope(effect, sourceBuilding, targetCity) {
  if (effect.scope === 'Global') return true;
  if (effect.scope === 'City') return sourceBuilding?.cityId === targetCity?.id;
  if (effect.scope === 'Radius') {
    if (!sourceBuilding || !targetCity?.hub) return false;
    const r = effect.radiusTiles ?? effect.radius ?? 0;
    return dist(sourceBuilding.tx, sourceBuilding.ty, targetCity.hub.tx, targetCity.hub.ty) <= r;
  }
  return false;
}

export function collectActiveEffects(state, cityId) {
  const buildings = state?.buildings ?? [];
  const cities = state?.cities ?? [];
  const byId = new Map(cities.map((city) => [city.id, city]));
  const city = byId.get(cityId);
  if (!city) return [];

  const defMap = getBuildingDefMap(state);
  const effects = [];

  for (const building of buildings) {
    const def = defMap.get(building.typeId);
    if (!def?.effects?.length) continue;

    for (const rawEffect of def.effects) {
      const effect = {
        ...rawEffect,
        radiusTiles: rawEffect.radiusTiles ?? rawEffect.radius ?? 0,
        stacking: normalizeStacking(rawEffect.stacking),
      };

      if (!shouldApplyScope(effect, building, city)) continue;

      effects.push({ ...effect, sourceId: building.id, sourceTypeId: building.typeId });
    }
  }

  return effects;
}

export function stackEffects(effects) {
  const reduced = [];
  const uniqueSeen = new Set();
  const maxMap = new Map();
  const minMap = new Map();

  for (const effect of effects ?? []) {
    const stacking = normalizeStacking(effect?.stacking);
    if (stacking === STACKING.Stack) {
      reduced.push(effect);
      continue;
    }

    const key = effectKey(effect);
    if (stacking === STACKING.Unique) {
      if (uniqueSeen.has(key)) continue;
      uniqueSeen.add(key);
      reduced.push(effect);
      continue;
    }

    if (stacking === STACKING.Max) {
      const prev = maxMap.get(key);
      if (!prev || effect.value > prev.value) maxMap.set(key, effect);
      continue;
    }

    if (stacking === STACKING.Min) {
      const prev = minMap.get(key);
      if (!prev || effect.value < prev.value) minMap.set(key, effect);
    }
  }

  for (const e of maxMap.values()) reduced.push(e);
  for (const e of minMap.values()) reduced.push(e);

  return reduced;
}

export function applyEffects(baseStats, effects) {
  const stats = { ...baseStats };
  for (const mode of MODE_ORDER) {
    for (const effect of effects ?? []) {
      if (!effect || effect.mode !== mode) continue;
      const statKey = mapEffectTypeToStat(effect.type);
      if (!statKey) continue;

      const current = stats[statKey] ?? 0;
      if (mode === 'SET') {
        stats[statKey] = effect.value;
      } else if (mode === 'ADD') {
        stats[statKey] = current + effect.value;
      } else if (mode === 'MUL') {
        stats[statKey] = (stats[statKey] ?? 1) * effect.value;
      }
    }
  }
  return stats;
}
