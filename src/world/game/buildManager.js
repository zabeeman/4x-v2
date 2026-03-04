// src/world/game/buildManager.js
import { sampleHM } from "../infinite/terrainSampler.js";

export class BuildManager {
  constructor(scene, infiniteCfg, gameCfg, fog, sim) {
    this.scene = scene;
    this.infiniteCfg = infiniteCfg;
    this.gameCfg = gameCfg;
    this.fog = fog;
    this.sim = sim;

    this.tileSize = infiniteCfg.tileSize;

    this.buildings = []; // visuals: { id,typeId, tx,ty, sprite }
    this.selectedBuildTypeId = null;

    this.spawn = null; // {x,y}

    // Ghost
    this.ghost = this.scene.add.rectangle(0, 0, this.tileSize, this.tileSize, 0xffffff, 0.25)
      .setStrokeStyle(2, 0xffffff, 0.35)
      .setDepth(1500)
      .setVisible(false);

    this._valid = false;
    this._afford = false;
    this._lastGhostTile = null;
    this._lastReason = null;
  }

  setSpawnTile(p) {
    this.spawn = { x: p.x, y: p.y };
  }

  getCatalogue() {
    return this.sim ? this.sim.getCatalogue() : this.gameCfg.buildings;
  }

  setSelectedBuildType(id) {
    this.selectedBuildTypeId = id;
    this.ghost.setVisible(!!id);
  }

  getSelectedBuildType() {
    return this.getCatalogue().find(b => b.id === this.selectedBuildTypeId) ?? null;
  }

  isValidBuildTile(seed, tx, ty) {
    // Sim does district rules + extractor rules + starter gate.
    if (this.sim) {
      const chk = this.sim.canPlaceBuilding(this.selectedBuildTypeId, tx, ty);
      return chk;
    }

    // legacy fallback
    const cfgB = this.gameCfg.building;
    const s = sampleHM(seed, tx, ty, this.infiniteCfg);
    if (cfgB.disallowSurfaces.has(s.surface)) return { ok: false, reason: 'bad_surface' };
    if ((s.slope ?? 0) > cfgB.maxSlope) return { ok: false, reason: 'too_steep' };
    for (const b of this.buildings) if (b.tx === tx && b.ty === ty) return { ok: false, reason: 'occupied' };
    return { ok: true, cityId: null };
  }

  updateGhost(seed, worldX, worldY) {
    const tx = Math.floor(worldX / this.tileSize);
    const ty = Math.floor(worldY / this.tileSize);

    const type = this.getSelectedBuildType();
    if (!type) { this.ghost.setVisible(false); return; }

    const x = (tx + 0.5) * this.tileSize;
    const y = (ty + 0.5) * this.tileSize;
    this.ghost.setPosition(x, y).setVisible(true);

    const chk = this.isValidBuildTile(seed, tx, ty);
    const afford = this.sim ? this.sim.canAfford(type.id) : true;

    this._valid = !!chk.ok;
    this._afford = !!afford;
    this._lastGhostTile = { tx, ty };
    this._lastReason = chk.reason ?? null;

    // Colors:
    // - green = ok + afford
    // - orange = ok but no resources
    // - red = invalid
    if (!this._valid) {
      this.ghost.setFillStyle(0xef476f, 0.22);
      this.ghost.setStrokeStyle(2, 0xef476f, 0.55);
    } else if (!this._afford) {
      this.ghost.setFillStyle(0xf4a261, 0.22);
      this.ghost.setStrokeStyle(2, 0xf4a261, 0.55);
    } else {
      this.ghost.setFillStyle(0x06d6a0, 0.22);
      this.ghost.setStrokeStyle(2, 0x06d6a0, 0.55);
    }
  }

  tryPlaceSelected(seed) {
    const type = this.getSelectedBuildType();
    if (!type || !this._lastGhostTile) return null;

    const { tx, ty } = this._lastGhostTile;

    const chk = this.isValidBuildTile(seed, tx, ty);
    if (!chk.ok) return null;

    if (this.sim && !this.sim.canAfford(type.id)) return null;

    // Place in sim first
    let placed = null;
    if (this.sim) {
      const res = this.sim.placeBuilding(type.id, tx, ty);
      if (!res.ok) return null;
      placed = res.building;
    }

    // Visual
    const x = (tx + 0.5) * this.tileSize;
    const y = (ty + 0.5) * this.tileSize;

    // Color by district/city id (deterministic hash) for quick visibility
    let color = 0x073b4c;
    if (type.isStarter) color = 0x118ab2;
    else if (type.isHub) color = 0x8d99ae;
    else if (type.extract) color = 0x2a9d8f;

    const spr = this.scene.add.rectangle(x, y, this.tileSize * 0.92, this.tileSize * 0.92, color, 1)
      .setStrokeStyle(2, 0xffffff, 0.35)
      .setDepth(1100);

    const bVis = {
      id: placed?.id ?? `${type.id}_${Date.now()}`,
      typeId: type.id,
      tx, ty,
      sprite: spr,
    };
    this.buildings.push(bVis);

    // reveal fog around building
    const rr = type.fogRevealRadiusTiles ?? this.gameCfg.fog.buildingRevealRadiusTiles;
    if (this.fog) this.fog.revealCircle(tx, ty, rr);

    return bVis;
  }

  tryDemolishAtTile(tx, ty) {
    if (!this.sim) return { ok: false, reason: 'no_sim' };

    const res = this.sim.removeBuildingAt(tx, ty);
    if (!res.ok) return res;

    // remove visual
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
