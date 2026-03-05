// src/world/game/buildManager.js
import { snapGrid, screenToGrid, resolveIsoConfig } from "../render/isoProjector.js";
import { tileToWorldCenter, tileDiamond } from "../render/renderSpace.js";

export class BuildManager {
  constructor(scene, infiniteCfg, gameCfg, fog, sim) {
    this.scene = scene;
    this.infiniteCfg = infiniteCfg;
    this.gameCfg = gameCfg;
    this.fog = fog;
    this.sim = sim;

    this.tileSize = infiniteCfg.tileSize;
    this.iso = resolveIsoConfig(infiniteCfg);

    this.buildings = []; // visuals: { id,typeId, tx,ty, sprite }
    this.selectedBuildTypeId = null;

    this.spawn = null;

    this.ghost = this.scene.add.graphics().setDepth(1500).setVisible(false);

    this._valid = false;
    this._afford = false;
    this._lastGhostTile = null;
    this._lastReason = null;
  }

  _tileCenter(tx, ty) {
    return tileToWorldCenter(tx, ty, this.infiniteCfg);
  }

  _drawIsoDiamond(g, tx, ty, fillColor, fillAlpha, strokeColor, strokeAlpha) {
    const poly = tileDiamond(tx, ty, this.infiniteCfg);
    g.clear();
    g.fillStyle(fillColor, fillAlpha);
    g.lineStyle(2, strokeColor, strokeAlpha);
    g.beginPath();
    g.moveTo(poly.a.x, poly.a.y);
    g.lineTo(poly.b.x, poly.b.y);
    g.lineTo(poly.c.x, poly.c.y);
    g.lineTo(poly.d.x, poly.d.y);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  setSpawnTile(p) { this.spawn = { x: p.x, y: p.y }; }
  getCatalogue() { return this.sim ? this.sim.getCatalogue() : this.gameCfg.buildings; }
  setSelectedBuildType(id) { this.selectedBuildTypeId = id; this.ghost.setVisible(!!id); }
  setSelectedBuilding(id) { this.setSelectedBuildType(id); }
  getSelectedBuildType() { return this.getCatalogue().find(b => b.id === this.selectedBuildTypeId) ?? null; }

  isValidBuildTile(_seed, tx, ty) {
    const def = this.getSelectedBuildType();
    if (!def || !this.sim?.validatePlacement) {
      return { ok: false, affordabilityOk: true, reasons: [{ code: 'NO_SIM' }], cityId: null, footprint: [{ tx, ty }] };
    }
    return this.sim.validatePlacement(def.id, tx, ty);
  }

  updateGhost(seed, worldX, worldY) {
    const gp = screenToGrid(worldX, worldY, this.infiniteCfg);
    const { ix: tx, iy: ty } = snapGrid(gp.gx, gp.gy);

    const type = this.getSelectedBuildType();
    if (!type) { this.ghost.setVisible(false); return; }

    this.ghost.setVisible(true);

    const chk = this.isValidBuildTile(seed, tx, ty);
    this._valid = !!chk.ok;
    this._afford = chk.affordabilityOk ?? (this.sim ? this.sim.canAfford(type.id) : true);
    this._lastGhostTile = { tx, ty };
    this._lastReason = chk.reasons?.[0] ?? null;

    if (this.infiniteCfg.isoMode) {
      if (!this._valid) this._drawIsoDiamond(this.ghost, tx, ty, 0xef476f, 0.22, 0xef476f, 0.55);
      else if (!this._afford) this._drawIsoDiamond(this.ghost, tx, ty, 0xffcc00, 0.22, 0xffcc00, 0.55);
      else this._drawIsoDiamond(this.ghost, tx, ty, 0x06d6a0, 0.22, 0x06d6a0, 0.55);
    } else {
      const x = (tx + 0.5) * this.tileSize;
      const y = (ty + 0.5) * this.tileSize;
      this.ghost.clear();
      this.ghost.fillStyle(this._valid ? (this._afford ? 0x06d6a0 : 0xffcc00) : 0xef476f, 0.22);
      this.ghost.lineStyle(2, this._valid ? (this._afford ? 0x06d6a0 : 0xffcc00) : 0xef476f, 0.55);
      this.ghost.fillRect(x - this.tileSize / 2, y - this.tileSize / 2, this.tileSize, this.tileSize);
      this.ghost.strokeRect(x - this.tileSize / 2, y - this.tileSize / 2, this.tileSize, this.tileSize);
    }
  }

  tryPlaceSelected(seed) {
    const type = this.getSelectedBuildType();
    if (!type || !this._lastGhostTile) return null;
    const { tx, ty } = this._lastGhostTile;

    const chk = this.isValidBuildTile(seed, tx, ty);
    if (!chk.ok || (this.sim && !chk.affordabilityOk)) return null;

    let placed = null;
    if (this.sim) {
      const res = this.sim.placeBuilding(type.id, tx, ty);
      if (!res?.ok) return null;
      placed = res.building;
    }

    const pos = this._tileCenter(tx, ty);
    let color = 0x073b4c;
    if (type.isStarter) color = 0x118ab2;
    else if (type.isHub) color = 0x8d99ae;
    else if (type.extract) color = 0x2a9d8f;

    const w = this.infiniteCfg.isoMode ? this.iso.tileW * 0.55 : this.tileSize * 0.92;
    const h = this.infiniteCfg.isoMode ? this.iso.tileH * 1.4 : this.tileSize * 0.92;
    const spr = this.scene.add.rectangle(pos.x, pos.y, w, h, color, 1)
      .setOrigin(0.5, this.infiniteCfg.isoMode ? 1 : 0.5)
      .setStrokeStyle(2, 0xffffff, 0.35)
      .setDepth(Math.floor(pos.y) + 1100)
      .setInteractive();

    const bVis = {
      id: placed?.id ?? `${type.id}_${Date.now()}`,
      typeId: type.id,
      tx,
      ty,
      sprite: spr,
      visionSourceId: `building_${placed?.id ?? `${type.id}_${tx}_${ty}`}`
    };
    spr.on('pointerdown', () => {
      this.selectedBuildingId = bVis.id;
    });

    this.buildings.push(bVis);

    const rr = type.fogRevealRadiusTiles ?? this.gameCfg.fog.buildingRevealRadiusTiles;
    if (this.fog) this.fog.revealCircle(tx, ty, rr);

    return bVis;
  }

  getBuildingAtTile(tx, ty) {
    return this.buildings.find(b => b.tx === tx && b.ty === ty) ?? null;
  }

  tryDemolishAtTile(tx, ty) {
    if (!this.sim) return { ok: false, reason: 'no_sim' };
    const res = this.sim.removeBuildingAt(tx, ty);
    if (!res.ok) return res;
    const idx = this.buildings.findIndex(b => b.tx === tx && b.ty === ty);
    if (idx >= 0) {
      this.buildings[idx].sprite.destroy();
      this.buildings.splice(idx, 1);
    }
    return res;
  }

  destroy() {
    this.ghost.destroy();
    for (const b of this.buildings) b.sprite.destroy();
    this.buildings.length = 0;
  }
}
