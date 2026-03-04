export const defaultGenConfig = {
  // Для 1000x1000 нужно меньше scale, иначе будет слишком “пятнистая” карта
  noiseScale: 0.02,
  octaves: 5,

  // материковый уклон
  continentBias: 0.38,

  // уровень моря
  seaLevel: 0.53,

  // сглаживание
  smoothPasses: 4,

  // чистка мелочей (чуть выше, чтобы не было “пыли”)
  minIslandSize: 300,
  minLakeSize: 180,

  // реки (на большой карте их нужно больше)
  riverCount: 80,
  riverSourceMinHeight: 0.70,
  riverMaxLen: 800,

  // океан по краям
  forceBorderWater: true,

  // “влажность” для лесов
  moistureScale: 0.03,
  moistureOctaves: 4,
};