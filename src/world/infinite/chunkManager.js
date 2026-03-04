// src/world/infinite/chunkManager.js
import { sampleHM, sampleTerrain } from "./terrainSampler.js";
import { clamp } from "../gen/genRules.js";
import { createTerrainTextureBank } from "./terrainTextures.js";

function key(cx, cy) { return `${cx},${cy}`; }

function hashLocal(seed, x, y) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed >>> 0, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return (n >>> 0) / 4294967296;
}

function pickVariant(seed, x, y, colors, salt) {
  const idx = Math.floor(hashLocal(seed + salt, x, y) * colors.length);
  return colors[Math.max(0, Math.min(colors.length - 1, idx))];
}

export function createChunkManager(scene, cfg, palette) {
  const cam = scene.cameras.main;

  const tileSize = cfg.tileSize;
  const chunkSize = cfg.chunkSize;
  const chunkPx = chunkSize * tileSize;

  // Visual toggles
  const useTextures = cfg.useTextures ?? true;
  const textureVariants = cfg.textureVariants ?? 8;

  // Water animation (shoreline waves)
  const waterWaves = cfg.waterWaves ?? true;
  const waveAnimFps = cfg.waveAnimFps ?? 15;
  const waveIntervalMs = 1000 / waveAnimFps;
  const maxWaveUpdatesPerFrame = cfg.maxWaveUpdatesPerFrame ?? 3;
  let waveCursor = 0;

  const texBank = useTextures
    ? createTerrainTextureBank({ seed: cfg.worldSeed, tileSize, variants: textureVariants })
    : null;

  function surfaceToKind(surface, moist) {
    switch (surface) {
      case "shallow_water": return "water_shallow";
      case "deep_water": return "water_deep";
      case "beach": return "sand";
      case "coast_cliff": return "cliff";
      case "snow": return "snow";
      case "rock": return "rock";
      case "swamp": return "swamp";
      case "forest": return "forest";
      case "desert": return "desert";
      case "land":
      default: {
        const dryMoist = cfg.dryTextureMoist ?? 0.38;
        return (moist ?? 0.5) < dryMoist ? "dry" : "grass";
      }
    }
  }

  const chunks = new Map();
  const cachedChunks = new Map();
  const queued = new Set();
  const queue = [];
  let queueHead = 0;
  let cacheTick = 0;
  const chunkCacheLimit = Math.max(0, cfg.chunkCacheLimit ?? 48);
  let lastViewChunkBounds = null;

  function worldToChunkCoord(worldX) {
    return Math.floor(worldX / chunkPx);
  }

  function enqueue(cx, cy) {
    const k = key(cx, cy);
    if (chunks.has(k) || cachedChunks.has(k) || queued.has(k)) return;
    queued.add(k);
    queue.push({ cx, cy });
  }

  function touchCacheEntry(c) {
    c.lastUsed = ++cacheTick;
  }

  function destroyChunkAssets(c) {
    c.img.destroy();
    scene.textures.remove(c.texKey);
    if (c.wave) {
      c.wave.img.destroy();
      scene.textures.remove(c.wave.waveKey);
    }
  }

  function pruneCache() {
    if (chunkCacheLimit <= 0) {
      for (const c of cachedChunks.values()) destroyChunkAssets(c);
      cachedChunks.clear();
      return;
    }
    while (cachedChunks.size > chunkCacheLimit) {
      let oldest = null;
      for (const c of cachedChunks.values()) {
        if (!oldest || c.lastUsed < oldest.lastUsed) oldest = c;
      }
      if (!oldest) break;
      cachedChunks.delete(key(oldest.cx, oldest.cy));
      destroyChunkAssets(oldest);
    }
  }

  function restoreChunkFromCache(cx, cy) {
    const k = key(cx, cy);
    const cached = cachedChunks.get(k);
    if (!cached) return false;

    cachedChunks.delete(k);
    touchCacheEntry(cached);
    cached.img.setPosition(cx * chunkPx, cy * chunkPx).setVisible(true);
    if (cached.wave) cached.wave.img.setPosition(cx * chunkPx, cy * chunkPx).setVisible(true);
    chunks.set(k, cached);
    return true;
  }

  function createChunkTexture(cx, cy) {
    const texKey = `chunk_${cx}_${cy}`;
    const tex = scene.textures.createCanvas(texKey, chunkPx, chunkPx);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;

    const startGX = cx * chunkSize;
    const startGY = cy * chunkSize;

    // Для строгого правила берега нужен уровень соседей
    const B = 1;
    const extW = chunkSize + 2 * B;
    const extH = chunkSize + 2 * B;
    const ext = new Int8Array(extW * extH);
    const eidx = (lx, ly) => ly * extW + lx;

    for (let ly = 0; ly < extH; ly++) {
      for (let lx = 0; lx < extW; lx++) {
        const gx = startGX - B + lx;
        const gy = startGY - B + ly;
        ext[eidx(lx, ly)] = sampleTerrain(cfg.worldSeed, gx, gy, cfg).level;
      }
    }

    const isWater = (lx, ly) => ext[eidx(lx, ly)] <= 0;
    const isLand  = (lx, ly) => ext[eidx(lx, ly)] > 0;

    function hasWaterNeighbor8(lx, ly) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || ny < 0 || nx >= extW || ny >= extH) continue;
        if (isWater(nx, ny)) return true;
      }
      return false;
    }

    function hasLandNeighbor8(lx, ly) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || ny < 0 || nx >= extW || ny >= extH) continue;
        if (isLand(nx, ny)) return true;
      }
      return false;
    }

    function neighborMaxDiff(lx, ly) {
      const c = ext[eidx(lx, ly)];
      let md = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || ny < 0 || nx >= extW || ny >= extH) continue;
        md = Math.max(md, Math.abs(c - ext[eidx(nx, ny)]));
      }
      return md;
    }


// Precompute shoreline entries for wave animation (only if enabled)
const shore_lx = [];
const shore_ly = [];
const shore_gx = [];
const shore_gy = [];
const shore_dx = [];
const shore_dy = [];
const shore_type = []; // 0:water edge, 1:beach runup, 2:cliff spray
const shore_str = [];

function dirToLand(ex, ey) {
  // Prefer cardinal directions for stable waves
  const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
  let best = null;
  let bestH = -999;
  for (let i = 0; i < dirs.length; i++) {
    const dx = dirs[i][0], dy = dirs[i][1];
    const nx = ex + dx, ny = ey + dy;
    if (nx < 0 || ny < 0 || nx >= extW || ny >= extH) continue;
    if (!isLand(nx, ny)) continue;
    const h = ext[eidx(nx, ny)];
    if (h > bestH) { bestH = h; best = [dx, dy]; }
  }
  return best;
}

function dirFromWaterToBeach(ex, ey) {
  const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
  for (let i = 0; i < dirs.length; i++) {
    const dx = dirs[i][0], dy = dirs[i][1];
    const nx = ex + dx, ny = ey + dy;
    if (nx < 0 || ny < 0 || nx >= extW || ny >= extH) continue;
    if (isWater(nx, ny)) return [-dx, -dy]; // water -> this beach cell
  }
  return null;
}

    // Render
    for (let ly = 0; ly < chunkSize; ly++) {
      for (let lx = 0; lx < chunkSize; lx++) {
        const gx = startGX + lx;
        const gy = startGY + ly;

        const L = ext[eidx(lx + B, ly + B)];
        const s = sampleHM(cfg.worldSeed, gx, gy, cfg);

        let color = s.color;

        const landCoast = (L > 0) && hasWaterNeighbor8(lx + B, ly + B);
        const waterNear = (L <= 0) && hasLandNeighbor8(lx + B, ly + B);

        // СТРОГОЕ ПРАВИЛО БЕРЕГА:
        // суша рядом с водой -> пляж или скала
        if (landCoast) {
          const cliff = (L >= 6) || (neighborMaxDiff(lx + B, ly + B) >= 6) || (s.slope >= (cfg.cliffSlope ?? 0.55));
          color = cliff
            ? pickVariant(cfg.worldSeed, gx, gy, palette.mount ?? ["#5f5f5f"], 700)
            : pickVariant(cfg.worldSeed, gx, gy, palette.sand ?? ["#d8c38a"], 701);
        }

        // вода рядом с берегом -> мелководье (градиент) или обрыв (темнее)
        if (waterNear) {
          let wi = clamp((-L) - 1, 0, (palette.water?.length ?? 1) - 1);

          let nearCliff = false;
          for (let dy2 = -1; dy2 <= 1; dy2++) for (let dx2 = -1; dx2 <= 1; dx2++) {
            if (!dx2 && !dy2) continue;
            const nx = lx + B + dx2, ny = ly + B + dy2;
            if (nx < 0 || ny < 0 || nx >= extW || ny >= extH) continue;
            const nL = ext[eidx(nx, ny)];
            if (nL > 0 && (nL >= 6 || Math.abs(nL - L) >= 6)) { nearCliff = true; break; }
          }

          if (nearCliff) wi = Math.max(wi, 4); // резкий обрыв
          else wi = Math.min(wi, 1);            // мелководье

          if (palette.water && palette.water.length) color = palette.water[wi];
        }

        // decide "surface" for texture kind (respect strict shore overrides)
        let surface = s.surface;

        // align surface with strict shore visuals
        if (landCoast) {
          const cliff = (L >= 6) || (neighborMaxDiff(lx + B, ly + B) >= 6) || (s.slope >= (cfg.cliffSlope ?? 0.55));
          surface = cliff ? "coast_cliff" : "beach";
        } else if (waterNear) {
          surface = "shallow_water";
        }

        const kind = surfaceToKind(surface, s.moist);


// Collect shoreline for wave overlay (keep it cheap: only edges)
if (waterWaves) {
  const ex = lx + B;
  const ey = ly + B;

  // Water edge: water cell adjacent to land
  if (L <= 0 && waterNear) {
    const d = dirToLand(ex, ey);
    if (d) {
      shore_lx.push(lx); shore_ly.push(ly);
      shore_gx.push(gx); shore_gy.push(gy);
      shore_dx.push(d[0]); shore_dy.push(d[1]);
      shore_type.push(0);
      shore_str.push(1.0);
    }
  }

  // Beach run-up: beach cell adjacent to water
  if (surface === "beach") {
    const d = dirFromWaterToBeach(ex, ey);
    if (d) {
      shore_lx.push(lx); shore_ly.push(ly);
      shore_gx.push(gx); shore_gy.push(gy);
      shore_dx.push(d[0]); shore_dy.push(d[1]);
      shore_type.push(1);
      shore_str.push(0.75);
    }
  }

  // Cliff spray (optional)
  if (surface === "coast_cliff") {
    const d = dirFromWaterToBeach(ex, ey);
    if (d) {
      shore_lx.push(lx); shore_ly.push(ly);
      shore_gx.push(gx); shore_gy.push(gy);
      shore_dx.push(d[0]); shore_dy.push(d[1]);
      shore_type.push(2);
      shore_str.push(0.55);
    }
  }
}

        const px = lx * tileSize;
        const py = ly * tileSize;

        // base color fill
        ctx.fillStyle = color;
        ctx.fillRect(px, py, tileSize, tileSize);

        // overlay procedural texture (black/white with alpha)
        if (useTextures && texBank) {
          ctx.drawImage(texBank.pick(kind, gx, gy), px, py);
        }

        // subtle slope shading (only for land-ish surfaces)
        const shadeEnabled = cfg.enableSlopeShade ?? true;
        if (shadeEnabled && L > 0 && surface !== "beach" && surface !== "snow") {
          const shade = clamp((s.slope - 0.35) / 0.65, 0, 1) * 0.18;
          if (shade > 0.001) {
            ctx.fillStyle = `rgba(0,0,0,${shade})`;
            ctx.fillRect(px, py, tileSize, tileSize);
          }
        }

        // shoreline decals (foam / wet edge / cliff edge)
        const ex = lx + B;
        const ey = ly + B;
        const nLand = isLand(ex, ey - 1), sLand = isLand(ex, ey + 1), wLand = isLand(ex - 1, ey), eLand = isLand(ex + 1, ey);
        const nWater = isWater(ex, ey - 1), sWater = isWater(ex, ey + 1), wWater = isWater(ex - 1, ey), eWater = isWater(ex + 1, ey);

        if (L <= 0) {
          // foam on water cells next to land
          ctx.fillStyle = "rgba(255,255,255,0.28)";
          if (nLand) ctx.fillRect(px, py, tileSize, 1);
          if (sLand) ctx.fillRect(px, py + tileSize - 1, tileSize, 1);
          if (wLand) ctx.fillRect(px, py, 1, tileSize);
          if (eLand) ctx.fillRect(px + tileSize - 1, py, 1, tileSize);
        } else if (surface === "beach") {
          // wet edge on beach tiles next to water
          ctx.fillStyle = "rgba(0,0,0,0.10)";
          if (nWater) ctx.fillRect(px, py, tileSize, 1);
          if (sWater) ctx.fillRect(px, py + tileSize - 1, tileSize, 1);
          if (wWater) ctx.fillRect(px, py, 1, tileSize);
          if (eWater) ctx.fillRect(px + tileSize - 1, py, 1, tileSize);
        } else if (surface === "coast_cliff") {
          // darker rim for cliffs facing water
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          if (nWater) ctx.fillRect(px, py, tileSize, 1);
          if (sWater) ctx.fillRect(px, py + tileSize - 1, tileSize, 1);
          if (wWater) ctx.fillRect(px, py, 1, tileSize);
          if (eWater) ctx.fillRect(px + tileSize - 1, py, 1, tileSize);
        }

        // Optional extra grain (kept very subtle)
        if (cfg.enableGrain ?? false) {
          const n = ((gx * 73856093) ^ (gy * 19349663) ^ (cfg.worldSeed >>> 0)) >>> 0;
          if ((n & 255) < 8) {
            ctx.fillStyle = "#0000001c";
            ctx.fillRect(
              px + (n % tileSize),
              py + ((n >> 8) % tileSize),
              1,
              1
            );
          }
        }
      }
    }

tex.refresh();
const img = scene.add.image(cx * chunkPx, cy * chunkPx, texKey).setOrigin(0, 0).setDepth(0);

// --- Wave overlay texture (animated) ---
let wave = null;
if (waterWaves && shore_lx.length > 0) {
  const waveKey = `wave_${cx}_${cy}`;
  const wtex = scene.textures.createCanvas(waveKey, chunkPx, chunkPx);
  const wctx = wtex.getContext();
  wctx.imageSmoothingEnabled = false;

  const wimg = scene.add.image(cx * chunkPx, cy * chunkPx, waveKey).setOrigin(0, 0).setDepth(1);
  // Foam looks nicer in additive blend; you can switch to NORMAL if you want.
  if (typeof Phaser !== "undefined") wimg.setBlendMode(Phaser.BlendModes.ADD);
  wimg.setAlpha(cfg.waveLayerAlpha ?? 0.9);

  wave = {
    waveKey,
    tex: wtex,
    ctx: wctx,
    img: wimg,
    last: -1,
    lx: shore_lx,
    ly: shore_ly,
    gx: shore_gx,
    gy: shore_gy,
    dx: shore_dx,
    dy: shore_dy,
    type: shore_type,
    str: shore_str,
  };
}

return { texKey, img, wave };
  }

  function unloadChunk(cx, cy) {
    const k = key(cx, cy);
    const c = chunks.get(k);
    if (!c) return;
    chunks.delete(k);

    if (chunkCacheLimit <= 0) {
      destroyChunkAssets(c);
      return;
    }

    c.img.setVisible(false);
    if (c.wave) c.wave.img.setVisible(false);
    touchCacheEntry(c);
    cachedChunks.set(k, c);
    pruneCache();
  }

  function sameChunkBounds(a, b) {
    return !!a && !!b
      && a.minCX === b.minCX
      && a.maxCX === b.maxCX
      && a.minCY === b.minCY
      && a.maxCY === b.maxCY;
  }

  function updateNeededChunks() {
    const v = cam.worldView;

    const minCX = worldToChunkCoord(v.x) - cfg.marginChunks;
    const maxCX = worldToChunkCoord(v.x + v.width) + cfg.marginChunks;
    const minCY = worldToChunkCoord(v.y) - cfg.marginChunks;
    const maxCY = worldToChunkCoord(v.y + v.height) + cfg.marginChunks;

    const currentBounds = { minCX, maxCX, minCY, maxCY };
    const boundsChanged = !sameChunkBounds(lastViewChunkBounds, currentBounds);

    if (boundsChanged) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        for (let cx = minCX; cx <= maxCX; cx++) {
          if (!restoreChunkFromCache(cx, cy)) enqueue(cx, cy);
        }
      }

      for (const c of chunks.values()) {
        if (c.cx < minCX || c.cx > maxCX || c.cy < minCY || c.cy > maxCY) {
          unloadChunk(c.cx, c.cy);
        }
      }

      lastViewChunkBounds = currentBounds;
    }
  }


function renderWaves(chunk, nowMs) {
  if (!chunk.wave) return;
  const w = chunk.wave;
  const ctx = w.ctx;

  // Clear overlay
  ctx.clearRect(0, 0, chunkPx, chunkPx);

  const t = nowMs * 0.001;

  const speed = cfg.waveSpeed ?? 0.85;         // cycles per second
  const freq = cfg.waveFrequency ?? 0.25;      // how fast waves "travel" inland in tile units
  const runupTiles = cfg.waveRunupTiles ?? 1;  // how many tiles can foam run onto sand
  const beachRunup = cfg.beachRunupTiles ?? 1; // additional run-up on beach entries
  const alphaBase = cfg.waveAlpha ?? 0.45;     // foam intensity

  const count = w.lx.length;

  for (let i = 0; i < count; i++) {
    const dx = w.dx[i], dy = w.dy[i];

    // Phase: waves move in direction (dx,dy) via dot(g,dir)
    let p = (t * speed) + ((w.gx[i] * dx + w.gy[i] * dy) * freq);
    p = p - Math.floor(p); // 0..1

    // Crest shape (triangular, peak at 0.5)
    const crest = 1 - Math.abs(p * 2 - 1);
    if (crest <= 0) continue;

    const type = w.type[i];
    let a = (w.str[i] * crest * alphaBase);

    // Tune by type
    if (type === 1) a *= 0.70; // beach foam softer
    if (type === 2) a *= 0.55; // cliff spray even softer

    if (a < 0.02) continue;

    // How far foam advances this moment
    let maxOff = runupTiles;
    if (type === 1) maxOff = Math.min(maxOff, beachRunup);
    if (type === 2) maxOff = 0;

    const off = Math.floor(p * (maxOff + 1));

    const tx = w.lx[i] + dx * off;
    const ty = w.ly[i] + dy * off;
    if (tx < 0 || ty < 0 || tx >= chunkSize || ty >= chunkSize) continue;

    const px = tx * tileSize;
    const py = ty * tileSize;

    // Soft tile fill
    ctx.fillStyle = `rgba(255,255,255,${a * 0.35})`;
    ctx.fillRect(px, py, tileSize, tileSize);

    // Crisp crest line on the incoming (sea) edge
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    if (dx === 1) ctx.fillRect(px, py, 1, tileSize);
    else if (dx === -1) ctx.fillRect(px + tileSize - 1, py, 1, tileSize);
    else if (dy === 1) ctx.fillRect(px, py, tileSize, 1);
    else if (dy === -1) ctx.fillRect(px, py + tileSize - 1, tileSize, 1);
  }

  w.tex.refresh();
}

function updateWaveOverlays() {
  if (!waterWaves || chunks.size === 0) return;
  const now = scene.time.now;
  const arr = Array.from(chunks.values());
  const n = arr.length;
  if (!n) return;

  let updated = 0;
  let tries = 0;

  while (tries < n && updated < maxWaveUpdatesPerFrame) {
    const c = arr[waveCursor % n];
    waveCursor = (waveCursor + 1) % n;
    tries++;

    if (!c.wave) continue;
    if (c.wave.last >= 0 && (now - c.wave.last) < waveIntervalMs) continue;

    renderWaves(c, now);
    c.wave.last = now;
    updated++;
  }
}

  function processQueue() {
    let budget = cfg.maxGenPerFrame;
    while (budget > 0 && queueHead < queue.length) {
      const { cx, cy } = queue[queueHead++];
      const k = key(cx, cy);
      queued.delete(k);
      if (chunks.has(k)) continue;

      const { texKey, img, wave } = createChunkTexture(cx, cy);
      chunks.set(k, { cx, cy, texKey, img, wave });
      budget--;
    }

    if (queueHead > 0 && queueHead >= queue.length) {
      queue.length = 0;
      queueHead = 0;
    }
  }

  return {
    update() {
      updateNeededChunks();
      processQueue();
      updateWaveOverlays();
    },
    getLoadedCount() { return chunks.size; },
    getCachedCount() { return cachedChunks.size; },
    worldToTile(wx, wy) { return { tx: Math.floor(wx / tileSize), ty: Math.floor(wy / tileSize) }; },
  };
}
