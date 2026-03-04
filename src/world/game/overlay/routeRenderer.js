// src/world/game/overlay/routeRenderer.js
// Draws trade routes as polylines in world space.

export class RouteRenderer {
  constructor(scene, infiniteCfg) {
    this.scene = scene;
    this.cfg = infiniteCfg;
    this.tileSize = infiniteCfg.tileSize;

    this.g = scene.add.graphics();
    this.g.setDepth(905);

    this._lastSig = { routeCount: -1, pathPoints: -1, src: null, hover: null };
  }

  destroy() {
    this.g.destroy();
  }

  _tileToWorld(tx, ty) {
    return { x: (tx + 0.5) * this.tileSize, y: (ty + 0.5) * this.tileSize };
  }

  render(routes, cities, selection = null) {
    // routes: [{id, mode, segments:[{mode,path:[{x,y}]}], aCityId,bCityId, goldPerMin, safety}]
    let pathPoints = 0;
    for (const r of routes) {
      const segs = r.segments ?? [{ mode: r.mode ?? 'land', path: r.path ?? [] }];
      for (const seg of segs) pathPoints += (seg.path?.length ?? 0);
    }

    const src = selection?.src ?? null;
    const hover = selection?.hover ?? null;
    const sameSig = this._lastSig.routeCount === routes.length
      && this._lastSig.pathPoints === pathPoints
      && this._lastSig.src === src
      && this._lastSig.hover === hover;
    if (sameSig) return;

    this._lastSig.routeCount = routes.length;
    this._lastSig.pathPoints = pathPoints;
    this._lastSig.src = src;
    this._lastSig.hover = hover;

    this.g.clear();

    // draw routes
    for (const r of routes) {
      const segs = r.segments ?? [{ mode: r.mode ?? 'land', path: r.path ?? [] }];
      for (const seg of segs) {
        const isWater = seg.mode === 'water';
        // stroke style (land vs water)
        const color = isWater ? 0x2a9dff : 0xd4a373;
        const alpha = isWater ? 0.75 : 0.75;
        const width = isWater ? 3 : 3;
        this.g.lineStyle(width, color, alpha);

        const p = seg.path ?? [];
        if (p.length < 2) continue;

        const w0 = this._tileToWorld(p[0].x, p[0].y);
        this.g.beginPath();
        this.g.moveTo(w0.x, w0.y);
        for (let i = 1; i < p.length; i++) {
          const wi = this._tileToWorld(p[i].x, p[i].y);
          this.g.lineTo(wi.x, wi.y);
        }
        this.g.strokePath();
      }
    }

    // draw hubs / selection markers
    if (cities?.length) {
      for (const c of cities) {
        const w = this._tileToWorld(c.hub.tx, c.hub.ty);
        this.g.fillStyle(0xffffff, 0.35);
        this.g.fillCircle(w.x, w.y, 4);
      }
    }

    if (selection?.src) {
      const c = cities.find(x => x.id === selection.src);
      if (c) {
        const w = this._tileToWorld(c.hub.tx, c.hub.ty);
        this.g.lineStyle(3, 0x06d6a0, 0.95);
        this.g.strokeCircle(w.x, w.y, 10);
      }
    }

    if (selection?.hover) {
      const c = cities.find(x => x.id === selection.hover);
      if (c) {
        const w = this._tileToWorld(c.hub.tx, c.hub.ty);
        this.g.lineStyle(2, 0xffffff, 0.8);
        this.g.strokeCircle(w.x, w.y, 8);
      }
    }
  }
}
