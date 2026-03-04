// src/world/game/sim/defaultGameData.js
import { StatId } from './statsSystem.js';
import { BUILDINGS as BUILDING_DEFINITIONS } from './buildingCatalog.js';

export function createDefaultGameData(gameCfg) {
  const disallowSurfacesArray = Array.from(gameCfg?.building?.disallowSurfaces ?? []);

  const balance = {
    tickMs: 250,

    building: {
      maxSlope: gameCfg?.building?.maxSlope ?? 0.78,
      disallowSurfacesSet: new Set(disallowSurfacesArray),
    },

    district: {
      firstBuildRadiusTiles: gameCfg?.building?.firstBuildRadiusTiles ?? 10,
      // Build area is the UNION of individual "build zones" around each building.
      // These are default radii (per building can override via `buildAreaRadiusTiles`).
      defaultBuildAreaRadiusTiles: 6,
      hubBuildAreaRadiusTiles: 8,
      minHubDistanceTiles: 14,
      borderBufferTiles: 2,
      allowNewHubOnlyInsideAnyBuildArea: true,
    },

    influence: {
      baseRadiusTiles: 10,
      perBuildingTiles: 0.35,
      perHubLevelTiles: 1.1,
      perInfluenceStatTiles: 0.25,
    },

    trade: {
      autoEnabled: true,
      baseRadiusTiles: 42,
      baseGoldPerMin: 1.2,
      maxRoutesPerCity: 2,
      distanceDiv: 55,

      // manual route specifics
      portSearchRadiusTiles: 6,
      landMaxDistanceTiles: 220,
      landMaxNodes: 10000,
      landMarginTiles: 22,
      waterMaxDistanceTiles: 240,
      waterMaxNodes: 12000,
      waterMarginTiles: 26,

      waterIncomeMul: 1.10,
      landIncomeMul: 1.0,
    },

    resources: {
      extractorMinDistanceTiles: {
        wood: 6,
        metal: 7,
        marble: 7,
        glass: 6,
        powder: 7,
      },
    },

    baseGoldPerMin: 1.8,
    baseResearchPerMin: 0.5,

    minIncomePerMin: {
      gold: 1.2,
      research: 0.0,
    },

    startingResources: {
      gold: 60,
      wood: 40,
      metal: 10,
      marble: 0,
      glass: 0,
      powder: 0,
      research: 0,
    },

    demolishRefundRatio: 0.5,

    cheats: {
      infiniteValue: 999999,
    },

    defaultGovernmentId: 'default',

    centerMainStatAddPctPerLevel: 0.0075,
    mainPctStats: [
      StatId.GoldPerMinPct,
      StatId.HappinessPct,
      StatId.ResearchPerMinPct,
      StatId.ResourceYieldPct,
      StatId.BuildSpeedPct,
      StatId.TrainSpeedPct,
      StatId.TradeShipSpeedPct,
      StatId.TradeRadiusPct,
    ],
  };

  const buildings = [
    {
      id: 'house_1',
      name: 'Дом-1',
      isStarter: true,
      isHub: true,
      buildAreaRadiusTiles: 8,
      cost: { wood: 0, metal: 0, marble: 0, glass: 0, powder: 0, gold: 0 },
      upkeep: { goldPerMin: 0 },
      fogRevealRadiusTiles: gameCfg?.fog?.buildingRevealRadiusTiles ?? 35,
      mods: [
        { stat: StatId.TradeSlots, type: 'AddFlat', value: 1 },
        { stat: StatId.PopCap, type: 'AddFlat', value: 10 },
      ],
    },
    {
      id: 'city_hall',
      name: 'Главное здание',
      isStarter: false,
      isHub: true,
      buildAreaRadiusTiles: 8,
      cost: { wood: 120, metal: 40, marble: 10, glass: 0, powder: 0, gold: 50 },
      upkeep: { goldPerMin: 0.4 },
      fogRevealRadiusTiles: gameCfg?.fog?.buildingRevealRadiusTiles ?? 35,
      mods: [
        { stat: StatId.TradeSlots, type: 'AddFlat', value: 1 },
        { stat: StatId.PopCap, type: 'AddFlat', value: 10 },
        { stat: StatId.Influence, type: 'AddFlat', value: 3 },
      ],
    },

    // Build-area expander (can be placed on ANY surface, including water)
    {
      id: 'outpost',
      name: 'Пост расширения',
      buildAreaRadiusTiles: 7,
      cost: { wood: 35, metal: 5, marble: 0, glass: 0, powder: 0, gold: 8 },
      upkeep: { goldPerMin: 0.06 },
      desc: 'Расширяет зону строительства вокруг себя. Можно ставить где угодно.',
      placeRules: { allowAnySurface: true, ignoreSlope: true },
      fogRevealRadiusTiles: gameCfg?.fog?.buildingRevealRadiusTiles ?? 35,
      mods: [
        { stat: StatId.Influence, type: 'AddFlat', value: 1 },
      ],
    },

    // Residential
    {
      id: 'house',
      name: 'Жилой дом',
      buildAreaRadiusTiles: 6,
      cost: { wood: 25, metal: 0, marble: 0, glass: 0, powder: 0, gold: 6 },
      upkeep: { goldPerMin: 0.04 },
      placeRules: { allowedSurfaces: ['land', 'forest'] },
      mods: [
        { stat: StatId.PopCap, type: 'AddFlat', value: 8 },
        { stat: StatId.HappinessPct, type: 'AddPct', value: 0.02 },
      ],
    },
    {
      id: 'res_block',
      name: 'Жилой квартал',
      buildAreaRadiusTiles: 6,
      cost: { wood: 70, metal: 10, marble: 0, glass: 0, powder: 0, gold: 15 },
      upkeep: { goldPerMin: 0.12 },
      placeRules: { allowedSurfaces: ['land'] },
      mods: [
        { stat: StatId.PopCap, type: 'AddFlat', value: 22 },
        { stat: StatId.HappinessPct, type: 'AddPct', value: 0.03 },
        { stat: StatId.Corruption, type: 'AddFlat', value: 1 },
      ],
    },

    // Admin / economy
    {
      id: 'bank',
      name: 'Банк',
      buildAreaRadiusTiles: 6,
      cost: { wood: 80, metal: 20, marble: 0, glass: 0, powder: 0, gold: 30 },
      upkeep: { goldPerMin: 0.3 },
      mods: [
        { stat: StatId.GoldPerMinPct, type: 'AddPct', value: 0.06 },
        { stat: StatId.CostCoeffPct, type: 'AddPct', value: -0.02 },
      ],
    },
    {
      id: 'academy',
      name: 'Академия',
      buildAreaRadiusTiles: 6,
      cost: { wood: 80, metal: 30, marble: 10, glass: 0, powder: 0, gold: 20 },
      upkeep: { goldPerMin: 0.25 },
      mods: [
        { stat: StatId.ResearchPerMinPct, type: 'AddPct', value: 0.09 },
        { stat: StatId.ScienceLevelPct, type: 'AddPct', value: 0.06 },
      ],
    },
    {
      id: 'trade_guild',
      name: 'Торговая палата',
      buildAreaRadiusTiles: 6,
      cost: { wood: 60, metal: 25, marble: 0, glass: 0, powder: 0, gold: 15 },
      upkeep: { goldPerMin: 0.2 },
      mods: [
        { stat: StatId.TradeSlots, type: 'AddFlat', value: 1 },
        { stat: StatId.TradeRadiusPct, type: 'AddPct', value: 0.06 },
      ],
    },

    // Extractors (surface constraints match current terrainSampler surfaces)
    {
      id: 'lumber_camp',
      name: 'Лесозаготовка',
      buildAreaRadiusTiles: 5,
      cost: { wood: 20, metal: 0, marble: 0, glass: 0, powder: 0, gold: 5 },
      upkeep: { goldPerMin: 0.05 },
      placeRules: { allowedSurfaces: ['forest'], showPlacementHint: true, allowOutsideBuildAreaWithinTiles: 200 },
      extract: { resource: 'wood', basePerMin: 0.9 },
    },
    {
      id: 'mine',
      name: 'Рудник',
      buildAreaRadiusTiles: 5,
      cost: { wood: 30, metal: 10, marble: 0, glass: 0, powder: 0, gold: 8 },
      upkeep: { goldPerMin: 0.08 },
      placeRules: { allowedSurfaces: ['rock', 'coast_cliff', 'snow'], showPlacementHint: true, allowOutsideBuildAreaWithinTiles: 200 },
      extract: { resource: 'metal', basePerMin: 0.7 },
    },
    {
      id: 'quarry',
      name: 'Каменоломня',
      buildAreaRadiusTiles: 5,
      cost: { wood: 30, metal: 10, marble: 0, glass: 0, powder: 0, gold: 8 },
      upkeep: { goldPerMin: 0.08 },
      placeRules: { allowedSurfaces: ['rock', 'coast_cliff'], showPlacementHint: true, allowOutsideBuildAreaWithinTiles: 200 },
      extract: { resource: 'marble', basePerMin: 0.5 },
    },
    {
      id: 'glassworks',
      name: 'Стекольня',
      buildAreaRadiusTiles: 5,
      cost: { wood: 25, metal: 5, marble: 0, glass: 0, powder: 0, gold: 8 },
      upkeep: { goldPerMin: 0.07 },
      placeRules: { allowedSurfaces: ['beach', 'desert'], showPlacementHint: true, allowOutsideBuildAreaWithinTiles: 200 },
      extract: { resource: 'glass', basePerMin: 0.45 },
    },
    {
      id: 'powder_mill',
      name: 'Пороховой завод',
      cost: { wood: 25, metal: 15, marble: 0, glass: 0, powder: 0, gold: 12 },
      upkeep: { goldPerMin: 0.1 },
      placeRules: { allowedSurfaces: ['swamp'], showPlacementHint: true, allowOutsideBuildAreaWithinTiles: 200 },
      extract: { resource: 'powder', basePerMin: 0.35 },
    },
  ];

  const governments = [
    { id: 'default', name: 'Сбалансированный строй', mods: [] },
  ];

  const doctrines = [
    {
      id: 'free_market',
      name: 'Свободный рынок',
      choiceGroup: 'economy',
      mods: [
        { stat: StatId.GoldPerMinPct, type: 'AddPct', value: 0.10 },
        { stat: StatId.CostCoeffPct, type: 'AddPct', value: 0.03 },
        { stat: StatId.DiplomacyPct, type: 'AddPct', value: 0.04 },
      ],
    },
    {
      id: 'planned_economy',
      name: 'Плановая экономика',
      choiceGroup: 'economy',
      mods: [
        { stat: StatId.CostCoeffPct, type: 'AddPct', value: -0.06 },
        { stat: StatId.ResourceYieldPct, type: 'AddPct', value: 0.07 },
        { stat: StatId.HappinessPct, type: 'AddPct', value: 0.03 },
      ],
    },
    {
      id: 'globalism',
      name: 'Глобализм',
      choiceGroup: 'diplomacy',
      mods: [
        { stat: StatId.TradeRadiusPct, type: 'AddPct', value: 0.12 },
        { stat: StatId.TradeShipSpeedPct, type: 'AddPct', value: 0.08 },
        { stat: StatId.DiplomacyPct, type: 'AddPct', value: 0.06 },
      ],
    },
    {
      id: 'isolationism',
      name: 'Изоляционизм',
      choiceGroup: 'diplomacy',
      mods: [
        { stat: StatId.HappinessPct, type: 'AddPct', value: 0.06 },
        { stat: StatId.TradeRadiusPct, type: 'AddPct', value: -0.08 },
        { stat: StatId.Stability, type: 'AddFlat', value: 2 },
      ],
    },
  ];

  const presets = [
    {
      id: 'Balanced',
      name: 'Баланс',
      costPenalty: 0.0015,
      weights: {
        [StatId.GoldPerMinPct]: 1.0,
        [StatId.ResearchPerMinPct]: 0.7,
        [StatId.ResourceYieldPct]: 0.7,
        [StatId.TradeRadiusPct]: 0.5,
        [StatId.TradeSlots]: 0.6,
        [StatId.CostCoeffPct]: 0.4,
      },
    },
    {
      id: 'EconRush',
      name: 'Экономика',
      costPenalty: 0.0012,
      weights: {
        [StatId.GoldPerMinPct]: 1.4,
        [StatId.CostCoeffPct]: 0.7,
        [StatId.TradeSlots]: 0.5,
        [StatId.ResourceYieldPct]: 0.4,
      },
    },
    {
      id: 'TradeEmpire',
      name: 'Торговля',
      costPenalty: 0.0013,
      weights: {
        [StatId.TradeRadiusPct]: 1.3,
        [StatId.TradeShipSpeedPct]: 0.9,
        [StatId.TradeSlots]: 1.1,
        [StatId.GoldPerMinPct]: 0.6,
      },
    },
    {
      id: 'ScienceRush',
      name: 'Наука',
      costPenalty: 0.0014,
      weights: {
        [StatId.ResearchPerMinPct]: 1.3,
        [StatId.ScienceLevelPct]: 1.1,
        [StatId.GoldPerMinPct]: 0.4,
      },
    },
  ];

  return { balance, buildings, buildingDefinitions: BUILDING_DEFINITIONS, governments, doctrines, presets };
}
