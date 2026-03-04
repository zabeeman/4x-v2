// src/world/game/sim/statMap.js

export const EFFECT_TO_STAT = Object.freeze({
  IncomeGold: 'IncomeGoldPerMin',
  PopCap: 'PopCap',
  Happiness: 'Happiness',
  Corruption: 'Corruption',
  Crime: 'Crime',
  TradeCapacity: 'TradeCapacity',
  BuildSpeed: 'BuildSpeedMul',
  RecruitSpeed: 'RecruitSpeedMul',
});

export function mapEffectTypeToStat(effectType) {
  return EFFECT_TO_STAT[effectType] ?? null;
}
