import { sampleTerrain } from "./terrainSampler.js";
import { clamp } from "../gen/genRules.js";
import { createTerrainTextureBank } from "./terrainTextures.js";
import { screenToGrid, snapGrid } from "../render/isoProjector.js";
import { getChunkBounds, worldViewToChunkRange, tileDiamond, drawTilePath } from "../render/renderSpace.js";

function key(cx, cy) {
  return `${cx},${cy}`;
}

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

  const useTextures = cfg.useTextures ?? true;
  const textureVariants = cfg.textureVariants ?? 8;
  const texBank = useTextures ? createTerrainTextureBank({ seed: cfg.worldSeed, tileSize, variants: textureVariants }) : null;

  const chunks = new Map();
  const cachedChunks = new Map();
  const queued = new Set();
  const queue = [];
  let queueHead = 0;
  let lastViewChunkBounds = null;

  let cacheTick = 0;
  const chunkCacheLimit = Math.max(0, cfg.chunkCacheLimit ?? 48);

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

  function touchCacheEntry(c) {
    c.lastUsed = ++cacheTick;
  }

  function destroyChunkAssets(c) {
    c.img.destroy();
    scene.textures.remove(c.texKey);
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

  function enqueue(cx, cy) {
    const k = key(cx, cy);
    if (chunks.has(k) || cachedChunks.has(k) || queued.has(k)) return;
    queued.add(k);
    queue.push({ cx, cy });
  }

  function restoreChunkFromCache(cx, cy) {
    const k = key(cx, cy);
    const cached = cachedChunks.get(k);
    if (!cached) return false;

    cachedChunks.delete(k);
    touchCacheEntry(cached);

    const b = getChunkBounds(cx, cy, chunkSize, cfg);
    cached.img.setPosition(b.x, b.y).setVisible(true);
    chunks.set(k, cached);
    return true;
  }

  function createChunkTexture(cx, cy) {
    const texKey = `chunk_${cx}_${cy}`;
    const bounds = getChunkBounds(cx, cy, chunkSize, cfg);

    const tex = scene.textures.createCanvas(texKey, bounds.w, bounds.h);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;

    const startGX = cx * chunkSize;
    const startGY = cy * chunkSize;

    const tiles = [];
    for (let ly = 0; ly < chunkSize; ly++) {
      for (let lx = 0; lx < chunkSize; lx++) tiles.push({ lx, ly });
    }

    if (cfg.isoMode) {
      tiles.sort((a, b) => {
        const s1 = a.lx + a.ly;
        const s2 = b.lx + b.ly;
        if (s1 !== s2) return s1 - s2;
        return a.lx - b.lx;
      });
    }

    for (const t of tiles) {
      const gx = startGX + t.lx;
      const gy = startGY + t.ly;
      const s = sampleTerrain(cfg.worldSeed, gx, gy, cfg);
      const L = s.level;

      const water = palette.water ?? ["#0f89df"];
      const sand = palette.sand ?? ["#e2cf92"];
      const grass = palette.grass ?? ["#79cc62"];
      const dirt = palette.dirt ?? ["#a1764e"];
      const forest = palette.forest ?? ["#356f37"];
      const mount = palette.mount ?? ["#908d86"];

      let color = pickVariant(cfg.worldSeed, gx, gy, grass, 201);
      if (L <= 0) {
        const wIdx = Math.max(0, Math.min(water.length - 1, Math.abs(Math.min(-1, L)) - 1));
        color = water[wIdx];
      } else if (s.surface === "beach") {
        color = pickVariant(cfg.worldSeed, gx, gy, sand, 202);
      } else if (s.surface === "forest") {
        color = pickVariant(cfg.worldSeed, gx, gy, forest, 203);
      } else if (s.surface === "rock" || s.surface === "coast_cliff" || s.surface === "snow") {
        color = pickVariant(cfg.worldSeed, gx, gy, mount, 204);
      } else {
        const moisture = s.moist ?? 0.5;
        color = moisture < 0.38
          ? pickVariant(cfg.worldSeed, gx, gy, dirt, 205)
          : pickVariant(cfg.worldSeed, gx, gy, grass, 206);
      }

      if (!cfg.isoMode) {
        const px = t.lx * tileSize;
        const py = t.ly * tileSize;
        ctx.fillStyle = color;
        if (cfg.isoMode) {
          drawTilePath(ctx, { a: p0, b: p1, c: p2, d: p3 }, bounds.x, bounds.y);
          ctx.fill();
        } else {
          ctx.fillRect(px, py, tileSize, tileSize);
        }

        if (useTextures && texBank) {
          const kind = surfaceToKind(s.surface, s.moist);
          ctx.drawImage(texBank.pick(kind, gx, gy), px, py);
        }

        const shadeEnabled = cfg.enableSlopeShade ?? true;
        if (shadeEnabled && L > 0 && s.surface !== "beach" && s.surface !== "snow") {
          const shade = clamp((s.slope - 0.35) / 0.65, 0, 1) * 0.18;
          if (shade > 0.001) {
            ctx.fillStyle = `rgba(0,0,0,${shade})`;
            ctx.fillRect(px, py, tileSize, tileSize);
          }
        }
      } else {
        const poly = tileDiamond(gx, gy, cfg);
        ctx.fillStyle = color;
        drawTilePath(ctx, poly, bounds.x, bounds.y);
        ctx.fill();
      }
    }

    tex.refresh();

    const img = scene.add.image(bounds.x, bounds.y, texKey)
      .setOrigin(0, 0)
      .setDepth(0);

    return { texKey, img };
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
    touchCacheEntry(c);
    cachedChunks.set(k, c);
    pruneCache();
  }

  function clearAllChunks() {
    for (const c of chunks.values()) destroyChunkAssets(c);
    chunks.clear();

    for (const c of cachedChunks.values()) destroyChunkAssets(c);
    cachedChunks.clear();

    queued.clear();
    queue.length = 0;
    queueHead = 0;
    lastViewChunkBounds = null;
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
    const { minCX, maxCX, minCY, maxCY } = worldViewToChunkRange(v, cfg, chunkSize, cfg.marginChunks);
    const currentBounds = { minCX, maxCX, minCY, maxCY };
    const boundsChanged = !sameChunkBounds(currentBounds, lastViewChunkBounds);

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

  function processQueue() {
    let budget = cfg.maxGenPerFrame;
    while (budget > 0 && queueHead < queue.length) {
      const { cx, cy } = queue[queueHead++];
      const k = key(cx, cy);
      queued.delete(k);
      if (chunks.has(k)) continue;

      const { texKey, img } = createChunkTexture(cx, cy);
      chunks.set(k, { cx, cy, texKey, img });
      budget--;
    }

    if (queueHead > 0 && queueHead >= queue.length) {
      queue.length = 0;
      queueHead = 0;
    }
  }

  const publicApi = {
    update() {
      updateNeededChunks();
      processQueue();
    },
    getLoadedCount() {
      return chunks.size;
    },
    getCachedCount() {
      return cachedChunks.size;
    },
    worldToTile(wx, wy) {
      if (!cfg.isoMode) {
        return { tx: Math.floor(wx / tileSize), ty: Math.floor(wy / tileSize) };
      }
      const g = screenToGrid(wx, wy, cfg);
      const s = snapGrid(g.gx, g.gy);
      return { tx: s.ix, ty: s.iy };
    },
    refreshProjection() {
      clearAllChunks();
    },
  };

  return publicApi;
}
