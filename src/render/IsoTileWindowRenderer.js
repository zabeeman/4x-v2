import { sampleHM, sampleTerrain } from '../world/infinite/terrainSampler.js';
import { clamp } from '../world/gen/genRules.js';

function hexColorToTint(hex) {
  if (typeof hex !== 'string') return 0xffffff;
  return Number.parseInt(hex.replace('#', ''), 16) || 0xffffff;
}

export class IsoTileWindowRenderer {
  constructor(scene, {
    cfg,
    palette,
    tileW,
    tileH,
    windowW = 80,
    windowH = 80,
    textureKey = '__WHITE',
  }) {
    this.scene = scene;
    this.cfg = cfg;
    this.palette = palette;
    this.tileW = tileW;
    this.tileH = tileH;
    this.windowW = windowW;
    this.windowH = windowH;

    this.container = scene.add.container(0, 0).setDepth(-5).setVisible(false);
    this.tiles = new Array(windowW * windowH);

    let k = 0;
    for (let iy = 0; iy < windowH; iy++) {
      for (let ix = 0; ix < windowW; ix++) {
        const isoX = (ix - iy) * (tileW * 0.5);
        const isoY = (ix + iy) * (tileH * 0.5);
        const tile = scene.add.image(isoX, isoY, textureKey)
          .setOrigin(0.5, 0.5)
          .setDisplaySize(tileW, tileW)
          .setAngle(45)
          .setScale(1, tileH / tileW);
        this.container.add(tile);
        this.tiles[k++] = tile;
      }
    }

    this.originGx = 0;
    this.originGy = 0;
    this.lastCenterGx = null;
    this.lastCenterGy = null;
  }

  _pickColor(gx, gy) {
    const B = 1;
    const extW = 3;
    const ext = new Int8Array(extW * extW);
    const eidx = (lx, ly) => ly * extW + lx;

    for (let ly = 0; ly < extW; ly++) {
      for (let lx = 0; lx < extW; lx++) {
        const wx = gx - B + lx;
        const wy = gy - B + ly;
        ext[eidx(lx, ly)] = sampleTerrain(this.cfg.worldSeed, wx, wy, this.cfg).level;
      }
    }

    const center = ext[eidx(1, 1)];
    const isWater = (lx, ly) => ext[eidx(lx, ly)] <= 0;
    const isLand = (lx, ly) => ext[eidx(lx, ly)] > 0;
    const hasWaterNeighbor8 = (lx, ly) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = lx + dx;
        const ny = ly + dy;
        if (nx < 0 || ny < 0 || nx >= extW || ny >= extW) continue;
        if (isWater(nx, ny)) return true;
      }
      return false;
    };
    const hasLandNeighbor8 = (lx, ly) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = lx + dx;
        const ny = ly + dy;
        if (nx < 0 || ny < 0 || nx >= extW || ny >= extW) continue;
        if (isLand(nx, ny)) return true;
      }
      return false;
    };
    const neighborMaxDiff = (lx, ly) => {
      const c = ext[eidx(lx, ly)];
      let maxDiff = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = lx + dx;
        const ny = ly + dy;
        if (nx < 0 || ny < 0 || nx >= extW || ny >= extW) continue;
        maxDiff = Math.max(maxDiff, Math.abs(c - ext[eidx(nx, ny)]));
      }
      return maxDiff;
    };

    const sampled = sampleHM(this.cfg.worldSeed, gx, gy, this.cfg);
    let color = sampled.color;

    const landCoast = (center > 0) && hasWaterNeighbor8(1, 1);
    const waterNear = (center <= 0) && hasLandNeighbor8(1, 1);

    if (landCoast) {
      const cliff = (center >= 6) || (neighborMaxDiff(1, 1) >= 6) || (sampled.slope >= (this.cfg.cliffSlope ?? 0.55));
      color = cliff
        ? this.palette.mount?.[0] ?? '#5f5f5f'
        : this.palette.sand?.[0] ?? '#d8c38a';
    }

    if (waterNear) {
      let wi = clamp((-center) - 1, 0, (this.palette.water?.length ?? 1) - 1);
      let nearCliff = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nL = ext[eidx(1 + dx, 1 + dy)];
        if (nL > 0 && (nL >= 6 || Math.abs(nL - center) >= 6)) {
          nearCliff = true;
          break;
        }
      }
      wi = nearCliff ? Math.max(wi, 4) : Math.min(wi, 1);
      color = this.palette.water?.[wi] ?? color;
    }

    return hexColorToTint(color);
  }

  redraw(originGx, originGy) {
    this.originGx = originGx;
    this.originGy = originGy;

    const ox = (originGx - originGy) * (this.tileW * 0.5);
    const oy = (originGx + originGy) * (this.tileH * 0.5);
    this.container.setPosition(ox, oy);

    let k = 0;
    for (let iy = 0; iy < this.windowH; iy++) {
      for (let ix = 0; ix < this.windowW; ix++) {
        const gx = originGx + ix;
        const gy = originGy + iy;
        this.tiles[k++].setTint(this._pickColor(gx, gy));
      }
    }
  }

  updateFromCenter(centerGx, centerGy) {
    if (this.lastCenterGx === centerGx && this.lastCenterGy === centerGy) return;
    this.lastCenterGx = centerGx;
    this.lastCenterGy = centerGy;

    const originGx = centerGx - Math.floor(this.windowW / 2);
    const originGy = centerGy - Math.floor(this.windowH / 2);

    if (originGx !== this.originGx || originGy !== this.originGy) {
      this.redraw(originGx, originGy);
    }
  }

  setVisible(flag) {
    this.container.setVisible(!!flag);
  }

  destroy() {
    this.container.destroy(true);
    this.tiles.length = 0;
  }
}
