// src/world/game/buildManager.js
import { sampleHM } from "../infinite/terrainSampler.js";

function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export class BuildManager {
  constructor(scene, infiniteCfg, gameCfg, fog) {
    this.scene = scene;
    this.infiniteCfg = infiniteCfg;
    this.gameCfg = gameCfg;
    this.fog = fog;

    this.tileSize = infiniteCfg.tileSize;

    this.buildings = []; // { id,type, tx,ty, sprite }
    this.selectedBuildTypeId = null;

    this.spawn = null; // {x,y}
    this.starterPlaced = false;

    // Ghost
    this.ghost = this.scene.add.rectangle(0, 0, this.tileSize, this.tileSize, 0xffffff, 0.25)
      .setStrokeStyle(2, 0xffffff, 0.35)
      .setDepth(1500)
      .setVisible(false);

    this._valid = false;
    this._lastGhostTile = null;
  }

  setSpawnTile(p) {
    this.spawn = { x: p.x, y: p.y };
  }

  getCatalogue() {
    return this.gameCfg.buildings;
  }

  setSelectedBuildType(id) {
    this.selectedBuildTypeId = id;
    this.ghost.setVisible(!!id);
  }

  getSelectedBuildType() {
    return this.getCatalogue().find(b => b.id === this.selectedBuildTypeId) ?? null;
  }

  // Buildable area:
  // - before starter building: radius around spawn (firstBuildRadiusTiles)
  // - after: union of circles around buildings with radius >= minBuildAreaRadiusTiles or per-type buildAreaRadiusTiles
  isInBuildArea(tx, ty) {
    const cfgB = this.gameCfg.building;

    if (!this.starterPlaced) {
      if (!this.spawn) return false;
      const r = cfgB.firstBuildRadiusTiles;
      return dist2(tx, ty, this.spawn.x, this.spawn.y) <= r * r;
    }

    const minR = cfgB.minBuildAreaRadiusTiles;
    for (const b of this.buildings) {
      const type = this.getCatalogue().find(t => t.id === b.typeId);
      const r = Math.max(minR, type?.buildAreaRadiusTiles ?? minR);
      if (dist2(tx, ty, b.tx, b.ty) <= r * r) return true;
    }
    return false;
  }

  isValidBuildTile(seed, tx, ty) {
    const cfgB = this.gameCfg.building;
    if (!this.isInBuildArea(tx, ty)) return false;

    const s = sampleHM(seed, tx, ty, this.infiniteCfg);
    if (cfgB.disallowSurfaces.has(s.surface)) return false;
    if ((s.slope ?? 0) > cfgB.maxSlope) return false;

    // occupied?
    for (const b of this.buildings) {
      if (b.tx === tx && b.ty === ty) return false;
    }
    return true;
  }

  updateGhost(seed, worldX, worldY) {
    const tx = Math.floor(worldX / this.tileSize);
    const ty = Math.floor(worldY / this.tileSize);

    const type = this.getSelectedBuildType();
    if (!type) { this.ghost.setVisible(false); return; }

    const w = (tx + 0.5) * this.tileSize;
    const h = (ty + 0.5) * this.tileSize;
    this.ghost.setPosition(w, h).setVisible(true);

    const valid = this.isValidBuildTile(seed, tx, ty) && this._isAllowedByStarterRule(type);
    this._valid = valid;
    this._lastGhostTile = { tx, ty };

    this.ghost.setFillStyle(valid ? 0x06d6a0 : 0xef476f, 0.22);
    this.ghost.setStrokeStyle(2, valid ? 0x06d6a0 : 0xef476f, 0.55);
  }

  _isAllowedByStarterRule(type) {
    if (!this.starterPlaced) return !!type.isStarter; // only Дом-1 until built
    return true;
  }

  tryPlaceSelected(seed) {
    const type = this.getSelectedBuildType();
    if (!type || !this._lastGhostTile) return null;
    if (!this._isAllowedByStarterRule(type)) return null;

    const { tx, ty } = this._lastGhostTile;
    if (!this.isValidBuildTile(seed, tx, ty)) return null;

    // place sprite (simple rectangle for now)
    const x = (tx + 0.5) * this.tileSize;
    const y = (ty + 0.5) * this.tileSize;

    const color = type.isStarter ? 0x118ab2 : 0x073b4c;
    const spr = this.scene.add.rectangle(x, y, this.tileSize * 0.92, this.tileSize * 0.92, color, 1)
      .setStrokeStyle(2, 0xffffff, 0.35)
      .setDepth(1100);

    const b = {
      id: `${type.id}_${Date.now()}`,
      typeId: type.id,
      tx, ty,
      sprite: spr,
    };
    this.buildings.push(b);

    if (type.isStarter) this.starterPlaced = true;

    // reveal fog around building (permanent)
    const rr = type.fogRevealRadiusTiles ?? this.gameCfg.fog.buildingRevealRadiusTiles;
    if (this.fog) this.fog.revealCircle(tx, ty, rr);

    return b;
  }

  destroy() {
    this.ghost.destroy();
    for (const b of this.buildings) b.sprite.destroy();
    this.buildings.length = 0;
  }
}
