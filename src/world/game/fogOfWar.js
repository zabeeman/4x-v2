// src/world/game/fogOfWar.js

function key(cx, cy) { return `${cx},${cy}`; }

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

    this.chunks = new Map(); // k -> { cx, cy, texKey, tex, img, data }
    this.dirtyQueue = [];
    this.dirtySet = new Set();
  }

  tileToFogChunk(tx, ty) {
    const cx = Math.floor(tx / this.chunkTiles);
    const cy = Math.floor(ty / this.chunkTiles);
    return { cx, cy };
  }

  _ensureChunk(cx, cy) {
    const k = key(cx, cy);
    if (this.chunks.has(k)) return this.chunks.get(k);

    const texKey = `fog_${cx}_${cy}`;
    const tex = this.scene.textures.createCanvas(texKey, this.chunkPx, this.chunkPx);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;

    const data = new Uint8Array(this.chunkTiles * this.chunkTiles);

    // fully fogged
    ctx.clearRect(0, 0, this.chunkPx, this.chunkPx);
    ctx.fillStyle = `rgba(0,0,0,${this.alpha})`;
    ctx.fillRect(0, 0, this.chunkPx, this.chunkPx);
    tex.refresh();

    const img = this.scene.add.image(cx * this.chunkPx, cy * this.chunkPx, texKey)
      .setOrigin(0, 0)
      .setDepth(this.gameCfg.fog.depth ?? 900);

    const c = { cx, cy, texKey, tex, img, data };
    this.chunks.set(k, c);
    return c;
  }

  _markDirty(cx, cy) {
    const k = key(cx, cy);
    if (this.dirtySet.has(k)) return;
    this.dirtySet.add(k);
    this.dirtyQueue.push({ cx, cy });
  }

  revealCircle(centerTx, centerTy, radiusTiles) {
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

        const { cx, cy } = this.tileToFogChunk(tx, ty);
        const chunk = this._ensureChunk(cx, cy);

        const lx = tx - cx * this.chunkTiles;
        const ly = ty - cy * this.chunkTiles;
        if (lx < 0 || ly < 0 || lx >= this.chunkTiles || ly >= this.chunkTiles) continue;

        const idx = ly * this.chunkTiles + lx;
        if (chunk.data[idx] === 1) continue;
        chunk.data[idx] = 1;
        this._markDirty(cx, cy);
      }
    }
  }

  _redrawChunk(cx, cy) {
    const c = this._ensureChunk(cx, cy);
    const ctx = c.tex.getContext();
    ctx.imageSmoothingEnabled = false;

    // full fog
    ctx.clearRect(0, 0, this.chunkPx, this.chunkPx);
    ctx.fillStyle = `rgba(0,0,0,${this.alpha})`;
    ctx.fillRect(0, 0, this.chunkPx, this.chunkPx);

    // remove fog on revealed tiles
    ctx.globalCompositeOperation = "destination-out";
    for (let ly = 0; ly < this.chunkTiles; ly++) {
      for (let lx = 0; lx < this.chunkTiles; lx++) {
        if (c.data[ly * this.chunkTiles + lx] === 1) {
          ctx.fillRect(lx * this.tileSize, ly * this.tileSize, this.tileSize, this.tileSize);
        }
      }
    }
    ctx.globalCompositeOperation = "source-over";

    c.tex.refresh();
  }

  _updateNeededChunks() {
    const v = this.cam.worldView;
    const marginChunks = this.infiniteCfg.marginChunks ?? 2;

    const minCX = Math.floor(v.x / this.chunkPx) - marginChunks;
    const maxCX = Math.floor((v.x + v.width) / this.chunkPx) + marginChunks;
    const minCY = Math.floor(v.y / this.chunkPx) - marginChunks;
    const maxCY = Math.floor((v.y + v.height) / this.chunkPx) + marginChunks;

    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) this._ensureChunk(cx, cy);
    }

    for (const c of this.chunks.values()) {
      if (c.cx < minCX || c.cx > maxCX || c.cy < minCY || c.cy > maxCY) {
        c.img.destroy();
        this.scene.textures.remove(c.texKey);
        this.chunks.delete(key(c.cx, c.cy));
      }
    }
  }

  update() {
    if (!this.gameCfg.fog.enabled) return;
    this._updateNeededChunks();

    const budget = this.gameCfg.fog.maxFogRedrawPerFrame ?? 2;
    for (let i = 0; i < budget && this.dirtyQueue.length; i++) {
      const { cx, cy } = this.dirtyQueue.shift();
      this.dirtySet.delete(key(cx, cy));
      this._redrawChunk(cx, cy);
    }
  }

  reset() {
    // clear all fog data and textures
    for (const c of this.chunks.values()) {
      c.img.destroy();
      this.scene.textures.remove(c.texKey);
    }
    this.chunks.clear();
    this.dirtyQueue.length = 0;
    this.dirtySet.clear();
  }

  destroy() {
    this.reset();
  }
}
