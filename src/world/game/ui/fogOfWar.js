// src/world/game/ui/fogOfWar.js

import { gridToScreen, screenToGrid } from "../../render/isoProjector.js";

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

  _chunkBounds(cx, cy) {
    if (!this.infiniteCfg.isoMode) {
      return { x: cx * this.chunkPx, y: cy * this.chunkPx, w: this.chunkPx, h: this.chunkPx };
    }
    const startGX = cx * this.chunkTiles;
    const startGY = cy * this.chunkTiles;
    const corners = [
      gridToScreen(startGX, startGY, this.infiniteCfg),
      gridToScreen(startGX + this.chunkTiles, startGY, this.infiniteCfg),
      gridToScreen(startGX, startGY + this.chunkTiles, this.infiniteCfg),
      gridToScreen(startGX + this.chunkTiles, startGY + this.chunkTiles, this.infiniteCfg),
    ];
    const xs = corners.map(c => c.x);
    const ys = corners.map(c => c.y);
    const minX = Math.floor(Math.min(...xs) - 2);
    const minY = Math.floor(Math.min(...ys) - 2);
    const maxX = Math.ceil(Math.max(...xs) + 2);
    const maxY = Math.ceil(Math.max(...ys) + 2);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
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
    const bounds = this._chunkBounds(cx, cy);
    const tex = this.scene.textures.createCanvas(texKey, bounds.w, bounds.h);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;

    const data = new Uint8Array(this.chunkTiles * this.chunkTiles);

    // fully fogged
    ctx.clearRect(0, 0, bounds.w, bounds.h);
    ctx.fillStyle = `rgba(0,0,0,${this.alpha})`;
    ctx.fillRect(0, 0, bounds.w, bounds.h);
    tex.refresh();

    const img = this.scene.add.image(bounds.x, bounds.y, texKey)
      .setOrigin(0, 0)
      .setDepth(this.gameCfg.fog.depth ?? 900);

    const c = { cx, cy, texKey, tex, img, data, bounds };
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
    ctx.clearRect(0, 0, c.bounds.w, c.bounds.h);
    ctx.fillStyle = `rgba(0,0,0,${this.alpha})`;
    ctx.fillRect(0, 0, c.bounds.w, c.bounds.h);

    // remove fog on revealed tiles
    ctx.globalCompositeOperation = "destination-out";
    for (let ly = 0; ly < this.chunkTiles; ly++) {
      for (let lx = 0; lx < this.chunkTiles; lx++) {
        if (c.data[ly * this.chunkTiles + lx] === 1) {
          if (!this.infiniteCfg.isoMode) {
            ctx.fillRect(lx * this.tileSize, ly * this.tileSize, this.tileSize, this.tileSize);
          } else {
            const gx = c.cx * this.chunkTiles + lx;
            const gy = c.cy * this.chunkTiles + ly;
            const p0 = gridToScreen(gx, gy, this.infiniteCfg);
            const p1 = gridToScreen(gx + 1, gy, this.infiniteCfg);
            const p2 = gridToScreen(gx + 1, gy + 1, this.infiniteCfg);
            const p3 = gridToScreen(gx, gy + 1, this.infiniteCfg);
            ctx.beginPath();
            ctx.moveTo(p0.x - c.bounds.x, p0.y - c.bounds.y);
            ctx.lineTo(p1.x - c.bounds.x, p1.y - c.bounds.y);
            ctx.lineTo(p2.x - c.bounds.x, p2.y - c.bounds.y);
            ctx.lineTo(p3.x - c.bounds.x, p3.y - c.bounds.y);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }
    ctx.globalCompositeOperation = "source-over";

    c.tex.refresh();
  }

  _updateNeededChunks() {
    const v = this.cam.worldView;
    const marginChunks = this.infiniteCfg.marginChunks ?? 2;

    let minCX; let maxCX; let minCY; let maxCY;
    if (!this.infiniteCfg.isoMode) {
      minCX = Math.floor(v.x / this.chunkPx) - marginChunks;
      maxCX = Math.floor((v.x + v.width) / this.chunkPx) + marginChunks;
      minCY = Math.floor(v.y / this.chunkPx) - marginChunks;
      maxCY = Math.floor((v.y + v.height) / this.chunkPx) + marginChunks;
    } else {
      const corners = [
        screenToGrid(v.x, v.y, this.infiniteCfg),
        screenToGrid(v.x + v.width, v.y, this.infiniteCfg),
        screenToGrid(v.x, v.y + v.height, this.infiniteCfg),
        screenToGrid(v.x + v.width, v.y + v.height, this.infiniteCfg),
      ];
      const gxs = corners.map(c => c.gx);
      const gys = corners.map(c => c.gy);
      minCX = Math.floor((Math.min(...gxs) - marginChunks * this.chunkTiles) / this.chunkTiles);
      maxCX = Math.floor((Math.max(...gxs) + marginChunks * this.chunkTiles) / this.chunkTiles);
      minCY = Math.floor((Math.min(...gys) - marginChunks * this.chunkTiles) / this.chunkTiles);
      maxCY = Math.floor((Math.max(...gys) + marginChunks * this.chunkTiles) / this.chunkTiles);
    }

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
