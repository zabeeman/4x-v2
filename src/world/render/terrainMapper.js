import { hash2D, clamp } from "../gen/genRules.js";

function anyWaterNeighbor(world, x, y) {
  const w = world.land[0].length;
  const h = world.land.length;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (world.land[ny][nx] === 0) return true;
    }
  }
  return false;
}

function pickVariant(seed, x, y, count, salt) {
  if (count <= 1) return 0;
  const r = hash2D(seed + salt, x, y);
  return Math.floor(r * count);
}

export function fillTerrainLayerChunked(scene, layer, world, terrainCfg, indexMap, seed, opts = {}) {
  const chunkRows = opts.chunkRows ?? 8;
  const onProgress = opts.onProgress ?? null;
  const onDone = opts.onDone ?? null;

  const h = world.land.length;
  const w = world.land[0].length;

  let y = 0;

  const timer = scene.time.addEvent({
    delay: 1,
    loop: true,
    callback: () => {
      const yStart = y;
      const yEnd = Math.min(h, y + chunkRows);

      const rows = [];

      for (; y < yEnd; y++) {
        const row = new Array(w);

        for (let x = 0; x < w; x++) {
          const isLand = world.land[y][x] === 1;
          const height = world.heightmap[y][x];
          const moist = world.moisture[y][x];

          if (!isLand) {
            // ---- WATER ----
            // реки делаем мелководьем
            if (world.river[y][x]) {
              row[x] = indexMap.waterStart + clamp(terrainCfg.water.riverDepthLevel, 0, indexMap.waterCount - 1);
              continue;
            }

            // глубина по height (чем ниже, тем темнее)
            const sea = world.seaLevel;
            let depth = clamp((sea - height) / sea, 0, 1);
            let level = Math.floor(depth * (indexMap.waterCount - 1));

            // озёра не делаем слишком глубокими
            if (!world.ocean[y][x]) {
              level = Math.min(level, terrainCfg.water.lakeMaxDepthLevel);
            }

            row[x] = indexMap.waterStart + level;
            continue;
          }

          // ---- LAND ----
          const sea = world.seaLevel;
          const e = clamp((height - sea) / (1 - sea), 0, 1);

          const nearWater = anyWaterNeighbor(world, x, y);
          const T = terrainCfg.thresholds;
          const M = terrainCfg.moisture;

          if (nearWater || e < T.beachElev) {
            const v = pickVariant(seed, x, y, indexMap.sandCount, 101);
            row[x] = indexMap.sandStart + v;
          } else if (e >= T.mountainElev) {
            const v = pickVariant(seed, x, y, indexMap.mountainCount, 202);
            row[x] = indexMap.mountainStart + v;
          } else if (moist >= M.forestMin && e <= T.forestMaxElev) {
            const v = pickVariant(seed, x, y, indexMap.forestCount, 303);
            row[x] = indexMap.forestStart + v;
          } else if (moist <= M.dryMax || e >= T.dirtElev) {
            const v = pickVariant(seed, x, y, indexMap.dirtCount, 404);
            row[x] = indexMap.dirtStart + v;
          } else {
            const v = pickVariant(seed, x, y, indexMap.grassCount, 505);
            row[x] = indexMap.grassStart + v;
          }
        }

        rows.push(row);
      }

      layer.putTilesAt(rows, 0, yStart);

      if (onProgress) onProgress(y / h);

      if (y >= h) {
        timer.remove(false);
        if (onDone) onDone();
      }
    },
  });

  return timer;
}