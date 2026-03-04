// src/world/infinite/infiniteConfig.js
export const defaultInfiniteConfig = {
  worldSeed: 1,

  tileSize: 8,
  chunkSize: 64,
  marginChunks: 1,
  maxGenPerFrame: 1,
  chunkCacheLimit: 48, // лимит кеша выгруженных чанков (LRU)

  // Цель: доля суши (level > 0) ~ 0.62
  landFraction: 0.62,

  computeSlope: true,
  slopeStep: 6,
  slopeScale: 55,

  coastBandLevels: 3.5,
  sandBandLevels: 2.0,

  moistureFreq: 0.0026,

  snowLineElev: 8,
  rockSlope: 0.62,

  forestMoistLo: 0.55,
  forestMoistHi: 0.85,
  forestElevLo: 1,
  forestElevHi: 6,

  desertDryMin: 0.72,
  desertMaxElev: 4,

  colorVarFreq: 0.010,
  colorVarAmp: 0.06,

  // Нормализация по сэмплам (одинакова у всех при одном seed)
  normSampleCount: 6000,
  normRegion: 12000, // тайлы, область для сэмплирования распределения высот

  // -------- Plates (infinite Voronoi / Worley) --------
  plateCellSize: 600,        // крупнее => крупнее плиты и материки
  plateContinentalProb: 0.3, // доля континентальных плит
  plateSpeedMin: 0.2,
  plateSpeedMax: 1.00,

  // -------- Continents base (blobby) --------
  continentFreq: 0.0061,     // меньше => крупнее материки
  continentAmp: 0.55,
  plateBias: 0.28,           // continental lift, oceanic drop
  detailFreq: 0.006,
  detailAmp: 0.12,

  // Domain warp для континентов (чтобы не было прямых линий)
  continentWarpFreq: 0.01,
  continentWarpAmp: 180, // в тайлах

  // -------- Orogeny (mountain belts only on convergent boundaries) --------
  minBoundaryStrength: 0.002,

  mountainBeltWidth: 40,     // ширина пояса (тайлы)
  mountainHeightAmp: 1.25,
  foothillAmp: 0.38,

  ridgeAcrossFreq: 0.085,
  ridgeAlongFreq: 0.020,
  ridgeAmp: 0.55,

  // Warped Voronoi: убирает прямые границы плит
  plateWarpFreq: 0.01,   // частота искривления (в мировых тайлах)
  plateWarpAmp: 500,       // амплитуда искривления (в тайлах)

  peaksAmp: 0.35,
  peaksThreshold: 0.72,

  passesAmp: 0.45,
  passesFreq: 0.018,

  // -------- Thermal erosion (local, per-chunk) --------
  erosionIters: 21,
  erosionTalus: 0.06,
  erosionRate: 0.28,

  // -------- Visual textures (procedural overlays) --------
  useTextures: true,
  textureVariants: 8,
  enableSlopeShade: true,
  dryTextureMoist: 0.38,

  // Water animation (shoreline waves)
  waterWaves: true,
  waveAnimFps: 5,              // частота обновления оверлея
  maxWaveUpdatesPerFrame: 3,     // сколько чанков максимум обновлять за кадр (перфоманс)
  waveLayerAlpha: 0.9,          // общая прозрачность слоя
  waveSpeed: 0.3,              // скорость циклов (чем выше — тем чаще “набег”)
  waveFrequency: 0.25,          // “продвижение” волн вглубь по тайлам
  waveRunupTiles: 1,            // сколько тайлов пена может забежать на песок
  beachRunupTiles: 1,           // доп. лимит для записей “пляж”
  waveAlpha: 0.45,              // яркость/интенсивность пены
};