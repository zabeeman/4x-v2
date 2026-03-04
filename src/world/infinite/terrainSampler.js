// src/world/infinite/terrainSampler.js
// Tectonics + orogeny stay as-is. Details/painting are layered on top.

function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

/* ---------------- RNG / hashing ---------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashU32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash2(seed, x, y) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed >>> 0, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return (n >>> 0) / 4294967296;
}

/* ---------------- 2D gradient noise (seeded) ---------------- */

function makeNoise2D(seed) {
  const s = seed >>> 0;

  function rand2(ix, iy) {
    let h = ix * 374761393 + iy * 668265263 + s * 69069;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return (h >>> 0) / 4294967296;
  }

  function grad(ix, iy) {
    const r = rand2(ix, iy);
    const a = r * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  }

  function perlin(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = x0 + 1, y1 = y0 + 1;

    const sx = x - x0, sy = y - y0;

    const g00 = grad(x0, y0);
    const g10 = grad(x1, y0);
    const g01 = grad(x0, y1);
    const g11 = grad(x1, y1);

    const n00 = g00[0] * sx       + g00[1] * sy;
    const n10 = g10[0] * (sx - 1) + g10[1] * sy;
    const n01 = g01[0] * sx       + g01[1] * (sy - 1);
    const n11 = g11[0] * (sx - 1) + g11[1] * (sy - 1);

    const u = fade(sx);
    const v = fade(sy);

    const nx0 = lerp(n00, n10, u);
    const nx1 = lerp(n01, n11, u);
    return lerp(nx0, nx1, v); // ~[-1,1]
  }

  function fbm(x, y, octaves, lacunarity = 2.0, gain = 0.5) {
    let amp = 1.0, freq = 1.0;
    let sum = 0.0, norm = 0.0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * perlin(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / (norm || 1);
  }

  function ridgedFbm(x, y, octaves, lacunarity = 2.0, gain = 0.5) {
    let amp = 1.0, freq = 1.0;
    let sum = 0.0, norm = 0.0;
    for (let i = 0; i < octaves; i++) {
      const n = perlin(x * freq, y * freq); // [-1,1]
      const r = 1.0 - Math.abs(n);          // [0,1]
      sum += amp * r;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / (norm || 1);
  }

  return { perlin, fbm, ridgedFbm };
}

/* ---------------- Plates: infinite Worley/Voronoi ---------------- */

function plateSeedForCell(seed, cx, cy, cfg) {
  const cell = cfg.plateCellSize;

  const jx = hash2(seed + 11, cx, cy);
  const jy = hash2(seed + 17, cx, cy);

  const x = (cx + jx) * cell;
  const y = (cy + jy) * cell;

  const continental = hash2(seed + 23, cx, cy) < cfg.plateContinentalProb;

  const ang = hash2(seed + 29, cx, cy) * Math.PI * 2;
  const mag = cfg.plateSpeedMin + (cfg.plateSpeedMax - cfg.plateSpeedMin) * hash2(seed + 31, cx, cy);

  const vx = Math.cos(ang) * mag;
  const vy = Math.sin(ang) * mag;

  return { x, y, continental, vx, vy };
}

function nearestTwoPlates(seed, x, y, cfg) {
  const cell = cfg.plateCellSize;
  const cx0 = Math.floor(x / cell);
  const cy0 = Math.floor(y / cell);

  let best = null, bestD = Infinity;
  let second = null, secondD = Infinity;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = cx0 + dx;
      const cy = cy0 + dy;
      const p = plateSeedForCell(seed, cx, cy, cfg);

      const rx = x - p.x;
      const ry = y - p.y;
      const d2 = rx * rx + ry * ry;

      if (d2 < bestD) {
        second = best; secondD = bestD;
        best = p; bestD = d2;
      } else if (d2 < secondD) {
        second = p; secondD = d2;
      }
    }
  }

  return { a: best, b: second, d1: Math.sqrt(bestD), d2: Math.sqrt(secondD) };
}

function boundaryStrengthAndAngle(pa, pb) {
  const nx = pb.x - pa.x;
  const ny = pb.y - pa.y;
  const nlen = Math.hypot(nx, ny) || 1;

  const unx = nx / nlen;
  const uny = ny / nlen;

  const rvx = pb.vx - pa.vx;
  const rvy = pb.vy - pa.vy;

  const sepRate = rvx * unx + rvy * uny;
  const conv = clamp(-sepRate, 0, 1);

  const typeFactor =
    (pa.continental && pb.continental) ? 1.0 :
    (pa.continental || pb.continental) ? 0.75 : 0.45;

  const strength = conv * typeFactor;
  const tangentAngle = Math.atan2(uny, unx) + Math.PI * 0.5;

  return { strength, tangentAngle };
}

/* ---------------- Color helpers ---------------- */

function hexToRgb(hex) {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex({ r, g, b }) {
  const rr = clamp(r | 0, 0, 255).toString(16).padStart(2, "0");
  const gg = clamp(g | 0, 0, 255).toString(16).padStart(2, "0");
  const bb = clamp(b | 0, 0, 255).toString(16).padStart(2, "0");
  return `#${rr}${gg}${bb}`;
}
function mixHex(aHex, bHex, t) {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  return rgbToHex({
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
  });
}
function jitterHex(hex, j) {
  const c = hexToRgb(hex);
  const k = 1 + j;
  return rgbToHex({ r: c.r * k, g: c.g * k, b: c.b * k });
}

function defaultPalette() {
  return {
    deepWater:    "#0b1d3a",
    shallowWater: "#1e4b7a",

    beach:        "#d8c38a",
    wetSand:      "#bfa974",
    cliff:        "#5f5f5f",

    grass:        "#3f7a3e",
    forest:       "#245a2b",
    swamp:        "#2b4a3a",

    dry:          "#8b8a4b",
    desert:       "#cdb37a",

    hillRock:     "#6b6b6b",
    mountainRock: "#767676",
    snow:         "#e7eef2",
  };
}

/* ---------------- Normalization cache (landFraction) ---------------- */

const _noiseCache = new Map();     // seedU32 -> noise
const _moistCache = new Map();     // seedU32 -> noise
const _normCache = new Map();      // key -> { sea, scale }

function getNoise(seedU32) {
  let n = _noiseCache.get(seedU32);
  if (!n) { n = makeNoise2D(seedU32); _noiseCache.set(seedU32, n); }
  return n;
}
function getMoistNoise(seedU32) {
  const s = (seedU32 ^ 0x9e3779b9) >>> 0;
  let n = _moistCache.get(s);
  if (!n) { n = makeNoise2D(s); _moistCache.set(s, n); }
  return n;
}

function cacheKey(seedU32, cfg) {
  return [
    seedU32,
    cfg.landFraction,
    cfg.plateCellSize,
    cfg.plateWarpFreq, cfg.plateWarpAmp,
    cfg.minBoundaryStrength,
    cfg.mountainBeltWidth,
    cfg.mountainHeightAmp,
    cfg.continentFreq, cfg.continentAmp,
    cfg.plateBias
  ].join("|");
}

function rawHeight(seedU32, x, y, cfg, noise) {
  // --- warped Voronoi to kill straight edges ---
  const px = x + cfg.plateWarpAmp * noise.fbm(x * cfg.plateWarpFreq, y * cfg.plateWarpFreq, 2);
  const py = y + cfg.plateWarpAmp * noise.fbm(x * cfg.plateWarpFreq + 19.1, y * cfg.plateWarpFreq + 7.7, 2);

  const { a, b, d1, d2 } = nearestTwoPlates(seedU32, px, py, cfg);
  const bp = boundaryStrengthAndAngle(a, b);

  const distToBoundary = 0.5 * (d2 - d1);
  const t = distToBoundary / (cfg.mountainBeltWidth || 1);
  const beltMask = Math.exp(-(t * t));

  const strength = (bp.strength >= cfg.minBoundaryStrength) ? bp.strength : 0;

  // --- continents base (domain warp) ---
  const wx = x + cfg.continentWarpAmp * noise.fbm(x * cfg.continentWarpFreq, y * cfg.continentWarpFreq, 2);
  const wy = y + cfg.continentWarpAmp * noise.fbm(x * cfg.continentWarpFreq + 17.3, y * cfg.continentWarpFreq + 5.1, 2);

  const cont = noise.fbm(wx * cfg.continentFreq, wy * cfg.continentFreq, 4); // ~[-1,1]
  const details = noise.fbm(x * cfg.detailFreq, y * cfg.detailFreq, 3);     // ~[-1,1]

  const plateLift = a.continental ? +cfg.plateBias : -cfg.plateBias;

  let h = cfg.continentAmp * cont + plateLift + cfg.detailAmp * details;

  // --- mountains ONLY on convergent belts ---
  if (strength > 0 && beltMask > 1e-5) {
    const ang = bp.tangentAngle;
    const ca = Math.cos(ang), sa = Math.sin(ang);

    const xr = (ca * x + sa * y);
    const yr = (-sa * x + ca * y);

    const upliftVar = 0.65 + 0.35 * noise.fbm(x * 0.0012, y * 0.0012, 3);

    const alongMod = 0.75 * noise.fbm(xr * cfg.ridgeAlongFreq, yr * cfg.ridgeAlongFreq, 2);
    const ridgeBase = noise.ridgedFbm(
      yr * cfg.ridgeAcrossFreq + alongMod,
      xr * cfg.ridgeAlongFreq,
      4
    ); // 0..1

    const passN = noise.fbm(xr * cfg.passesFreq, yr * cfg.passesFreq, 2); // ~[-1,1]
    const passMask = smoothstep(0.15, 0.55, (passN + 1) * 0.5);

    const peaks = Math.max(0, ridgeBase - cfg.peaksThreshold);
    const peaksShaped = peaks * peaks;

    const mountainUplift = beltMask * strength * cfg.mountainHeightAmp * upliftVar;
    const ridgeTerm = beltMask * strength * cfg.ridgeAmp * (ridgeBase - 0.5);
    const foothills = Math.pow(beltMask, 0.65) * strength * cfg.foothillAmp;
    const peakTerm = beltMask * strength * cfg.peaksAmp * peaksShaped;
    const passTerm = beltMask * strength * cfg.passesAmp * (passMask - 0.5);

    h += (mountainUplift + ridgeTerm + foothills + peakTerm - passTerm);
  }

  return h;
}

function getNormalization(seedInput, cfg) {
  const seedU32 = (typeof seedInput === "string") ? hashU32(seedInput) : (seedInput >>> 0);
  const k = cacheKey(seedU32, cfg);
  const cached = _normCache.get(k);
  if (cached) return cached;

  const rng = mulberry32(seedU32 ^ 0xA53C9E17);
  const noise = getNoise(seedU32);

  const n = cfg.normSampleCount | 0;
  const region = cfg.normRegion;

  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (rng() * 2 - 1) * region;
    const y = (rng() * 2 - 1) * region;
    samples[i] = rawHeight(seedU32, x, y, cfg, noise);
  }

  const sorted = Array.from(samples);
  sorted.sort((a, b) => a - b);

  const q = clamp(1 - cfg.landFraction, 0.01, 0.99);
  const idxSea = Math.floor(q * (sorted.length - 1));
  const sea = sorted[idxSea];

  const abs = new Float32Array(n);
  for (let i = 0; i < n; i++) abs[i] = Math.abs(samples[i] - sea);
  const absSorted = Array.from(abs);
  absSorted.sort((a, b) => a - b);
  const p99 = Math.max(1e-6, absSorted[Math.floor(0.99 * (absSorted.length - 1))]);

  const scale = 10 / p99;

  const norm = { seedU32, sea, scale };
  _normCache.set(k, norm);
  return norm;
}

/* ---------------- Public base sampling (kept for compatibility) ---------- */

export function sampleRawShifted(seedInput, x, y, cfg) {
  const norm = getNormalization(seedInput, cfg);
  const noise = getNoise(norm.seedU32);
  return rawHeight(norm.seedU32, x, y, cfg, noise) - norm.sea; // sea==0
}

export function sampleLevel(seedInput, x, y, cfg) {
  const norm = getNormalization(seedInput, cfg);
  const raw = sampleRawShifted(seedInput, x, y, cfg);
  return clamp(Math.round(raw * norm.scale), -10, 10) | 0;
}

export function sampleTerrain(seedInput, x, y, cfg) {
  const norm = getNormalization(seedInput, cfg);
  const raw = sampleRawShifted(seedInput, x, y, cfg);
  const level = clamp(Math.round(raw * norm.scale), -10, 10) | 0;
  return { raw, level };
}

/* ---------------- Detail layer: slope/coast/surface/color/masks ----------- */

// optional slope (calls 4 extra raw samples)
function slopeAt(seedInput, x, y, cfg) {
  const step = cfg.slopeStep ?? 6;
  const sL = sampleRawShifted(seedInput, x - step, y, cfg);
  const sR = sampleRawShifted(seedInput, x + step, y, cfg);
  const sD = sampleRawShifted(seedInput, x, y - step, cfg);
  const sU = sampleRawShifted(seedInput, x, y + step, cfg);

  const dx = (sR - sL) / (2 * step);
  const dy = (sU - sD) / (2 * step);

  return clamp(Math.hypot(dx, dy) * (cfg.slopeScale ?? 55), 0, 1);
}

function classifyAndColor(seedInput, x, y, cfg, raw, level, coast01, slope01, moist01) {
  const pal = cfg.palette ?? defaultPalette();

  // color variation noise (visual only)
  const norm = getNormalization(seedInput, cfg);
  const noise = getNoise(norm.seedU32);

  const vN = noise.fbm(x * (cfg.colorVarFreq ?? 0.010), y * (cfg.colorVarFreq ?? 0.010), 2); // ~[-1,1]
  const jitter = vN * (cfg.colorVarAmp ?? 0.06);

  const masks = { beach: 0, cliff: 0, snow: 0, forest: 0, rock: 0, swamp: 0 };

  // WATER
  if (level <= 0) {
    // depth based on level (-1..-10) or raw
    const depth01 = clamp((-level) / 10, 0, 1);
    const color = jitterHex(mixHex(pal.shallowWater, pal.deepWater, depth01), jitter * 0.6);
    return { surface: depth01 < 0.55 ? "shallow_water" : "deep_water", color, masks };
  }

  // COAST RULE (visual): near sea based on raw in "level units"
  const sandBandLevels = cfg.sandBandLevels ?? 2.0;
  const cliffSlope = cfg.cliffSlope ?? 0.55;
  const nearSea = raw <= (sandBandLevels / norm.scale); // sea==0

  if (nearSea && coast01 > 0.15) {
    if (slope01 < cliffSlope) {
      masks.beach = smoothstep(0.10, 0.85, coast01);
      const t = clamp(raw / (sandBandLevels / norm.scale), 0, 1);
      let color = mixHex(pal.wetSand, pal.beach, t);
      color = jitterHex(color, jitter);
      return { surface: "beach", color, masks };
    } else {
      masks.cliff = smoothstep(cliffSlope, 1.0, slope01) * smoothstep(0.2, 0.9, coast01);
      const color = jitterHex(pal.cliff, jitter * 0.35);
      return { surface: "coast_cliff", color, masks };
    }
  }

  // SNOW
  const snowLine = cfg.snowLineElev ?? 8;
  if (level >= snowLine) {
    masks.snow = smoothstep(snowLine, 10, level) * (0.6 + 0.4 * moist01);
    const rockMix = smoothstep(0.75, 0.95, slope01);
    let color = mixHex(pal.mountainRock, pal.snow, clamp(masks.snow, 0, 1));
    color = mixHex(color, pal.mountainRock, rockMix * 0.35);
    color = jitterHex(color, jitter * 0.35);
    return { surface: "snow", color, masks };
  }

  // ROCK / SCREE
  const rockSlope = cfg.rockSlope ?? 0.62;
  const rockMask = smoothstep(rockSlope, 1.0, slope01) * smoothstep(6, 10, level);
  if (rockMask > 0.25) {
    masks.rock = rockMask;
    const base = level >= 6 ? pal.mountainRock : pal.hillRock;
    const color = jitterHex(base, jitter * 0.30);
    return { surface: "rock", color, masks };
  }

  // SWAMP (wet + low + flat)
  const swampMask =
    smoothstep(0.70, 0.92, moist01) *
    smoothstep(1, 4, level) *
    (1 - smoothstep(0.35, 0.55, slope01));

  if (swampMask > 0.35) {
    masks.swamp = swampMask;
    const color = jitterHex(mixHex(pal.grass, pal.swamp, clamp(swampMask, 0, 1)), jitter * 0.45);
    return { surface: "swamp", color, masks };
  }

  // FOREST (moist + mid elev + not steep)
  const forestMask =
    smoothstep(cfg.forestMoistLo ?? 0.55, cfg.forestMoistHi ?? 0.85, moist01) *
    smoothstep(cfg.forestElevLo ?? 1, cfg.forestElevHi ?? 6, level) *
    (1 - smoothstep(0.45, 0.65, slope01));

  if (forestMask > 0.40) {
    masks.forest = forestMask;
    let color = mixHex(pal.grass, pal.forest, clamp(forestMask, 0, 1));
    color = jitterHex(color, jitter * 0.45);
    return { surface: "forest", color, masks };
  }

  // DESERT (dry)
  const dry = 1 - moist01;
  if (dry > (cfg.desertDryMin ?? 0.72) && level <= (cfg.desertMaxElev ?? 4)) {
    const t = smoothstep(cfg.desertDryMin ?? 0.72, 0.95, dry);
    let color = mixHex(pal.dry, pal.desert, t);
    color = jitterHex(color, jitter * 0.55);
    return { surface: "desert", color, masks };
  }

  // BASE LAND (grass <-> dry) + some hill rock
  const grassToDry = smoothstep(0.35, 0.80, dry);
  let base = mixHex(pal.grass, pal.dry, grassToDry);

  const hillRock = smoothstep(0.50, 0.75, slope01) * smoothstep(3, 7, level);
  base = mixHex(base, pal.hillRock, hillRock * 0.35);

  const color = jitterHex(base, jitter);
  return { surface: "land", color, masks };
}

/**
 * sampleHM:
 * - raw: shifted (sea == 0)
 * - elev: int [-10..+10]
 * - coast: 0..1
 * - slope: 0..1 (optional)
 * - moist: 0..1
 * - surface: string
 * - color: #RRGGBB
 * - masks: {...}
 */
export function sampleHM(seedInput, x, y, cfg) {
  const norm = getNormalization(seedInput, cfg);

  const raw = sampleRawShifted(seedInput, x, y, cfg);
  const elev = clamp(Math.round(raw * norm.scale), -10, 10) | 0;

  // coast measure in "level units" (how close to sea==0)
  const coastBandLevels = cfg.coastBandLevels ?? 3.5;
  const coast = clamp(1 - Math.abs(raw * norm.scale) / coastBandLevels, 0, 1);

  const computeSlope = cfg.computeSlope ?? true;
  const slope = computeSlope ? slopeAt(seedInput, x, y, cfg) : clamp(0.55 * coast, 0, 1);

  // moisture
  const moistNoise = getMoistNoise(norm.seedU32);
  const mf = cfg.moistureFreq ?? 0.0026;
  const moist = clamp(0.5 + 0.5 * moistNoise.fbm(x * mf, y * mf, 3), 0, 1);

  const painted = classifyAndColor(seedInput, x, y, cfg, raw, elev, coast, slope, moist);

  return {
    sea: 0,
    raw,
    elev,
    coast,
    slope,
    moist,
    surface: painted.surface,
    color: painted.color,
    masks: painted.masks,
  };
}