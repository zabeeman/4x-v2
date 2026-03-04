// src/world/game/overlay/overlayManager.js
// Chunked overlays for district borders and influence.
// Rendered as canvas textures, similar to terrain chunking.

function key(cx, cy) { return `${cx},${cy}`; }

function hashStrToHue(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

function hslToRgb(h, s, l) {
  // h:0..360, s/l:0..1 -> [r,g,b]
  h /= 360;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgba(r, g, b, a) {
  return `rgba(${r},${g},${b},${a})`;
}

export class OverlayManager {
  constructor(scene, infiniteCfg, sim) {
    this.scene = scene;
    this.cfg = infiniteCfg;
    this.sim = sim;

    this.tileSize = infiniteCfg.tileSize;
    this.chunkSize = infiniteCfg.chunkSize;
    this.chunkPx = this.chunkSize * this.tileSize;

    this.marginChunks = infiniteCfg.marginChunks ?? 1;

    this.showDistrict = true;
    this.showInfluence = true;
    this.showBuildArea = true;
    this.showPlacement = true;

    this.placementTypeId = null;
    this._lastPlacementTypeId = null;

    this._district = new Map();
    this._influence = new Map();
    this._buildArea = new Map();
    this._placement = new Map();
    this._queue = [];
    this._queued = new Set();

    this._lastSimRev = -1;

    this.maxGenPerFrame = 1;

    // overlay depths: terrain=0, waves=1, overlays=2.., fog~900, buildings~1100
    this.buildAreaDepth = 901;
    this.districtDepth = 902;
    this.influenceDepth = 903;
    this.placementDepth = 904;
  }

  setToggles({ showDistrict, showInfluence, showBuildArea, showPlacement }) {
    if (typeof showDistrict === 'boolean') this.showDistrict = showDistrict;
    if (typeof showInfluence === 'boolean') this.showInfluence = showInfluence;
    if (typeof showBuildArea === 'boolean') this.showBuildArea = showBuildArea;
    if (typeof showPlacement === 'boolean') this.showPlacement = showPlacement;

    // hide/show images without destroying
    for (const c of this._district.values()) c.img.setVisible(this.showDistrict);
    for (const c of this._influence.values()) c.img.setVisible(this.showInfluence);
    for (const c of this._buildArea.values()) c.img.setVisible(this.showBuildArea);
    for (const c of this._placement.values()) c.img.setVisible(this.showPlacement && !!this.placementTypeId);
  }

  setPlacementType(typeId) {
    this.placementTypeId = typeId;
    // show/hide placement images immediately
    for (const c of this._placement.values()) {
      c.img.setVisible(this.showPlacement && !!this.placementTypeId);
      c.version = -1;
    }
  }

  destroy() {
    for (const c of this._district.values()) {
      c.img.destroy();
      this.scene.textures.remove(c.texKey);
    }
    for (const c of this._influence.values()) {
      c.img.destroy();
      this.scene.textures.remove(c.texKey);
    }
    for (const c of this._buildArea.values()) {
      c.img.destroy();
      this.scene.textures.remove(c.texKey);
    }
    for (const c of this._placement.values()) {
      c.img.destroy();
      this.scene.textures.remove(c.texKey);
    }
    this._district.clear();
    this._influence.clear();
    this._buildArea.clear();
    this._placement.clear();
    this._queue.length = 0;
    this._queued.clear();
  }

  update() {
    this._updateNeededChunks();
    this._processQueue();

    const simRev = this.sim?.getRevision?.() ?? 0;
    const changed = simRev !== this._lastSimRev;

    if (changed) {
      this._lastSimRev = simRev;
      // mark all loaded chunks dirty
      for (const c of this._district.values()) c.version = -1;
      for (const c of this._influence.values()) c.version = -1;
      for (const c of this._buildArea.values()) c.version = -1;
      for (const c of this._placement.values()) c.version = -1;
    }

    // Placement overlay depends on selected building type
    const pChanged = this.placementTypeId !== this._lastPlacementTypeId;
    if (pChanged) {
      this._lastPlacementTypeId = this.placementTypeId;
      for (const c of this._placement.values()) c.version = -1;
    }

    // redraw dirty chunks (budgeted)
    let budget = this.maxGenPerFrame;

    if (this.showDistrict) {
      for (const c of this._district.values()) {
        if (budget <= 0) break;
        if (c.version === simRev) continue;
        this._renderDistrictChunk(c);
        c.version = simRev;
        budget--;
      }
    }

    if (this.showBuildArea) {
      for (const c of this._buildArea.values()) {
        if (budget <= 0) break;
        if (c.version === simRev) continue;
        this._renderBuildAreaChunk(c);
        c.version = simRev;
        budget--;
      }
    }


    if (this.showPlacement && this.placementTypeId) {
      for (const c of this._placement.values()) {
        if (budget <= 0) break;
        if (c.version === simRev) continue;
        this._renderPlacementChunk(c);
        c.version = simRev;
        budget--;
      }
    }

    if (this.showInfluence) {
      for (const c of this._influence.values()) {
        if (budget <= 0) break;
        if (c.version === simRev) continue;
        this._renderInfluenceChunk(c);
        c.version = simRev;
        budget--;
      }
    }
  }

  _worldToChunkCoord(worldX) {
    return Math.floor(worldX / this.chunkPx);
  }

  _updateNeededChunks() {
    const cam = this.scene.cameras.main;
    const v = cam.worldView;

    const minCX = this._worldToChunkCoord(v.x) - this.marginChunks;
    const maxCX = this._worldToChunkCoord(v.x + v.width) + this.marginChunks;
    const minCY = this._worldToChunkCoord(v.y) - this.marginChunks;
    const maxCY = this._worldToChunkCoord(v.y + v.height) + this.marginChunks;

    // enqueue any missing chunks
    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const k = key(cx, cy);
        if (!this._district.has(k) && !this._queued.has(k)) {
          this._queued.add(k);
          this._queue.push({ cx, cy });
        }
      }
    }

    // unload out-of-range chunks
    for (const c of Array.from(this._district.values())) {
      if (c.cx < minCX || c.cx > maxCX || c.cy < minCY || c.cy > maxCY) {
        this._unloadChunk(c.cx, c.cy);
      }
    }
  }

  _processQueue() {
    let budget = this.maxGenPerFrame;
    while (budget > 0 && this._queue.length > 0) {
      const { cx, cy } = this._queue.shift();
      const k = key(cx, cy);
      this._queued.delete(k);
      if (this._district.has(k)) continue;

      this._loadChunk(cx, cy);
      budget--;
    }
  }

  _loadChunk(cx, cy) {
    const k = key(cx, cy);

    // Build-area overlay (above fog)
    const bKey = `buildarea_${cx}_${cy}`;
    const bTex = this.scene.textures.createCanvas(bKey, this.chunkPx, this.chunkPx);
    const bCtx = bTex.getContext();
    bCtx.imageSmoothingEnabled = false;
    const bImg = this.scene.add.image(cx * this.chunkPx, cy * this.chunkPx, bKey)
      .setOrigin(0, 0)
      .setDepth(this.buildAreaDepth)
      .setVisible(this.showBuildArea);
    bImg.setAlpha(0.9);

    this._buildArea.set(k, { cx, cy, texKey: bKey, tex: bTex, ctx: bCtx, img: bImg, version: -1 });
    // Placement overlay (valid tiles for selected building)
    const pKey = `place_${cx}_${cy}`;
    const pTex = this.scene.textures.createCanvas(pKey, this.chunkPx, this.chunkPx);
    const pCtx = pTex.getContext();
    pCtx.imageSmoothingEnabled = false;
    const pImg = this.scene.add.image(cx * this.chunkPx, cy * this.chunkPx, pKey)
      .setOrigin(0, 0)
      .setDepth(this.placementDepth)
      .setVisible(this.showPlacement && !!this.placementTypeId);
    pImg.setAlpha(0.9);

    this._placement.set(k, { cx, cy, texKey: pKey, tex: pTex, ctx: pCtx, img: pImg, version: -1 });


    // District overlay
    const dKey = `district_${cx}_${cy}`;
    const dTex = this.scene.textures.createCanvas(dKey, this.chunkPx, this.chunkPx);
    const dCtx = dTex.getContext();
    dCtx.imageSmoothingEnabled = false;
    const dImg = this.scene.add.image(cx * this.chunkPx, cy * this.chunkPx, dKey)
      .setOrigin(0, 0)
      .setDepth(this.districtDepth)
      .setVisible(this.showDistrict);

    this._district.set(k, { cx, cy, texKey: dKey, tex: dTex, ctx: dCtx, img: dImg, version: -1 });

    // Influence overlay
    const iKey = `influence_${cx}_${cy}`;
    const iTex = this.scene.textures.createCanvas(iKey, this.chunkPx, this.chunkPx);
    const iCtx = iTex.getContext();
    iCtx.imageSmoothingEnabled = false;
    const iImg = this.scene.add.image(cx * this.chunkPx, cy * this.chunkPx, iKey)
      .setOrigin(0, 0)
      .setDepth(this.influenceDepth)
      .setVisible(this.showInfluence);

    // a bit more transparent by default
    iImg.setAlpha(0.85);

    this._influence.set(k, { cx, cy, texKey: iKey, tex: iTex, ctx: iCtx, img: iImg, version: -1 });
  }

  _unloadChunk(cx, cy) {
    const k = key(cx, cy);
    const d = this._district.get(k);
    const i = this._influence.get(k);
    const b = this._buildArea.get(k);
    const p = this._placement.get(k);

    if (d) {
      d.img.destroy();
      this.scene.textures.remove(d.texKey);
      this._district.delete(k);
    }
    if (i) {
      i.img.destroy();
      this.scene.textures.remove(i.texKey);
      this._influence.delete(k);
    }
    if (b) {
      b.img.destroy();
      this.scene.textures.remove(b.texKey);
      this._buildArea.delete(k);
    }
    if (p) {
      p.img.destroy();
      this.scene.textures.remove(p.texKey);
      this._placement.delete(k);
    }
  }

  _renderBuildAreaChunk(chunk) {
    console.log("Overlay buildzone updated");
    const ctx = chunk.ctx;
    ctx.clearRect(0, 0, this.chunkPx, this.chunkPx);

    const startGX = chunk.cx * this.chunkSize;
    const startGY = chunk.cy * this.chunkSize;

    const fillAlpha = 0.14;

    for (let ly = 0; ly < this.chunkSize; ly++) {
      for (let lx = 0; lx < this.chunkSize; lx++) {
        const gx = startGX + lx;
        const gy = startGY + ly;
        const info = this.sim.getBuildAreaInfo(gx, gy);
        if (!info?.buildable) continue;
        if (info.disputed) continue;
        if (!info.cityId) continue;

        const hue = hashStrToHue(info.cityId);
        const [r, g, b] = hslToRgb(hue, 0.55, 0.55);
        ctx.fillStyle = rgba(r, g, b, fillAlpha);
        ctx.fillRect(lx * this.tileSize, ly * this.tileSize, this.tileSize, this.tileSize);
      }
    }

    chunk.tex.refresh();
  }

  _renderDistrictChunk(chunk) {
    const ctx = chunk.ctx;
    ctx.clearRect(0, 0, this.chunkPx, this.chunkPx);

    const startGX = chunk.cx * this.chunkSize;
    const startGY = chunk.cy * this.chunkSize;

    const showFill = true;
    const fillAlpha = 0.08;

    // Precompute district id per tile for this chunk
    const ids = new Array(this.chunkSize * this.chunkSize);
    const disputed = new Array(this.chunkSize * this.chunkSize);

    const idx = (lx, ly) => ly * this.chunkSize + lx;

    for (let ly = 0; ly < this.chunkSize; ly++) {
      for (let lx = 0; lx < this.chunkSize; lx++) {
        const gx = startGX + lx;
        const gy = startGY + ly;
        const info = this.sim.getDistrictInfo(gx, gy);
        ids[idx(lx, ly)] = info.cityId;
        disputed[idx(lx, ly)] = !!info.disputed;

        if (showFill && info.cityId && !info.disputed) {
          const hue = hashStrToHue(info.cityId);
          const [r, g, b] = hslToRgb(hue, 0.55, 0.55);
          ctx.fillStyle = rgba(r, g, b, fillAlpha);
          ctx.fillRect(lx * this.tileSize, ly * this.tileSize, this.tileSize, this.tileSize);
        } else if (info.disputed) {
          ctx.fillStyle = 'rgba(0,0,0,0.10)';
          ctx.fillRect(lx * this.tileSize, ly * this.tileSize, this.tileSize, this.tileSize);
        }
      }
    }

    // Borders
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';

    for (let ly = 0; ly < this.chunkSize; ly++) {
      for (let lx = 0; lx < this.chunkSize; lx++) {
        const id0 = ids[idx(lx, ly)];
        const disp0 = disputed[idx(lx, ly)];
        const px = lx * this.tileSize;
        const py = ly * this.tileSize;

        // right edge
        if (lx < this.chunkSize - 1) {
          const id1 = ids[idx(lx + 1, ly)];
          const disp1 = disputed[idx(lx + 1, ly)];
          if (disp0 || disp1 || (id0 && id1 && id0 !== id1)) {
            ctx.beginPath();
            ctx.moveTo(px + this.tileSize, py);
            ctx.lineTo(px + this.tileSize, py + this.tileSize);
            ctx.stroke();
          }
        }

        // bottom edge
        if (ly < this.chunkSize - 1) {
          const id1 = ids[idx(lx, ly + 1)];
          const disp1 = disputed[idx(lx, ly + 1)];
          if (disp0 || disp1 || (id0 && id1 && id0 !== id1)) {
            ctx.beginPath();
            ctx.moveTo(px, py + this.tileSize);
            ctx.lineTo(px + this.tileSize, py + this.tileSize);
            ctx.stroke();
          }
        }

        // disputed highlight
        if (disp0) {
          ctx.strokeStyle = 'rgba(255, 99, 71, 0.65)';
          ctx.strokeRect(px + 1, py + 1, this.tileSize - 2, this.tileSize - 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        }
      }
    }

    chunk.tex.refresh();
  }

  _renderInfluenceChunk(chunk) {
    const ctx = chunk.ctx;
    ctx.clearRect(0, 0, this.chunkPx, this.chunkPx);

    const startGX = chunk.cx * this.chunkSize;
    const startGY = chunk.cy * this.chunkSize;

    for (let ly = 0; ly < this.chunkSize; ly++) {
      for (let lx = 0; lx < this.chunkSize; lx++) {
        const gx = startGX + lx;
        const gy = startGY + ly;
        const inf = this.sim.getInfluenceStrength(gx, gy); // 0..1
        if (inf <= 0) continue;

        // blue-ish heat with alpha proportional to influence
        const a = Math.min(0.22, 0.06 + inf * 0.18);
        ctx.fillStyle = `rgba(40, 150, 255, ${a})`;
        ctx.fillRect(lx * this.tileSize, ly * this.tileSize, this.tileSize, this.tileSize);
      }
    }

    chunk.tex.refresh();
  }

  // Placement helper: highlight tiles where the currently selected building type can be placed.
  // Uses sim.getPlacementHint(typeId, tx, ty) which mirrors canPlaceBuilding() logic.
  _renderPlacementChunk(chunk) {
    const ctx = chunk.ctx;
    ctx.clearRect(0, 0, this.chunkPx, this.chunkPx);

    if (!this.placementTypeId) {
      chunk.tex.refresh();
      return;
    }

    const startGX = chunk.cx * this.chunkSize;
    const startGY = chunk.cy * this.chunkSize;

    const def = this.sim?.getBuildingDef?.(this.placementTypeId);
    const isExtractor = !!def?.extract;

    // Green fill for regular buildings, purple for extractor availability zones.
    const okAlpha = 0.22;
    ctx.fillStyle = isExtractor
      ? `rgba(171, 71, 188, ${okAlpha})`
      : `rgba(60, 220, 120, ${okAlpha})`;

    for (let ly = 0; ly < this.chunkSize; ly++) {
      for (let lx = 0; lx < this.chunkSize; lx++) {
        const gx = startGX + lx;
        const gy = startGY + ly;
        const res = this.sim.getPlacementHint(this.placementTypeId, gx, gy);
        if (!res?.ok) continue;
        ctx.fillRect(lx * this.tileSize, ly * this.tileSize, this.tileSize, this.tileSize);
      }
    }

    chunk.tex.refresh();
  }
}
