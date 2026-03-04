// src/world/infinite/terrainTextures.js
// Small, seed-stable procedural overlay tiles for "textured" look.
// Usage: const bank = createTerrainTextureBank({ seed, tileSize, variants });
// bank.pick("grass", gx, gy) -> CanvasImageSource (tileSize x tileSize), draw on top of base color.

function hash01(seed, x, y) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed >>> 0, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return (n >>> 0) / 4294967296;
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function speckles(ctx, seed, variant, s, opt) {
  const pL = opt.pLight ?? 0.06;
  const pD = opt.pDark ?? 0.06;
  const aL = opt.alphaLight ?? 0.14;
  const aD = opt.alphaDark ?? 0.14;

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const r = hash01(seed + 1009 + variant * 977, x, y);
      if (r < pL) {
        ctx.fillStyle = `rgba(255,255,255,${aL})`;
        ctx.fillRect(x, y, 1, 1);
      } else if (r > 1 - pD) {
        ctx.fillStyle = `rgba(0,0,0,${aD})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

function strokeLine(ctx, x0, y0, x1, y1) {
  // integer-ish Bresenham for crisp 1px strokes
  let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function waves(ctx, seed, variant, s, opt) {
  const count = opt.count ?? 2;
  const a = opt.alpha ?? 0.16;
  const dark = opt.dark ?? false;

  ctx.fillStyle = dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;

  const phase = Math.floor(hash01(seed + 2027, variant, 0) * 1000);
  for (let i = 0; i < count; i++) {
    const baseY = Math.floor(((i + 1) * s) / (count + 1));
    const amp = Math.max(1, Math.floor(s * 0.12));
    const freq = 0.9 + hash01(seed + 2029, variant, i) * 0.9;

    let prevX = 0;
    let prevY = baseY;

    for (let x = 0; x < s; x++) {
      const y = baseY + Math.round(Math.sin((x + phase) * freq * 0.35) * amp);
      if (x > 0) strokeLine(ctx, prevX, prevY, x, y);
      prevX = x; prevY = y;
    }
  }
}

function ripples(ctx, seed, variant, s, opt) {
  const a = opt.alpha ?? 0.12;
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  const lines = opt.lines ?? 2;
  const dir = (hash01(seed + 3031, variant, 7) < 0.5) ? 1 : -1;

  for (let i = 0; i < lines; i++) {
    const y0 = Math.floor(((i + 1) * s) / (lines + 1));
    for (let x = 0; x < s; x++) {
      const y = (y0 + dir * Math.floor((x + variant) / 3)) % s;
      ctx.fillRect(x, (y + s) % s, 1, 1);
    }
  }
}

function blades(ctx, seed, variant, s) {
  // tiny 1px vertical-ish blades
  const count = 1 + Math.floor(hash01(seed + 4049, variant, 0) * 3);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash01(seed + 4051, variant, i) * s);
    const y = Math.floor(hash01(seed + 4057, variant, i) * s);
    const h = 1 + Math.floor(hash01(seed + 4061, variant, i) * Math.max(1, Math.floor(s * 0.35)));
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    strokeLine(ctx, x, y, x, Math.min(s - 1, y + h));
  }
}

function blobs(ctx, seed, variant, s, opt) {
  const count = opt.count ?? 2;
  const a = opt.alpha ?? 0.18;
  const dark = opt.dark ?? true;
  ctx.fillStyle = dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;

  for (let i = 0; i < count; i++) {
    const x = Math.floor(hash01(seed + 5099, variant, i) * s);
    const y = Math.floor(hash01(seed + 5101, variant, i) * s);
    const w = 1 + Math.floor(hash01(seed + 5107, variant, i) * Math.max(1, Math.floor(s * 0.45)));
    const h = 1 + Math.floor(hash01(seed + 5113, variant, i) * Math.max(1, Math.floor(s * 0.45)));
    ctx.fillRect(x, y, w, h);
  }
}

function cracks(ctx, seed, variant, s, opt) {
  const count = opt.count ?? 1;
  const a = opt.alpha ?? 0.22;
  ctx.fillStyle = `rgba(0,0,0,${a})`;

  for (let i = 0; i < count; i++) {
    const x0 = Math.floor(hash01(seed + 6007, variant, i) * s);
    const y0 = Math.floor(hash01(seed + 6011, variant, i) * s);
    const x1 = Math.floor(hash01(seed + 6017, variant, i) * s);
    const y1 = Math.floor(hash01(seed + 6023, variant, i) * s);
    strokeLine(ctx, x0, y0, x1, y1);
  }
}

function strata(ctx, seed, variant, s) {
  // cliff strata lines
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  const step = Math.max(2, Math.floor(s * 0.33));
  const offs = Math.floor(hash01(seed + 7001, variant, 0) * step);
  for (let y = offs; y < s; y += step) {
    for (let x = 0; x < s; x++) {
      if (hash01(seed + 7003, x + variant * 17, y) < 0.65) ctx.fillRect(x, y, 1, 1);
    }
  }
}

function buildOverlayTile(tileSize, seed, kind, variant) {
  const c = makeCanvas(tileSize, tileSize);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, tileSize, tileSize);

  // Each kind is an overlay (black/white with alpha) that is applied over base color.
  switch (kind) {
    case "water_shallow":
      waves(ctx, seed, variant, tileSize, { count: 2, alpha: 0.0018 });
      speckles(ctx, seed + 11, variant, tileSize, { pLight: 0.045, pDark: 0.030, alphaLight: 0.14, alphaDark: 0.08 });
      break;

    case "water_deep":
      waves(ctx, seed + 17, variant, tileSize, { count: 2, alpha: 0.0009, dark: true });
      speckles(ctx, seed + 19, variant, tileSize, { pLight: 0.018, pDark: 0.075, alphaLight: 0.009, alphaDark: 0.16 });
      break;

    case "sand":
      ripples(ctx, seed + 23, variant, tileSize, { alpha: 0.12, lines: 2 });
      speckles(ctx, seed + 29, variant, tileSize, { pLight: 0.055, pDark: 0.040, alphaLight: 0.12, alphaDark: 0.12 });
      break;

    case "grass":
      speckles(ctx, seed + 31, variant, tileSize, { pLight: 0.050, pDark: 0.050, alphaLight: 0.10, alphaDark: 0.12 });
      blades(ctx, seed + 37, variant, tileSize);
      break;

    case "dry":
    case "desert":
      ripples(ctx, seed + 41, variant, tileSize, { alpha: 0.16, lines: 3 });
      speckles(ctx, seed + 43, variant, tileSize, { pLight: 0.030, pDark: 0.060, alphaLight: 0.08, alphaDark: 0.14 });
      break;

    case "forest":
      blobs(ctx, seed + 47, variant, tileSize, { count: 2, alpha: 0.22, dark: true });
      speckles(ctx, seed + 53, variant, tileSize, { pLight: 0.020, pDark: 0.085, alphaLight: 0.06, alphaDark: 0.18 });
      break;

    case "rock":
      cracks(ctx, seed + 59, variant, tileSize, { count: 1, alpha: 0.26 });
      speckles(ctx, seed + 61, variant, tileSize, { pLight: 0.018, pDark: 0.090, alphaLight: 0.06, alphaDark: 0.16 });
      break;

    case "cliff":
      strata(ctx, seed + 67, variant, tileSize);
      cracks(ctx, seed + 71, variant, tileSize, { count: 1, alpha: 0.22 });
      break;

    case "snow":
      speckles(ctx, seed + 73, variant, tileSize, { pLight: 0.020, pDark: 0.035, alphaLight: 0.10, alphaDark: 0.10 });
      break;

    case "swamp":
      blobs(ctx, seed + 79, variant, tileSize, { count: 2, alpha: 0.20, dark: true });
      speckles(ctx, seed + 83, variant, tileSize, { pLight: 0.020, pDark: 0.070, alphaLight: 0.08, alphaDark: 0.16 });
      break;

    default:
      speckles(ctx, seed + 97, variant, tileSize, { pLight: 0.04, pDark: 0.04, alphaLight: 0.10, alphaDark: 0.10 });
      break;
  }

  return c;
}

export function createTerrainTextureBank(opts) {
  const seed = (opts.seed ?? 0) >>> 0;
  const tileSize = opts.tileSize ?? 8;
  const variants = Math.max(1, opts.variants ?? 8);

  const kinds = [
    "water_shallow",
    "water_deep",
    "sand",
    "grass",
    "dry",
    "desert",
    "forest",
    "rock",
    "cliff",
    "snow",
    "swamp",
  ];

  const bank = {};
  for (const k of kinds) {
    bank[k] = [];
    for (let v = 0; v < variants; v++) {
      bank[k].push(buildOverlayTile(tileSize, seed, k, v));
    }
  }

  function pick(kind, gx, gy) {
    const arr = bank[kind] ?? bank.grass;
    const idx = Math.floor(hash01(seed + 900000 + (kind.length * 97), gx, gy) * arr.length);
    return arr[Math.max(0, Math.min(arr.length - 1, idx))];
  }

  return { pick };
}
