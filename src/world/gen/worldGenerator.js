import { defaultGenConfig } from "./genConfig.js";
import { clamp, hash2D, fbm, neighbors8, inBounds, floodFill, getComponents } from "./genRules.js";

export function generateWorld(seed, w, h, cfg = {}) {
  const P = { ...defaultGenConfig, ...cfg };
  const SEED = seed;

  // height + moisture
  const heightmap = Array.from({ length: h }, () => Array(w).fill(0));
  const moisture = Array.from({ length: h }, () => Array(w).fill(0));

  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const maxD = Math.hypot(cx, cy);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x * P.noiseScale;
      const ny = y * P.noiseScale;

      let n = fbm(SEED, nx, ny, P.octaves);

      // материковый градиент
      const d = Math.hypot(x - cx, y - cy) / maxD;
      const radial = 1 - d;
      n += radial * P.continentBias;

      heightmap[y][x] = clamp(n, 0, 1);

      // влажность отдельным шумом
      const mx = x * P.moistureScale;
      const my = y * P.moistureScale;
      moisture[y][x] = clamp(fbm(SEED + 777777, mx, my, P.moistureOctaves), 0, 1);
    }
  }

  // land/water: 1=land, 0=water
  let land = Array.from({ length: h }, () => Array(w).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      land[y][x] = heightmap[y][x] > P.seaLevel ? 1 : 0;
    }
  }

  // border water
  if (P.forceBorderWater) {
    for (let x = 0; x < w; x++) { land[0][x] = 0; land[h - 1][x] = 0; }
    for (let y = 0; y < h; y++) { land[y][0] = 0; land[y][w - 1] = 0; }
  }

  // smoothing
  for (let pass = 0; pass < P.smoothPasses; pass++) {
    const next = Array.from({ length: h }, () => Array(w).fill(0));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let countLand = 0;
        for (const [nx, ny] of neighbors8(x, y)) {
          if (!inBounds(nx, ny, w, h)) continue;
          countLand += land[ny][nx];
        }
        if (land[y][x] === 1) next[y][x] = (countLand >= 3) ? 1 : 0;
        else next[y][x] = (countLand >= 6) ? 1 : 0;
      }
    }
    land = next;

    if (P.forceBorderWater) {
      for (let x = 0; x < w; x++) { land[0][x] = 0; land[h - 1][x] = 0; }
      for (let y = 0; y < h; y++) { land[y][0] = 0; land[y][w - 1] = 0; }
    }
  }

  // океан floodfill
  const ocean = Array.from({ length: h }, () => Array(w).fill(false));
  const isWater = (x, y) => land[y][x] === 0;

  for (let x = 0; x < w; x++) {
    if (isWater(x, 0) && !ocean[0][x]) floodFill(ocean, x, 0, w, h, isWater);
    if (isWater(x, h - 1) && !ocean[h - 1][x]) floodFill(ocean, x, h - 1, w, h, isWater);
  }
  for (let y = 0; y < h; y++) {
    if (isWater(0, y) && !ocean[y][0]) floodFill(ocean, 0, y, w, h, isWater);
    if (isWater(w - 1, y) && !ocean[y][w - 1]) floodFill(ocean, w - 1, y, w, h, isWater);
  }

  // remove small islands
  const landComps = getComponents(land, w, h, 1);
  for (const comp of landComps) {
    if (comp.length < P.minIslandSize) {
      for (const [x, y] of comp) land[y][x] = 0;
    }
  }

  // remove small lakes (water not ocean)
  const lakeWater = Array.from({ length: h }, () => Array(w).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      lakeWater[y][x] = (land[y][x] === 0 && !ocean[y][x]) ? 1 : 0;
    }
  }

  const lakeComps = getComponents(lakeWater, w, h, 1);
  for (const comp of lakeComps) {
    if (comp.length < P.minLakeSize) {
      for (const [x, y] of comp) land[y][x] = 1;
    }
  }

  // recompute ocean
  const ocean2 = Array.from({ length: h }, () => Array(w).fill(false));
  const isWater2 = (x, y) => land[y][x] === 0;

  for (let x = 0; x < w; x++) {
    if (isWater2(x, 0) && !ocean2[0][x]) floodFill(ocean2, x, 0, w, h, isWater2);
    if (isWater2(x, h - 1) && !ocean2[h - 1][x]) floodFill(ocean2, x, h - 1, w, h, isWater2);
  }
  for (let y = 0; y < h; y++) {
    if (isWater2(0, y) && !ocean2[y][0]) floodFill(ocean2, 0, y, w, h, isWater2);
    if (isWater2(w - 1, y) && !ocean2[y][w - 1]) floodFill(ocean2, w - 1, y, w, h, isWater2);
  }

  // rivers (set of cells)
  const riverCells = new Set();
  const key = (x, y) => `${x},${y}`;

  function findRiverSource() {
    for (let tries = 0; tries < 20000; tries++) {
      const x = (hash2D(SEED, tries, 17) * w) | 0;
      const y = (hash2D(SEED, tries, 93) * h) | 0;

      if (!inBounds(x, y, w, h)) continue;
      if (land[y][x] !== 1) continue;
      if (heightmap[y][x] < P.riverSourceMinHeight) continue;

      return [x, y];
    }
    return null;
  }

  function carveRiverFrom(sx, sy) {
    let x = sx, y = sy;
    const visited = new Set();
    let len = 0;

    while (len < P.riverMaxLen) {
      visited.add(key(x, y));
      riverCells.add(key(x, y));

      if (land[y][x] === 0) return true;

      let best = null;
      let bestH = heightmap[y][x];

      for (const [nx, ny] of neighbors8(x, y)) {
        if (!inBounds(nx, ny, w, h)) continue;

        if (land[ny][nx] === 0) {
          best = [nx, ny];
          bestH = -1;
          break;
        }

        const hh = heightmap[ny][nx];
        if (hh < bestH) {
          bestH = hh;
          best = [nx, ny];
        }
      }

      if (!best) return false;
      const [bx, by] = best;
      if (visited.has(key(bx, by))) return false;

      x = bx; y = by;
      len++;
    }
    return false;
  }

  for (let i = 0; i < P.riverCount; i++) {
    const src = findRiverSource();
    if (!src) break;
    carveRiverFrom(src[0], src[1]);
  }

  // river mask + apply to land
  const river = Array.from({ length: h }, () => Array(w).fill(false));
  for (const s of riverCells) {
    const [xs, ys] = s.split(",");
    const x = +xs, y = +ys;
    river[y][x] = true;
    land[y][x] = 0;
  }

  return { land, heightmap, moisture, ocean: ocean2, river, seaLevel: P.seaLevel };
}