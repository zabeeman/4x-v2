// src/world/game/ui/unitManager.js

export class UnitManager {
  constructor(scene, infiniteCfg, gameCfg, fog) {
    this.scene = scene;
    this.infiniteCfg = infiniteCfg;
    this.gameCfg = gameCfg;
    this.fog = fog;

    this.tileSize = infiniteCfg.tileSize;
    this.speedPx = gameCfg.units.tilesPerSecond * this.tileSize;

    this.units = [];
    this.selectedUnitId = null;

    this._nextId = 1;
  }

  tileToWorldCenter(tx, ty) {
    return {
      x: (tx + 0.5) * this.tileSize,
      y: (ty + 0.5) * this.tileSize,
    };
  }

  addUnitAtTile(tx, ty, opts = {}) {
    const id = this._nextId++;
    const w = this.tileToWorldCenter(tx, ty);

    const r = this.tileSize * 0.38;
    const g = this.scene.add.circle(w.x, w.y, r, 0xffd166, 1).setDepth(1200);
    g.setStrokeStyle(2, 0x000000, 0.35);

    // interactive selection
    g.setInteractive(new Phaser.Geom.Circle(0, 0, r), Phaser.Geom.Circle.Contains);
    g.on("pointerdown", () => this.selectUnit(id));

    const u = {
      id,
      tx, ty,
      x: w.x, y: w.y,
      sprite: g,
      path: [],
      moving: false,
      visionRadiusTiles: opts.visionRadiusTiles ?? this.gameCfg.fog.unitRevealRadiusTiles ?? 6,
      visionSourceId: `unit_${id}`,
      // optional
      name: opts.name ?? "Юнит",
    };

    if (this.fog) this.fog.upsertVisionSource(u.visionSourceId, tx, ty, u.visionRadiusTiles);
    this.units.push(u);
    return u;
  }

  selectUnit(id) {
    this.selectedUnitId = id;
    for (const u of this.units) {
      if (u.id === id) u.sprite.setFillStyle(0x06d6a0, 1);
      else u.sprite.setFillStyle(0xffd166, 1);
    }
  }

  getSelectedUnit() {
    return this.units.find(u => u.id === this.selectedUnitId) ?? null;
  }

  moveSelectedTo(tileX, tileY, seed) {
    // Movement is disabled for now (we’ll re-enable later).
    return false;
  }

  update(_dtMs, _seed) {
    // no-op while movement disabled
  }

  destroy() {
    for (const u of this.units) {
      if (this.fog) this.fog.removeVisionSource(u.visionSourceId);
      u.sprite.destroy();
    }
    this.units.length = 0;
    this.selectedUnitId = null;
  }

  updateVisibilityByFog() {
    if (!this.fog) return;
    for (const u of this.units) u.sprite.setVisible(this.fog.isTileFullyVisible(u.tx, u.ty));
  }
}
