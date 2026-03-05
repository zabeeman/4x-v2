// src/world/game/ui/overlayManager.js
// Legacy module: active runtime overlay manager lives in src/world/game/overlay/overlayManager.js.
// Renders district boundaries, influence radii, and trade routes on top of the world.

function pickColor(idx) {
  const palette = [
    0x00b4d8, 0x90be6d, 0xf9c74f, 0xf8961e, 0xf94144,
    0x577590, 0x43aa8b, 0x4d908e, 0x277da1, 0x9b5de5,
  ];
  return palette[idx % palette.length];
}

export class OverlayManager {
  constructor(scene, infiniteCfg, sim) {
    this.scene = scene;
    this.cfg = infiniteCfg;
    this.sim = sim;

    this.flags = {
      districts: true,
      influence: true,
      routes: true,
    };

    this.selection = {
      routeModeActive: false,
      routeA: null,
    };

    this.gfx = this.scene.add.graphics().setDepth(1200);
    this._acc = 0;
    this._lastSig = '';
  }

  setFlags(flags) {
    this.flags = { ...this.flags, ...flags };
  }

  setSim(sim) {
    this.sim = sim;
    this._lastSig = '';
  }

  setRouteSelection(active, routeA) {
    this.selection.routeModeActive = !!active;
    this.selection.routeA = routeA ?? null;
  }

  update(dtMs) {
    this._acc += dtMs;
    const interval = 180;
    if (this._acc < interval) return;
    this._acc = 0;

    const cam = this.scene.cameras.main;
    const cities = this.sim.getCities();
    const routes = this.sim.state.trade.routes;
    const sig = `${this.sim.state.version}|${cam.scrollX.toFixed(0)}|${cam.scrollY.toFixed(0)}|${cam.zoom.toFixed(3)}|${this.flags.districts?'1':'0'}${this.flags.influence?'1':'0'}${this.flags.routes?'1':'0'}|${routes.length}|${cities.length}|${this.selection.routeA||''}|${this.selection.routeModeActive?'1':'0'}`;
    if (sig === this._lastSig) return;
    this._lastSig = sig;

    this.gfx.clear();
    const ts = this.cfg.tileSize;

    // Draw district boundaries and influence circles
    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      const col = pickColor(i);
      const hx = (c.hub.tx + 0.5) * ts;
      const hy = (c.hub.ty + 0.5) * ts;

      if (this.flags.districts) {
        const rTiles = this.sim.getCityBuildRadiusTiles(c.id);
        const r = rTiles * ts;
        this.gfx.fillStyle(col, 0.018);
        this.gfx.fillCircle(hx, hy, r);
        this.gfx.lineStyle(2, col, 0.28);
        this.gfx.strokeCircle(hx, hy, r);
      }

      if (this.flags.influence) {
        const rTiles = this.sim.getCityInfluenceRadiusTiles(c.id);
        const r = rTiles * ts;
        this.gfx.fillStyle(col, 0.012);
        this.gfx.fillCircle(hx, hy, r);
        this.gfx.lineStyle(1, col, 0.18);
        this.gfx.strokeCircle(hx, hy, r);
      }

      if (this.selection.routeModeActive && this.selection.routeA === c.id) {
        this.gfx.lineStyle(3, 0xffffff, 0.35);
        this.gfx.strokeCircle(hx, hy, ts * 1.1);
      }
    }

    // Voronoi-ish border hint (perpendicular bisectors for close hubs)
    if (this.flags.districts && cities.length >= 2) {
      const buf = this.sim.data.balance.district?.borderBufferTiles ?? 2;
      const L = 8000;
      for (let i = 0; i < cities.length; i++) {
        for (let j = i + 1; j < cities.length; j++) {
          const a = cities[i], b = cities[j];
          const dx = b.hub.tx - a.hub.tx;
          const dy = b.hub.ty - a.hub.ty;
          const d = Math.hypot(dx, dy);
          if (d <= 0.001) continue;

          // only show if hubs are relatively close
          const ra = this.sim.getCityBuildRadiusTiles(a.id);
          const rb = this.sim.getCityBuildRadiusTiles(b.id);
          if (d > (ra + rb + buf * 2 + 8)) continue;

          const mx = (a.hub.tx + b.hub.tx) * 0.5;
          const my = (a.hub.ty + b.hub.ty) * 0.5;

          const px = -dy / d;
          const py = dx / d;

          const x1 = (mx + px * L) * ts;
          const y1 = (my + py * L) * ts;
          const x2 = (mx - px * L) * ts;
          const y2 = (my - py * L) * ts;

          this.gfx.lineStyle(3, 0xff006e, 0.06);
          this.gfx.beginPath();
          this.gfx.moveTo(x1, y1);
          this.gfx.lineTo(x2, y2);
          this.gfx.strokePath();
        }
      }
    }

    // Trade routes
    if (this.flags.routes) {
      for (const r of routes) {
        if (!r.active) continue;
        const a = cities.find(c => c.id === r.aCityId);
        const b = cities.find(c => c.id === r.bCityId);
        if (!a || !b) continue;

        const col = r.mode === 'water' ? 0x4cc9f0 : 0xf9c74f;
        const alpha = r.manual ? 0.35 : 0.15;
        const w = r.manual ? 3 : 2;
        this.gfx.lineStyle(w, col, alpha);

        const pts = (r.path && r.path.length >= 2) ? r.path : [
          { tx: a.hub.tx, ty: a.hub.ty },
          { tx: b.hub.tx, ty: b.hub.ty },
        ];

        this.gfx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const x = (p.tx + 0.5) * ts;
          const y = (p.ty + 0.5) * ts;
          if (i === 0) this.gfx.moveTo(x, y);
          else this.gfx.lineTo(x, y);
        }
        this.gfx.strokePath();
      }
    }
  }
}
