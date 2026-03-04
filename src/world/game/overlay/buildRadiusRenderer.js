// src/world/game/overlay/buildRadiusRenderer.js
// Draws build zones as UNION of circles around each placed building.

function hashColor(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // map to pleasant range
  const hue = (h >>> 0) % 360;
  // convert simple HSL -> RGB-ish packed int (approx)
  const s = 0.65;
  const l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return (r << 16) | (g << 8) | b;
}

export class BuildRadiusRenderer {
  constructor(scene, infiniteCfg, sim) {
    this.scene = scene;
    this.cfg = infiniteCfg;
    this.sim = sim;

    this.tileSize = infiniteCfg.tileSize;
    this.g = scene.add.graphics().setDepth(904);
    this.visible = true;

    this._acc = 0;
    this._lastRev = -1;
    this._lastCam = '';
  }

  setVisible(v) {
    this.visible = !!v;
    this.g.setVisible(this.visible);
    if (!this.visible) this.g.clear();
  }

  update(dtMs) {
    if (!this.visible) return;
    this._acc += dtMs;
    if (this._acc < 180) return;
    this._acc = 0;

    const rev = this.sim?.getRevision?.() ?? 0;
    const cam = this.scene.cameras.main;
    const camSig = `${cam.scrollX.toFixed(0)},${cam.scrollY.toFixed(0)},${cam.zoom.toFixed(3)}`;
    if (rev === this._lastRev && camSig === this._lastCam) return;
    this._lastRev = rev;
    this._lastCam = camSig;

    this.g.clear();
    const circles = this.sim?.getBuildAreaSources?.() ?? [];

    for (const c of circles) {
      if (!c || (c.rTiles ?? 0) <= 0) continue;
      const col = hashColor(c.cityId ?? 'city');
      const x = (c.tx + 0.5) * this.tileSize;
      const y = (c.ty + 0.5) * this.tileSize;
      const r = c.rTiles * this.tileSize;

      if (c.isHub) {
        this.g.lineStyle(2, col, 0.48);
        this.g.fillStyle(col, 0.025);
      } else {
        this.g.lineStyle(1, col, 0.22);
        this.g.fillStyle(col, 0.012);
      }

      this.g.strokeCircle(x, y, r);
      this.g.fillCircle(x, y, r);
    }
  }

  destroy() {
    this.g.destroy();
  }
}
