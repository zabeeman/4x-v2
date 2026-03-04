// src/world/game/sim/statsSystem.js

export const StatId = {
  GoldPerMinPct: 'GoldPerMinPct',
  HappinessPct: 'HappinessPct',
  ResearchPerMinPct: 'ResearchPerMinPct',
  ResourceYieldPct: 'ResourceYieldPct',
  BuildSpeedPct: 'BuildSpeedPct',
  TrainSpeedPct: 'TrainSpeedPct',
  TradeShipSpeedPct: 'TradeShipSpeedPct',
  TradeRadiusPct: 'TradeRadiusPct',
  CostCoeffPct: 'CostCoeffPct',
  LandPowerPct: 'LandPowerPct',
  NavalPowerPct: 'NavalPowerPct',
  DiplomacyPct: 'DiplomacyPct',
  ScienceLevelPct: 'ScienceLevelPct',
  // flat
  TradeSlots: 'TradeSlots',
  PopCap: 'PopCap',
  Influence: 'Influence',
  Stability: 'Stability',
  Corruption: 'Corruption',
  WarWeariness: 'WarWeariness',
};

export function createBaseStats() {
  return {
    pct: {
      [StatId.GoldPerMinPct]: 1,
      [StatId.HappinessPct]: 1,
      [StatId.ResearchPerMinPct]: 1,
      [StatId.ResourceYieldPct]: 1,
      [StatId.BuildSpeedPct]: 1,
      [StatId.TrainSpeedPct]: 1,
      [StatId.TradeShipSpeedPct]: 1,
      [StatId.TradeRadiusPct]: 1,
      [StatId.CostCoeffPct]: 1,
      [StatId.LandPowerPct]: 1,
      [StatId.NavalPowerPct]: 1,
      [StatId.DiplomacyPct]: 1,
      [StatId.ScienceLevelPct]: 1,
    },
    flat: {
      [StatId.TradeSlots]: 1,
      [StatId.PopCap]: 10,
      [StatId.Influence]: 0,
      [StatId.Stability]: 0,
      [StatId.Corruption]: 0,
      [StatId.WarWeariness]: 0,
    },
    breakdown: {},
  };
}

function ensureBreakdown(stats, statKey) {
  if (!stats.breakdown[statKey]) stats.breakdown[statKey] = [];
  return stats.breakdown[statKey];
}

export function applyMod(stats, mod, sourceLabel) {
  // mod: { stat, type: 'AddPct'|'Mul'|'AddFlat', value }
  if (!mod || !mod.stat) return;
  const s = mod.stat;

  if (mod.type === 'AddFlat') {
    stats.flat[s] = (stats.flat[s] ?? 0) + mod.value;
    ensureBreakdown(stats, s).push({ source: sourceLabel, type: mod.type, value: mod.value });
    return;
  }

  // pct
  stats.pct[s] = stats.pct[s] ?? 1;
  if (mod.type === 'Mul') {
    stats.pct[s] *= mod.value;
  } else {
    // AddPct
    stats.pct[s] *= (1 + mod.value);
  }
  ensureBreakdown(stats, s).push({ source: sourceLabel, type: mod.type, value: mod.value });
}

export function computeCityStats(gameData, city, state) {
  const stats = createBaseStats();

  // Government mods (global)
  const gov = gameData.governments.find(g => g.id === state.governmentId);
  if (gov?.mods) {
    for (const m of gov.mods) applyMod(stats, m, `Gov:${gov.id}`);
  }

  // Doctrines (global)
  for (const dId of state.selectedDoctrines) {
    const d = gameData.doctrines.find(x => x.id === dId);
    if (!d) continue;
    if (d.mods) for (const m of d.mods) applyMod(stats, m, `Doc:${d.id}`);
  }

  // Hub level scaling (simple per-building count)
  const hub = city.hub;
  if (hub) {
    const perLevel = gameData.balance.centerMainStatAddPctPerLevel ?? 0.0075;
    const mainStats = gameData.balance.mainPctStats ?? Object.keys(stats.pct);
    for (let lvl = 0; lvl < (hub.level ?? 1); lvl++) {
      for (const sid of mainStats) {
        applyMod(stats, { stat: sid, type: 'AddPct', value: perLevel }, `Hub:${hub.typeId}@${lvl+1}`);
      }
    }
  }

  // Buildings mods (city-local)
  for (const b of city.buildings) {
    const def = gameData.buildings.find(x => x.id === b.typeId);
    if (!def?.mods) continue;
    for (const m of def.mods) applyMod(stats, m, `Bld:${def.id}`);
  }

  return stats;
}
