// src/world/game/ui/fogOfWar.js

function key(cx, cy) { return `${cx},${cy}`; }

const TILE_HIDDEN = 0;
const TILE_TERRAIN = 1;
const TILE_FULL = 2;

function bitAddr(index) {
  return { byte: index >> 3, mask: 1 << (index & 7) };
}

export class FogOfWar {
  constructor(scene, infiniteCfg, gameCfg) {
    this.scene = scene;
    this.cam = scene.cameras.main;
    this.infiniteCfg = infiniteCfg;
    this.gameCfg = gameCfg;

    this.sim = null;
    this.simRevision = -1;

    this.tileSize = infiniteCfg.tileSize;
    this.chunkTiles = (gameCfg.fog.fogChunkTiles ?? infiniteCfg.chunkSize);
    this.chunkPx = this.chunkTiles * this.tileSize;

    this.fullFogAlpha = gameCfg.fog.fogAlpha ?? 0.82;
    this.terrainFogAlpha = gameCfg.fog.terrainOnlyAlpha ?? Math.max(0, this.fullFogAlpha * 0.55);

    this.baseFullInfoRadiusTiles = gameCfg.fog.fullInfoRadiusTiles ?? 100;
    this.baseTerrainInfoRadiusTiles = gameCfg.fog.terrainInfoRadiusTiles ?? 300;

    this.radiusFullInfoTiles = this.baseFullInfoRadiusTiles;
    this.radiusTerrainInfoTiles = this.baseTerrainInfoRadiusTiles;

    this.stateChunks = new Map(); // persistent bitmap state per chunk
    this.renderChunks = new Map(); // ephemeral visible render objects

    this.dirtySet = new Set();
    this.dirtyQueue = [];
  }

  setSim(sim) {
    this.sim = sim ?? null;
    this.simRevision = -1;
    this._recomputeRadii();
    this._invalidateAllState();
  }

  tileToFogChunk(tx, ty) {
    return {
      cx: Math.floor(tx / this.chunkTiles),
      cy: Math.floor(ty / this.chunkTiles),
    };
  }

  _ensureStateChunk(cx, cy) {
    const k = key(cx, cy);
    if (this.stateChunks.has(k)) return this.stateChunks.get(k);

    const tileCount = this.chunkTiles * this.chunkTiles;
    const byteCount = Math.ceil(tileCount / 8);
    const state = {
      terrainBits: new Uint8Array(byteCount),
      fullBits: new Uint8Array(byteCount),
      computedRevision: -1,
    };
    this.stateChunks.set(k, state);
    return state;
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

  _markDirty(cx, cy) {
    const k = key(cx, cy);
    if (this.dirtySet.has(k)) return;
    this.dirtySet.add(k);
    this.dirtyQueue.push({ cx, cy });
  }

  _forEachTileInChunk(cx, cy, fn) {
    const sx = cx * this.chunkTiles;
    const sy = cy * this.chunkTiles;
    for (let ly = 0; ly < this.chunkTiles; ly++) {
      for (let lx = 0; lx < this.chunkTiles; lx++) fn(sx + lx, sy + ly, lx, ly);
    }
  }

  _getTileState(tx, ty) {
    if (!this.sim) return TILE_HIDDEN;

    const d = this.sim.getDistanceToActiveZone(tx, ty);
    if (!Number.isFinite(d)) return TILE_HIDDEN;

    if (d <= this.radiusFullInfoTiles) return TILE_FULL;
    if (d <= this.radiusTerrainInfoTiles) return TILE_TERRAIN;
    return TILE_HIDDEN;
  }

  _recomputeRadii() {
    let fullBonus = 0;
    let terrainBonus = 0;

    if (this.sim?.getFogRadiusBonuses) {
      const bonus = this.sim.getFogRadiusBonuses();
      fullBonus = Number(bonus?.fullInfoBonusTiles ?? 0) || 0;
      terrainBonus = Number(bonus?.terrainInfoBonusTiles ?? 0) || 0;
    }

    this.radiusFullInfoTiles = Math.max(0, Math.floor(this.baseFullInfoRadiusTiles + fullBonus));
    this.radiusTerrainInfoTiles = Math.max(this.radiusFullInfoTiles, Math.floor(this.baseTerrainInfoRadiusTiles + terrainBonus));
  }

  _invalidateAllState() {
    for (const state of this.stateChunks.values()) state.computedRevision = -1;
    for (const c of this.renderChunks.values()) this._markDirty(c.cx, c.cy);
  }

  _rebuildStateChunk(cx, cy) {
    const state = this._ensureStateChunk(cx, cy);
    state.terrainBits.fill(0);
    state.fullBits.fill(0);

    this._forEachTileInChunk(cx, cy, (tx, ty, lx, ly) => {
      const idx = ly * this.chunkTiles + lx;
      const { byte, mask } = bitAddr(idx);
      const v = this._getTileState(tx, ty);
      if (v >= TILE_TERRAIN) state.terrainBits[byte] |= mask;
      if (v >= TILE_FULL) state.fullBits[byte] |= mask;
    });

    state.computedRevision = this.simRevision;
  }

  _ensureChunkStateActual(cx, cy) {
    const state = this._ensureStateChunk(cx, cy);
    if (state.computedRevision === this.simRevision) return state;
    this._rebuildStateChunk(cx, cy);
    return state;
  }

  _redrawChunk(cx, cy) {
    const rc = this._ensureRenderChunk(cx, cy);
    const state = this._ensureChunkStateActual(cx, cy);
    const ctx = rc.tex.getContext();
    ctx.imageSmoothingEnabled = false;

    ctx.clearRect(0, 0, this.chunkPx, this.chunkPx);
    ctx.fillStyle = `rgba(0,0,0,${this.fullFogAlpha})`;
    ctx.fillRect(0, 0, this.chunkPx, this.chunkPx);

    ctx.fillStyle = `rgba(0,0,0,${this.terrainFogAlpha})`;
    for (let ly = 0; ly < this.chunkTiles; ly++) {
      for (let lx = 0; lx < this.chunkTiles; lx++) {
        const idx = ly * this.chunkTiles + lx;
        const { byte, mask } = bitAddr(idx);
        const terrain = (state.terrainBits[byte] & mask) !== 0;
        const full = (state.fullBits[byte] & mask) !== 0;
        if (terrain && !full) {
          ctx.fillRect(lx * this.tileSize, ly * this.tileSize, this.tileSize, this.tileSize);
        }
      }
    }

    ctx.globalCompositeOperation = "destination-out";
    for (let ly = 0; ly < this.chunkTiles; ly++) {
      for (let lx = 0; lx < this.chunkTiles; lx++) {
        const idx = ly * this.chunkTiles + lx;
        const { byte, mask } = bitAddr(idx);
        if ((state.fullBits[byte] & mask) !== 0) {
          ctx.fillRect(lx * this.tileSize, ly * this.tileSize, this.tileSize, this.tileSize);
        }
      }
    }
    ctx.globalCompositeOperation = "source-over";

    rc.tex.refresh();
  }

  _updateNeededChunks() {
    const v = this.cam.worldView;
    const margin = this.infiniteCfg.marginChunks ?? 2;

    const minCX = Math.floor(v.x / this.chunkPx) - margin;
    const maxCX = Math.floor((v.x + v.width) / this.chunkPx) + margin;
    const minCY = Math.floor(v.y / this.chunkPx) - margin;
    const maxCY = Math.floor((v.y + v.height) / this.chunkPx) + margin;

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
    const { cx, cy } = this.tileToFogChunk(tx, ty);
    const state = this._ensureChunkStateActual(cx, cy);
    const lx = tx - cx * this.chunkTiles;
    const ly = ty - cy * this.chunkTiles;
    if (lx < 0 || ly < 0 || lx >= this.chunkTiles || ly >= this.chunkTiles) return false;
    const idx = ly * this.chunkTiles + lx;
    const { byte, mask } = bitAddr(idx);
    return (state.fullBits[byte] & mask) !== 0;
  }

  isTileTerrainKnown(tx, ty) {
    const { cx, cy } = this.tileToFogChunk(tx, ty);
    const state = this._ensureChunkStateActual(cx, cy);
    const lx = tx - cx * this.chunkTiles;
    const ly = ty - cy * this.chunkTiles;
    if (lx < 0 || ly < 0 || lx >= this.chunkTiles || ly >= this.chunkTiles) return false;
    const idx = ly * this.chunkTiles + lx;
    const { byte, mask } = bitAddr(idx);
    return (state.terrainBits[byte] & mask) !== 0;
  }

  // Backward-compatible no-op for old callsites.
  upsertVisionSource() {}
  removeVisionSource() {}
  revealCircle() {}
  discoverCircle() {}

  update() {
    if (!this.gameCfg.fog.enabled) return;

    const nextRevision = this.sim?.getRevision?.() ?? 0;
    if (nextRevision !== this.simRevision) {
      this.simRevision = nextRevision;
      this._recomputeRadii();
      this._invalidateAllState();
    }

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
    this.dirtyQueue.length = 0;
    this.dirtySet.clear();
    this.simRevision = -1;
  }

  destroy() {
    this.reset();
  }
}
