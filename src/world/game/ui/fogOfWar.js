// src/world/game/ui/fogOfWar.js

function key(cx, cy) { return `${cx},${cy}`; }

function bitIndex(index) {
  return {
    byte: index >> 3,
    mask: 1 << (index & 7),
  };
}

export class FogOfWar {
  constructor(scene, infiniteCfg, gameCfg) {
    this.scene = scene;
    this.cam = scene.cameras.main;
    this.infiniteCfg = infiniteCfg;
    this.gameCfg = gameCfg;

    this.tileSize = infiniteCfg.tileSize;
    this.chunkTiles = (gameCfg.fog.fogChunkTiles ?? infiniteCfg.chunkSize);
    this.chunkPx = this.chunkTiles * this.tileSize;

    this.alpha = gameCfg.fog.fogAlpha ?? 0.9;
    this.terrainOnlyAlpha = gameCfg.fog.terrainOnlyAlpha ?? Math.max(0, this.alpha * 0.6);

    this.renderChunks = new Map(); // k -> { cx, cy, texKey, tex, img }
    this.stateChunks = new Map();  // k -> { terrainBits, visibleBits }
    this.visionSources = new Map(); // id -> { tx, ty, radius }
    this.visibilityDirty = false;

    this.dirtyQueue = [];
    this.dirtySet = new Set();
  }

  tileToFogChunk(tx, ty) {
    const cx = Math.floor(tx / this.chunkTiles);
    const cy = Math.floor(ty / this.chunkTiles);
    return { cx, cy };
  }

  _ensureStateChunk(cx, cy) {
    const k = key(cx, cy);
    if (this.stateChunks.has(k)) return this.stateChunks.get(k);

    const tileCount = this.chunkTiles * this.chunkTiles;
    const byteCount = Math.ceil(tileCount / 8);
    const chunk = {
      terrainBits: new Uint8Array(byteCount),
      visibleBits: new Uint8Array(byteCount),
    };
    this.stateChunks.set(k, chunk);
    return chunk;
  }

  _ensureRenderChunk(cx, cy) {
    const k = key(cx, cy);
    if (this.renderChunks.has(k)) return this.renderChunks.get(k);

    const texKey = `fog_${cx}_${cy}`;
    const tex = this.scene.textures.createCanvas(texKey, this.chunkPx, this.chunkPx);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;

    const img = this.scene.add.image(cx * this.chunkPx, cy * this.chunkPx, texKey)
      .setOrigin(0, 0)
      .setDepth(this.gameCfg.fog.depth ?? 900);

    const chunk = { cx, cy, texKey, tex, img };
    this.renderChunks.set(k, chunk);
    this._markDirty(cx, cy);
    return chunk;
  }

  _tileBitset(tx, ty) {
    const { cx, cy } = this.tileToFogChunk(tx, ty);
    const lx = tx - cx * this.chunkTiles;
    const ly = ty - cy * this.chunkTiles;
    if (lx < 0 || ly < 0 || lx >= this.chunkTiles || ly >= this.chunkTiles) return null;

    const idx = ly * this.chunkTiles + lx;
    return { cx, cy, bit: bitIndex(idx) };
  }

  _markDirty(cx, cy) {
    const k = key(cx, cy);
    if (this.dirtySet.has(k)) return;
    this.dirtySet.add(k);
    this.dirtyQueue.push({ cx, cy });
  }

  _setTileVisible(tx, ty, visible, discover) {
    const tile = this._tileBitset(tx, ty);
    if (!tile) return;

    const state = this._ensureStateChunk(tile.cx, tile.cy);
    const { byte, mask } = tile.bit;

    const prevTerrain = (state.terrainBits[byte] & mask) !== 0;
    const prevVisible = (state.visibleBits[byte] & mask) !== 0;

    if (discover) state.terrainBits[byte] |= mask;
    if (visible) state.visibleBits[byte] |= mask;
    else state.visibleBits[byte] &= ~mask;

    const nextTerrain = (state.terrainBits[byte] & mask) !== 0;
    const nextVisible = (state.visibleBits[byte] & mask) !== 0;
    if (prevTerrain !== nextTerrain || prevVisible !== nextVisible) this._markDirty(tile.cx, tile.cy);
  }

  revealCircle(centerTx, centerTy, radiusTiles) {
    this.discoverCircle(centerTx, centerTy, radiusTiles);
  }

  discoverCircle(centerTx, centerTy, radiusTiles) {
    if (!this.gameCfg.fog.enabled) return;
    const r = radiusTiles;
    const r2 = r * r;

    const minX = Math.floor(centerTx - r);
    const maxX = Math.floor(centerTx + r);
    const minY = Math.floor(centerTy - r);
    const maxY = Math.floor(centerTy + r);

    for (let ty = minY; ty <= maxY; ty++) {
      const dy = ty - centerTy;
      for (let tx = minX; tx <= maxX; tx++) {
        const dx = tx - centerTx;
        if (dx * dx + dy * dy > r2) continue;
        this._setTileVisible(tx, ty, false, true);
      }
    }
  }

  upsertVisionSource(id, tx, ty, radiusTiles) {
    if (!id) return;
    const next = { tx: tx | 0, ty: ty | 0, radius: Math.max(0, radiusTiles | 0) };
    const prev = this.visionSources.get(id);

    if (prev && prev.tx === next.tx && prev.ty === next.ty && prev.radius === next.radius) return;
    this.visionSources.set(id, next);
    this.visibilityDirty = true;
  }

  removeVisionSource(id) {
    if (!id) return;
    if (this.visionSources.delete(id)) this.visibilityDirty = true;
  }

  _rebuildVisibilityBitmap() {
    for (const state of this.stateChunks.values()) state.visibleBits.fill(0);

    for (const src of this.visionSources.values()) {
      const r = src.radius;
      const r2 = r * r;
      const minX = Math.floor(src.tx - r);
      const maxX = Math.floor(src.tx + r);
      const minY = Math.floor(src.ty - r);
      const maxY = Math.floor(src.ty + r);

      for (let ty = minY; ty <= maxY; ty++) {
        const dy = ty - src.ty;
        for (let tx = minX; tx <= maxX; tx++) {
          const dx = tx - src.tx;
          if (dx * dx + dy * dy > r2) continue;
          this._setTileVisible(tx, ty, true, true);
        }
      }
    }

    this.visibilityDirty = false;
  }

  _redrawChunk(cx, cy) {
    const renderChunk = this._ensureRenderChunk(cx, cy);
    const state = this._ensureStateChunk(cx, cy);
    const ctx = renderChunk.tex.getContext();
    ctx.imageSmoothingEnabled = false;

    // unseen cells
    ctx.clearRect(0, 0, this.chunkPx, this.chunkPx);
    ctx.fillStyle = `rgba(0,0,0,${this.alpha})`;
    ctx.fillRect(0, 0, this.chunkPx, this.chunkPx);

    // discovered terrain only
    ctx.fillStyle = `rgba(0,0,0,${this.terrainOnlyAlpha})`;
    for (let ly = 0; ly < this.chunkTiles; ly++) {
      for (let lx = 0; lx < this.chunkTiles; lx++) {
        const idx = ly * this.chunkTiles + lx;
        const { byte, mask } = bitIndex(idx);
        const known = (state.terrainBits[byte] & mask) !== 0;
        const visible = (state.visibleBits[byte] & mask) !== 0;
        if (known && !visible) ctx.fillRect(lx * this.tileSize, ly * this.tileSize, this.tileSize, this.tileSize);
      }
    }

    // fully visible now
    ctx.globalCompositeOperation = "destination-out";
    for (let ly = 0; ly < this.chunkTiles; ly++) {
      for (let lx = 0; lx < this.chunkTiles; lx++) {
        const idx = ly * this.chunkTiles + lx;
        const { byte, mask } = bitIndex(idx);
        if ((state.visibleBits[byte] & mask) !== 0) {
          ctx.fillRect(lx * this.tileSize, ly * this.tileSize, this.tileSize, this.tileSize);
        }
      }
    }
    ctx.globalCompositeOperation = "source-over";

    renderChunk.tex.refresh();
  }

  _updateNeededChunks() {
    const v = this.cam.worldView;
    const marginChunks = this.infiniteCfg.marginChunks ?? 2;

    const minCX = Math.floor(v.x / this.chunkPx) - marginChunks;
    const maxCX = Math.floor((v.x + v.width) / this.chunkPx) + marginChunks;
    const minCY = Math.floor(v.y / this.chunkPx) - marginChunks;
    const maxCY = Math.floor((v.y + v.height) / this.chunkPx) + marginChunks;

    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) this._ensureRenderChunk(cx, cy);
    }

    for (const c of this.renderChunks.values()) {
      if (c.cx < minCX || c.cx > maxCX || c.cy < minCY || c.cy > maxCY) {
        c.img.destroy();
        this.scene.textures.remove(c.texKey);
        this.renderChunks.delete(key(c.cx, c.cy));
      }
    }
  }

  isTileFullyVisible(tx, ty) {
    const tile = this._tileBitset(tx, ty);
    if (!tile) return false;
    const state = this.stateChunks.get(key(tile.cx, tile.cy));
    if (!state) return false;
    return (state.visibleBits[tile.bit.byte] & tile.bit.mask) !== 0;
  }

  isTileTerrainKnown(tx, ty) {
    const tile = this._tileBitset(tx, ty);
    if (!tile) return false;
    const state = this.stateChunks.get(key(tile.cx, tile.cy));
    if (!state) return false;
    return (state.terrainBits[tile.bit.byte] & tile.bit.mask) !== 0;
  }

  update() {
    if (!this.gameCfg.fog.enabled) return;
    if (this.visibilityDirty) this._rebuildVisibilityBitmap();
    this._updateNeededChunks();

    const budget = this.gameCfg.fog.maxFogRedrawPerFrame ?? 2;
    for (let i = 0; i < budget && this.dirtyQueue.length; i++) {
      const { cx, cy } = this.dirtyQueue.shift();
      this.dirtySet.delete(key(cx, cy));
      this._redrawChunk(cx, cy);
    }
  }

  reset() {
    for (const c of this.renderChunks.values()) {
      c.img.destroy();
      this.scene.textures.remove(c.texKey);
    }
    this.renderChunks.clear();
    this.stateChunks.clear();
    this.visionSources.clear();
    this.visibilityDirty = false;
    this.dirtyQueue.length = 0;
    this.dirtySet.clear();
  }

  destroy() {
    this.reset();
  }
}
