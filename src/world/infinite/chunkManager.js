// src/world/infinite/chunkManager.js
import { sampleHM, sampleTerrain } from "./terrainSampler.js";
import { clamp } from "../gen/genRules.js";

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

  const chunks = new Map();
  const queued = new Set();
  const queue = [];
  let queueHead = 0;
  let lastViewChunkBounds = null;

  function worldToChunkCoord(worldX) {
    return Math.floor(worldX / chunkPx);
  }

  function enqueue(cx, cy) {
    const k = key(cx, cy);
    if (chunks.has(k) || queued.has(k)) return;
    queued.add(k);
    queue.push({ cx, cy });
  }

  function destroyChunkAssets(c) {
    c.img.destroy();
    scene.textures.remove(c.texKey);
  }

  function createChunkTexture(cx, cy) {
    const texKey = `chunk_${cfg.worldSeed}_${cfg.chunkGenVersion ?? 1}_${cx}_${cy}`;
    const tex = scene.textures.createCanvas(texKey, chunkPx, chunkPx);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;

    const startGX = cx * chunkSize;
    const startGY = cy * chunkSize;

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
    const isLand = (lx, ly) => ext[eidx(lx, ly)] > 0;

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

    for (let ly = 0; ly < chunkSize; ly++) {
      for (let lx = 0; lx < chunkSize; lx++) {
        const gx = startGX + lx;
        const gy = startGY + ly;

        const L = ext[eidx(lx + B, ly + B)];
        const s = sampleHM(cfg.worldSeed, gx, gy, cfg);
        let color = s.color;

        const landCoast = (L > 0) && hasWaterNeighbor8(lx + B, ly + B);
        const waterNear = (L <= 0) && hasLandNeighbor8(lx + B, ly + B);

        if (landCoast) {
          const cliff = (L >= 6) || (neighborMaxDiff(lx + B, ly + B) >= 6) || (s.slope >= (cfg.cliffSlope ?? 0.55));
          color = cliff
            ? pickVariant(cfg.worldSeed, gx, gy, palette.mount ?? ["#5f5f5f"], 700)
            : pickVariant(cfg.worldSeed, gx, gy, palette.sand ?? ["#d8c38a"], 701);
        }

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
          if (nearCliff) wi = Math.max(wi, 4);
          else wi = Math.min(wi, 1);
          if (palette.water && palette.water.length) color = palette.water[wi];
        }

        const px = lx * tileSize;
        const py = ly * tileSize;
        ctx.fillStyle = color;
        ctx.fillRect(px, py, tileSize, tileSize);
      }
    }

    tex.refresh();
    const img = scene.add.image(cx * chunkPx, cy * chunkPx, texKey).setOrigin(0, 0).setDepth(0);
    return { texKey, img };
  }

  function unloadChunk(cx, cy) {
    const k = key(cx, cy);
    const c = chunks.get(k);
    if (!c) return;
    chunks.delete(k);
    destroyChunkAssets(c);
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
          enqueue(cx, cy);
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

  return {
    update() {
      updateNeededChunks();
      processQueue();
    },
    setVisible(visible) {
      for (const c of chunks.values()) c.img.setVisible(!!visible);
    },
    getLoadedCount() { return chunks.size; },
    getCachedCount() { return 0; },
    worldToTile(wx, wy) { return { tx: Math.floor(wx / tileSize), ty: Math.floor(wy / tileSize) }; },
  };
}
