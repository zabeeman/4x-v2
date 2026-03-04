import { hash2D, clamp } from "./genRules.js";

// hex -> rgb
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r, g, b) {
  const to = (v) => v.toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
function adjust(hex, delta) {
  const { r, g, b } = hexToRgb(hex);
  const rr = clamp(r + delta, 0, 255) | 0;
  const gg = clamp(g + delta, 0, 255) | 0;
  const bb = clamp(b + delta, 0, 255) | 0;
  return rgbToHex(rr, gg, bb);
}

// Возвращает indexMap: базовые индексы диапазонов
function buildIndexMap(cfg) {
  let i = 0;
  const map = {};

  map.waterStart = i; map.waterCount = cfg.waterColors.length; i += map.waterCount;
  map.sandStart = i;  map.sandCount = cfg.sandColors.length;  i += map.sandCount;
  map.grassStart = i; map.grassCount = cfg.grassColors.length; i += map.grassCount;
  map.dirtStart = i;  map.dirtCount = cfg.dirtColors.length;  i += map.dirtCount;
  map.forestStart = i; map.forestCount = cfg.forestColors.length; i += map.forestCount;
  map.mountainStart = i; map.mountainCount = cfg.mountainColors.length; i += map.mountainCount;

  map.total = i;
  return map;
}

function paintTile(ctx, tileX, tileSize, baseColor, tileIndex) {
  // базовая заливка
  ctx.fillStyle = baseColor;
  ctx.fillRect(tileX, 0, tileSize, tileSize);

  // “зерно” (детерминированное) — чтобы выглядело как пиксельная карта
  // лёгкий дезеринг: часть пикселей чуть светлее/темнее
  const lighter = adjust(baseColor, +14);
  const darker = adjust(baseColor, -14);

  for (let py = 0; py < tileSize; py++) {
    for (let px = 0; px < tileSize; px++) {
      const h = hash2D(99991 + tileIndex * 97, px, py);
      if (h < 0.055) {
        ctx.fillStyle = lighter;
        ctx.fillRect(tileX + px, py, 1, 1);
      } else if (h > 0.945) {
        ctx.fillStyle = darker;
        ctx.fillRect(tileX + px, py, 1, 1);
      }
    }
  }
}

// Главная функция: создаёт один tileset-канвас со всеми тайлами
export function createGeoTilesetTexture(scene, key, tileSize, terrainCfg) {
  const indexMap = buildIndexMap(terrainCfg);
  const width = indexMap.total * tileSize;
  const height = tileSize;

  const tex = scene.textures.createCanvas(key, width, height);
  const ctx = tex.getContext();

  // порядок строго соответствует indexMap
  const all = [
    ...terrainCfg.waterColors,
    ...terrainCfg.sandColors,
    ...terrainCfg.grassColors,
    ...terrainCfg.dirtColors,
    ...terrainCfg.forestColors,
    ...terrainCfg.mountainColors,
  ];

  for (let idx = 0; idx < all.length; idx++) {
    const x = idx * tileSize;
    paintTile(ctx, x, tileSize, all[idx], idx);
  }

  tex.refresh();
  return indexMap;
}