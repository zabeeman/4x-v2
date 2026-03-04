import { defaultInfiniteConfig } from "../world/infinite/infiniteConfig.js";
import { terrainPalette } from "../world/infinite/terrainPalette.js";
import { createChunkManager } from "../world/infinite/chunkManager.js";
import { createFreeCameraController } from "../world/camera/cameraController.js";

import { gameConfig } from "../world/game/gameConfig.js";
import { FogOfWar } from "../world/game/fogOfWar.js";
import { UnitManager } from "../world/game/unitManager.js";
import { BuildManager } from "../world/game/buildManager.js";
import { UIManager } from "../world/game/uiManager.js";
import { findSpawn, loadSpawnRegistry, addSpawnToRegistry, clearSpawnRegistry } from "../world/game/spawnManager.js";

function parseSeedFromUrlOrDefault(def) {
  const qs = new URLSearchParams(window.location.search);
  const s = qs.get("seed");
  if (!s) return def;

  const asNum = Number(s);
  if (Number.isFinite(asNum)) return Math.floor(asNum);

  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function parseIntQ(name, def) {
  const qs = new URLSearchParams(window.location.search);
  const v = qs.get(name);
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

export class Start extends Phaser.Scene {
  constructor() {
    super("Start");
  }

  create() {
    // World config
    this.cfg = { ...defaultInfiniteConfig };
    this.cfg.worldSeed = parseSeedFromUrlOrDefault(this.cfg.worldSeed);

    // Camera
    const camCfg = gameConfig.camera;
    this.cameraCtl = createFreeCameraController(this, {
      panSpeed: camCfg.panSpeed,
      zoomMin: camCfg.zoomMin,
      zoomMax: camCfg.zoomMax,
      zoomStep: camCfg.zoomStep,
      dragButtons: "rightOrMiddle",
    });

    this.cameras.main.scrollX = -400;
    this.cameras.main.scrollY = -300;

    // Terrain
    this.chunkMgr = createChunkManager(this, this.cfg, terrainPalette);

    // Gameplay config (table)
    this.gcfg = gameConfig;

    // Safe distance (can override via URL ?mindist=1000)
    this.safeDist = parseIntQ("mindist", this.gcfg.spawn.safeDistanceTilesDefault);
    this.safeDist = Phaser.Math.Clamp(this.safeDist, this.gcfg.spawn.safeDistanceTilesMin, this.gcfg.spawn.safeDistanceTilesMax);

    // Fog
    this.fog = new FogOfWar(this, this.cfg, this.gcfg);

    // Units + build
    this.units = new UnitManager(this, this.cfg, this.gcfg, this.fog);
    this.build = new BuildManager(this, this.cfg, this.gcfg, this.fog);

    // UI
    this.ui = new UIManager(this, this.cfg, this.gcfg);
    this.ui.create();

    // Build palette
    const catalogue = this.gcfg.buildings;
    this.ui.buildButtonsFromCatalogue(catalogue, (id) => {
      // Gate: until starter placed, only starter button works
      const t = catalogue.find(x => x.id === id);
      if (!t) return;
      if (!this.build.starterPlaced && !t.isStarter) return;

      this.build.setSelectedBuildType(id);
      this.ui.highlightSelectedBuilding(id);
    });

    // Spawn + initial state
    this._spawnAndInit();

    // Pointer interactions:
    // - LMB on unit selects (handled by sprite interactive)
    // - LMB on world: if build mode -> try place building, else if unit selected -> set path
    this.input.on("pointermove", (pointer) => {
      if (this.ui.isPointerOverUI(pointer)) return;
      const p = pointer.positionToCamera(this.cameras.main);
      this.build.updateGhost(this.cfg.worldSeed, p.x, p.y);
    });

    this.input.on("pointerdown", (pointer) => {
      if (!pointer.leftButtonDown()) return;
      if (this.ui.isPointerOverUI(pointer)) return;

      const p = pointer.positionToCamera(this.cameras.main);
      const tx = Math.floor(p.x / this.cfg.tileSize);
      const ty = Math.floor(p.y / this.cfg.tileSize);

      // If we have a selected build type -> place (Дом-1 first)
      if (this.build.getSelectedBuildType()) {
        const b = this.build.tryPlaceSelected(this.cfg.worldSeed);
        if (b) {
          // If Дом-1 got placed => "finalize" spawn reservation in registry
          const type = this.gcfg.buildings.find(t => t.id === b.typeId);
          if (type?.isStarter) addSpawnToRegistry(this.spawn);

          // After placing starter building, we can enable other buildings
          if (this.build.starterPlaced) this._enableNonStarterBuildings();
        }
        return;
      }
      // Movement is disabled for now.
    });

    // Hotkeys
    this.input.keyboard.on("keydown-R", () => {
      // reroll spawn only before starter building is placed
      if (this.build.starterPlaced) return;
      this._spawnAndInit(true);
    });

    this.input.keyboard.on("keydown-OPEN_BRACKET", () => {
      if (this.build.starterPlaced) return;
      this.safeDist = Math.max(this.gcfg.spawn.safeDistanceTilesMin, this.safeDist - this.gcfg.spawn.safeDistanceStep);
      this._spawnAndInit(true);
    });

    this.input.keyboard.on("keydown-CLOSE_BRACKET", () => {
      if (this.build.starterPlaced) return;
      this.safeDist = Math.min(this.gcfg.spawn.safeDistanceTilesMax, this.safeDist + this.gcfg.spawn.safeDistanceStep);
      this._spawnAndInit(true);
    });


this.input.keyboard.on("keydown-ESC", () => {
  // cancel build mode (keeps selection on unit)
  this.build.setSelectedBuildType(null);
  this.ui.highlightSelectedBuilding(null);
});
    this.input.keyboard.on("keydown-C", (ev) => {
      if (ev.shiftKey) {
        clearSpawnRegistry();
        if (!this.build.starterPlaced) this._spawnAndInit(true);
      }
    });
  }

  _spawnAndInit(reroll = false) {
    // Clear previous state
    if (reroll) {
      // keep UI etc, just re-init spawn/unit/build/fog
      this.units.destroy();
      this.build.destroy();
      this.fog.reset();

      this.build = new BuildManager(this, this.cfg, this.gcfg, this.fog);
      this.units = new UnitManager(this, this.cfg, this.gcfg, this.fog);
      // ensure ghost follows selection
      this.build.setSelectedBuildType(null);
      this.ui.highlightSelectedBuilding(null);
      this._rebuildButtonsGate();
    }

    const other = loadSpawnRegistry();
    const spawn = findSpawn(this.cfg.worldSeed, this.cfg, this.gcfg, other, this.safeDist);
    this.spawn = spawn;

    // focus camera near spawn
    const wx = (spawn.x + 0.5) * this.cfg.tileSize;
    const wy = (spawn.y + 0.5) * this.cfg.tileSize;
    this.cameras.main.centerOn(wx, wy);

    // Start closer to spawn
    this.cameras.main.setZoom(this.gcfg.camera.initialZoom);

    // Register spawn only when we place the starter building (so rerolls don't pollute).
    // For now, we will register immediately to keep distance stable across tabs:
    // Initialize build & fog
    this.build.setSpawnTile(spawn);

    // No fog around start (100 tiles)
    this.fog.revealCircle(spawn.x, spawn.y, this.gcfg.fog.startRevealRadiusTiles);

    // Place starting unit and select it
    const u = this.units.addUnitAtTile(spawn.x, spawn.y, { name: "Разведчик" });
    this.units.selectUnit(u.id);

    // Starter building selection by default
    const starter = this.gcfg.buildings.find(b => b.isStarter);
    if (starter) {
      this.build.setSelectedBuildType(starter.id);
      this.ui.highlightSelectedBuilding(starter.id);
    }

    // Gate buttons depending on starter state
    this._rebuildButtonsGate();
  }

  _rebuildButtonsGate() {
    const cat = this.gcfg.buildings;
    for (const t of cat) {
      const enabled = this.build.starterPlaced ? true : !!t.isStarter;
      this.ui.setBuildingEnabled(t.id, enabled);
    }
  }

  _enableNonStarterBuildings() {
    this._rebuildButtonsGate();
    // Optionally auto-deselect build tool after placing starter:
    this.build.setSelectedBuildType(null);
    this.ui.highlightSelectedBuilding(null);
  }

  update(_t, dt) {
    this.cameraCtl.update();
    this.chunkMgr.update();

    // fog redraw throttled
    this.fog.update();

    // Update UI
    const sel = this.units.getSelectedUnit();
    const buildType = this.build.getSelectedBuildType();
    const buildStatus = this.build.starterPlaced ? "Дом-1: построен" : "Дом-1: НЕ построен";

    this.ui.setPlayerText([
      `seed=${this.cfg.worldSeed}`,
      `spawn=${this.spawn.x},${this.spawn.y}`,
      `safeDist=${this.safeDist}`,
      `selected=${sel ? `${sel.name} @ ${sel.tx},${sel.ty}` : "—"}`,
      `mode=${buildType ? `строю: ${buildType.name}` : "выбор"}`,
      `${buildStatus}`,
      `chunks=${this.chunkMgr.getLoadedCount?.() ?? "?"}`,
    ]);
  }
}
