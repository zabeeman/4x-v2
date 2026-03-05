// src/world/game/sim/defaultGameData.js
import { StatId } from './statsSystem.js';
import { BUILDINGS as BUILDING_DEFINITIONS } from './buildingCatalog.js';

const CATALOG_EFFECT_TO_STAT = {
  TaxEfficiency: { stat: StatId.GoldPerMinPct, mode: 'ADD' },
  IncomeGold: { stat: StatId.GoldPerMinPct, mode: 'ADD' },
  BuildSpeed: { stat: StatId.BuildSpeedPct, mode: 'MUL' },
  Happiness: { stat: StatId.HappinessPct, mode: 'ADD' },
  PopCap: { stat: StatId.PopCap, mode: 'ADD' },
  TradeCapacity: { stat: StatId.TradeSlots, mode: 'ADD' },
  TradeSpeed: { stat: StatId.TradeShipSpeedPct, mode: 'MUL' },
  IncomeStability: { stat: StatId.Stability, mode: 'ADD' },
  Defense: { stat: StatId.Stability, mode: 'ADD' },
  Corruption: { stat: StatId.Corruption, mode: 'ADD' },
  GrowthRate: { stat: StatId.HappinessPct, mode: 'ADD' },
  ProductionAll: { stat: StatId.ResourceYieldPct, mode: 'MUL' },
};

function mapEffectMode(mode = 'ADD') {
  if (mode === 'MUL') return 'Mul';
  return 'AddPct';
}

function mapDoctrineEffect(effect) {
  const mapped = CATALOG_EFFECT_TO_STAT[effect?.type];
  if (!mapped?.stat) return null;

  if ([StatId.PopCap, StatId.TradeSlots, StatId.Stability, StatId.Corruption].includes(mapped.stat)) {
    return { stat: mapped.stat, type: 'AddFlat', value: Number(effect?.value) || 0 };
  }

  if (effect?.mode === 'MUL') {
    return { stat: mapped.stat, type: 'Mul', value: Number(effect?.value) || 1 };
  }

  return { stat: mapped.stat, type: mapEffectMode(effect?.mode), value: Number(effect?.value) || 0 };
}

function normalizeCatalogDoctrines(catalog) {
  return (catalog?.doctrines ?? []).map((d) => {
    const effects = (d.effects ?? []).map(mapDoctrineEffect).filter(Boolean);
    return {
      id: d.id,
      category: d.category ?? 'other',
      costPoints: d.costPoints ?? 0,
      balanceClass: d.balanceClass ?? 'BALANCED',
      exclusiveGroups: d.exclusiveGroups ?? [],
      requires: d.requires ?? [],
      forbids: d.forbids ?? [],
      recommendedBuildings: d.recommendedBuildings ?? [],
      recommendedBuildingTags: d.recommendedBuildingTags ?? [],
      effects,
      ui: {
        nameRu: d.ui?.nameRu ?? d.id,
        shortRu: d.ui?.shortRu ?? '',
        descriptionRu: d.ui?.descriptionRu ?? '',
        tagsRu: d.ui?.tagsRu ?? [],
        icon: d.ui?.icon ?? '📜',
      },
    };
  });
}

function normalizeCatalogPresets(catalog) {
  return (catalog?.presets ?? []).map((p) => ({
    id: p.id,
    nameRu: p.nameRu,
    descriptionRu: p.descriptionRu,
    doctrineIds: p.doctrineIds ?? [],
    intendedPlaystyleRu: p.intendedPlaystyleRu ?? [],
    riskLabel: p.riskLabelRu ?? p.riskLabel ?? '',
  }));
}

function doctrineConfigFromCatalog(catalog) {
  const reform = catalog?.reform ?? {};
  const duration = reform?.duration ?? {};
  const cost = reform?.cost ?? {};
  const base = cost?.base ?? {};
  const perPoint = cost?.perChangedPoint ?? {};
  const perDoctrine = cost?.perChangedDoctrine ?? {};
  const perExtreme = cost?.perExtremeInTarget ?? {};

  const reformTemporaryModifiers = (reform?.temporaryEffectsWhileActive ?? [])
    .map(mapDoctrineEffect)
    .filter(Boolean);

  return {
    startPoints: catalog?.points?.startingPointsTotal ?? 5,
    maxPerCategory: null,
    categories: (catalog?.categories ?? []).map((c) => c.key),
    reformBaseDurationTurns: duration?.baseTurns ?? 3,
    reformCooldownTurns: reform?.cooldownTurns ?? 180,
    reformBaseGold: base?.gold ?? 120,
    reformGoldPerPoint: perPoint?.gold ?? 30,
    reformGoldPerExtreme: perExtreme?.gold ?? 80,
    reformBaseMarble: base?.marble ?? 0,
    reformMarblePerDoctrine: perDoctrine?.marble ?? 2,
    reformBaseMetal: base?.metal ?? 0,
    reformMetalPerPoint: perPoint?.metal ?? 1,
    reformBaseGlass: base?.glass ?? 0,
    reformGlassPerDoctrine: perDoctrine?.glass ?? 1,
    reformBaseWood: base?.wood ?? 0,
    reformWoodPerDoctrine: perDoctrine?.wood ?? 2,
    reformBasePowder: base?.powder ?? 0,
    reformPowderPerExtreme: perExtreme?.powder ?? 0,
    reformTemporaryModifiers,
  };
}

export function createDefaultGameData(gameCfg, doctrineCatalog = null) {
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

  const defaultDoctrines = [
    {
      id: 'free_market',
      category: 'economy',
      costPoints: 3,
      balanceClass: 'BALANCED',
      exclusiveGroups: ['eco_model'],
      requires: [],
      forbids: [],
      recommendedBuildings: ['market_1', 'port_1'],
      recommendedBuildingTags: ['trade'],
      effects: [
        { stat: StatId.GoldPerMinPct, type: 'AddPct', value: 0.10 },
        { stat: StatId.CostCoeffPct, type: 'AddPct', value: 0.03 },
        { stat: StatId.DiplomacyPct, type: 'AddPct', value: 0.04 },
      ],
      ui: {
        nameRu: 'Свободный рынок',
        shortRu: 'Торговля и оборот',
        descriptionRu: 'Ставка на торговые связи и гибкий рынок.',
        tagsRu: ['экономика', 'торговля'],
        icon: '💱',
      },
      mods: [
        { stat: StatId.GoldPerMinPct, type: 'AddPct', value: 0.10 },
        { stat: StatId.CostCoeffPct, type: 'AddPct', value: 0.03 },
        { stat: StatId.DiplomacyPct, type: 'AddPct', value: 0.04 },
      ],
    },
    {
      id: 'planned_economy',
      category: 'economy',
      costPoints: 3,
      balanceClass: 'BALANCED',
      exclusiveGroups: ['eco_model'],
      requires: [],
      forbids: [],
      recommendedBuildings: ['sawmill', 'mine', 'quarry'],
      recommendedBuildingTags: ['industry'],
      effects: [
        { stat: StatId.CostCoeffPct, type: 'AddPct', value: -0.06 },
        { stat: StatId.ResourceYieldPct, type: 'AddPct', value: 0.07 },
        { stat: StatId.HappinessPct, type: 'AddPct', value: 0.03 },
      ],
      ui: {
        nameRu: 'Плановая экономика',
        shortRu: 'Меньше хаоса, больше планов',
        descriptionRu: 'Снижение затрат ценой меньшей гибкости рынка.',
        tagsRu: ['экономика', 'производство'],
        icon: '📊',
      },
      mods: [
        { stat: StatId.CostCoeffPct, type: 'AddPct', value: -0.06 },
        { stat: StatId.ResourceYieldPct, type: 'AddPct', value: 0.07 },
        { stat: StatId.HappinessPct, type: 'AddPct', value: 0.03 },
      ],
    },
    {
      id: 'globalism',
      category: 'diplomacy',
      costPoints: 2,
      balanceClass: 'BALANCED',
      exclusiveGroups: ['foreign_policy'],
      requires: [],
      forbids: [],
      recommendedBuildings: ['port_1', 'shipyard_1'],
      recommendedBuildingTags: ['navy', 'trade'],
      effects: [
        { stat: StatId.TradeRadiusPct, type: 'AddPct', value: 0.12 },
        { stat: StatId.TradeShipSpeedPct, type: 'AddPct', value: 0.08 },
        { stat: StatId.DiplomacyPct, type: 'AddPct', value: 0.06 },
      ],
      ui: {
        nameRu: 'Глобализм',
        shortRu: 'Связи с внешним миром',
        descriptionRu: 'Ставка на торговые маршруты и морские перевозки.',
        tagsRu: ['дипломатия', 'флот'],
        icon: '🌍',
      },
      mods: [
        { stat: StatId.TradeRadiusPct, type: 'AddPct', value: 0.12 },
        { stat: StatId.TradeShipSpeedPct, type: 'AddPct', value: 0.08 },
        { stat: StatId.DiplomacyPct, type: 'AddPct', value: 0.06 },
      ],
    },
    {
      id: 'isolationism',
      category: 'diplomacy',
      costPoints: 2,
      balanceClass: 'SWINGY',
      exclusiveGroups: ['foreign_policy'],
      requires: [],
      forbids: [],
      recommendedBuildings: ['watchtower_1', 'wall_1'],
      recommendedBuildingTags: ['defense'],
      effects: [
        { stat: StatId.HappinessPct, type: 'AddPct', value: 0.06 },
        { stat: StatId.TradeRadiusPct, type: 'AddPct', value: -0.08 },
        { stat: StatId.Stability, type: 'AddFlat', value: 2 },
      ],
      ui: {
        nameRu: 'Изоляционизм',
        shortRu: 'Ставка на внутренний порядок',
        descriptionRu: 'Меньше внешних связей, больше внутренней устойчивости.',
        tagsRu: ['дипломатия', 'оборона'],
        icon: '🛡️',
      },
      mods: [
        { stat: StatId.HappinessPct, type: 'AddPct', value: 0.06 },
        { stat: StatId.TradeRadiusPct, type: 'AddPct', value: -0.08 },
        { stat: StatId.Stability, type: 'AddFlat', value: 2 },
      ],
    },
  ];

  const defaultDoctrinePresets = [
    {
      id: 'balanced_start',
      nameRu: 'Сбалансированный старт',
      descriptionRu: 'Универсальный набор для спокойного развития.',
      doctrineIds: ['free_market', 'globalism'],
      intendedPlaystyleRu: ['Делай упор на рынок и порты.', 'Развивай маршруты между городами.'],
      riskLabel: 'Сдержанный',
    },
    {
      id: 'autarky_core',
      nameRu: 'Крепость и производство',
      descriptionRu: 'Упор на добычу и внутреннюю стабильность.',
      doctrineIds: ['planned_economy', 'isolationism'],
      intendedPlaystyleRu: ['Быстро закрывай базовые ресурсы.', 'Строй оборону и развивай ядро городов.'],
      riskLabel: 'Рискованный',
    },
  ];

  const doctrines = doctrineCatalog?.doctrines?.length ? normalizeCatalogDoctrines(doctrineCatalog) : defaultDoctrines;
  const doctrinePresets = doctrineCatalog?.presets?.length ? normalizeCatalogPresets(doctrineCatalog) : defaultDoctrinePresets;
  const doctrineConfig = doctrineCatalog
    ? doctrineConfigFromCatalog(doctrineCatalog)
    : { startPoints: 5, maxPerCategory: 2, categories: ['economy','governance','society','military','science','industry','diplomacy'], reformBaseDurationTurns: 3, reformCooldownTurns: 180, reformBaseGold: 120, reformGoldPerPoint: 30, reformGoldPerExtreme: 80, reformBaseMarble: 0, reformMarblePerDoctrine: 2, reformBaseMetal: 0, reformMetalPerPoint: 1, reformBaseGlass: 0, reformGlassPerDoctrine: 1, reformBaseWood: 0, reformWoodPerDoctrine: 2, reformBasePowder: 0, reformPowderPerExtreme: 0, reformTemporaryModifiers: [{ stat: StatId.HappinessPct, type: 'AddPct', value: -0.1 }, { stat: StatId.BuildSpeedPct, type: 'AddPct', value: -0.1 }, { stat: StatId.WarWeariness, type: 'AddFlat', value: 1 }] };

  return { balance, buildings, buildingDefinitions: BUILDING_DEFINITIONS, governments, doctrines, doctrinePresets, doctrineConfig };
}
