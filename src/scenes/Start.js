import { defaultInfiniteConfig } from "../world/infinite/infiniteConfig.js";
import { terrainPalette } from "../world/infinite/terrainPalette.js";
import { createChunkManager } from "../world/infinite/chunkManager.js";
import { createFreeCameraController } from "../world/camera/cameraController.js";

import { gameConfig } from "../world/game/ui/gameConfig.js";
import { FogOfWar } from "../world/game/ui/fogOfWar.js";
import { UnitManager } from "../world/game/ui/unitManager.js";
import { BuildManager } from "../world/game/buildManager.js";
import { UIManager } from "../world/game/ui/uiManager.js";
import { findSpawn, loadSpawnRegistry, addSpawnToRegistry, clearSpawnRegistry } from "../world/game/ui/spawnManager.js";

import { createDefaultGameData } from "../world/game/sim/defaultGameData.js";
import { GameSim } from "../world/game/sim/gameSim.js";

import { OverlayManager } from "../world/game/overlay/overlayManager.js";
import { RouteRenderer } from "../world/game/overlay/routeRenderer.js";
import { createViewModeController } from "../world/render/viewModeController.js";

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


const DOCTRINE_SNAPSHOT_LS_KEY = '4x_v2_doctrine_snapshot_v1';

function loadDoctrineSnapshotFromStorage() {
  try {
    const raw = localStorage.getItem(DOCTRINE_SNAPSHOT_LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function saveDoctrineSnapshotToStorage(snapshot) {
  try {
    localStorage.setItem(DOCTRINE_SNAPSHOT_LS_KEY, JSON.stringify(snapshot ?? {}));
  } catch {
    // ignore
  }
}

async function loadDoctrineCatalog() {
  try {
    const response = await fetch('./doctrines_catalog.json');
    if (!response.ok) return null;
    const data = await response.json();
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

export class Start extends Phaser.Scene {
  constructor() {
    super("Start");
  }

  preload() {
    this.load.json('doctrine_catalog', 'doctrines_catalog.json');
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

    // Gameplay config
    this.gcfg = gameConfig;

    // Sim data + sim
    const doctrineCatalog = this.cache?.json?.get?.('doctrine_catalog') ?? null;
    this.gameData = createDefaultGameData(this.gcfg, doctrineCatalog);
    this.sim = new GameSim(this.gameData, this.cfg, this.cfg.worldSeed);
    this._lastDoctrineSaveRev = -1;

    const doctrineSnapshot = loadDoctrineSnapshotFromStorage();
    if (doctrineSnapshot) this.sim.importDoctrineSnapshot(doctrineSnapshot);

    // Safe distance
    this.safeDist = parseIntQ("mindist", this.gcfg.spawn.safeDistanceTilesDefault);
    this.safeDist = Phaser.Math.Clamp(this.safeDist, this.gcfg.spawn.safeDistanceTilesMin, this.gcfg.spawn.safeDistanceTilesMax);

    // Fog
    this.fog = new FogOfWar(this, this.cfg, this.gcfg);
    this.fog.setSim(this.sim);

    // Units + build
    this.units = new UnitManager(this, this.cfg, this.gcfg, this.fog);
    this.build = new BuildManager(this, this.cfg, this.gcfg, this.fog, this.sim);

    // Overlays & route renderer
    this.overlays = new OverlayManager(this, this.cfg, this.sim);
    this.routeRenderer = new RouteRenderer(this, this.cfg);

    // UI
    this.ui = new UIManager(this, this.cfg, this.gcfg);
    this.ui.create();

    this.viewModeCtl = createViewModeController(this, {
      isoYScale: 0.5,
      tileSize: this.cfg.tileSize,
      chunkSize: this.cfg.chunkSize,
      nearIsoChunkDistance: this.cfg.nearIsoChunkDistance,
      midIsoChunkDistance: this.cfg.midIsoChunkDistance,
      maxIsoChunkDistance: this.cfg.maxIsoChunkDistance,
      dynamicIsoRefreshMs: this.cfg.dynamicIsoRefreshMs,
      staticIsoTickMs: this.cfg.staticIsoTickMs,
    });
    this.cameraCtl?.setViewMapper?.(this.viewModeCtl);

    // Build palette
    const catalogue = this.sim.getCatalogue();
    this.ui.buildButtonsFromCatalogue(catalogue, (id) => {
      // if route mode active, cancel it
      if (this.routeMode?.active) this._cancelRouteMode();

      this.build.setSelectedBuilding(id);
      this.ui.setSelectedBuilding(id);

      const def = this.sim.getBuildingDef(id);
      this.ui.setBuildInfo(def);
      this.overlays.setPlacementType(id);
    });

    // Doctrine-driven recommendations + doctrines screen
    this.ui.setRecommendHandler(() => {
      const rec = this.sim.recommendNextBuilding();
      if (rec) {
        this.build.setSelectedBuilding(rec);
        this.ui.setSelectedBuilding(rec);
        const def = this.sim.getBuildingDef(rec);
        this.ui.setBuildInfo(def);
        this.overlays.setPlacementType(rec);
      }
    });

    const renderDoctrines = () => {
      this.ui.renderDoctrineScreen(this.sim.getDoctrineScreenState());
      this.ui.setDoctrineRecommendations(this.sim.getDoctrineBuildingRecommendations());
    };

    this.ui.setDoctrineHandlers({
      onToggle: (id) => {
        this.sim.toggleDoctrine(id);
        renderDoctrines();
      },
      onApplyPreset: (presetId) => {
        this.sim.applyDoctrinePreset(presetId);
        renderDoctrines();
      },
      onFinalizeStart: () => {
        this.sim.finalizeInitialDoctrines();
        renderDoctrines();
      },
      onBeginPlanning: () => {
        this.sim.beginDoctrinePlanning();
        renderDoctrines();
      },
      onCancelPlanning: () => {
        this.sim.cancelDoctrinePlanning();
        renderDoctrines();
      },
      onResetDraft: () => {
        this.sim.resetDoctrineDraft();
        renderDoctrines();
      },
      onProposeReform: () => {
        this.sim.proposeDoctrineReform();
        renderDoctrines();
      },
      onConfirmReform: () => {
        this.sim.confirmDoctrineReform();
        renderDoctrines();
      },
    });
    renderDoctrines();

    // Overlay toggles
    this.ui.setOverlayToggleHandler((toggles) => {
      this.overlays.setToggles(toggles);
    });

    // Demolish + cheats
    this.demolishMode = false;
    this.ui.setDemolishToggleHandler((active) => {
      this.demolishMode = !!active;
      if (this.demolishMode) {
        this._cancelRouteMode();
        this.build.setSelectedBuilding(null);
        this.ui.setSelectedBuilding(null);
        this.ui.setBuildInfo(null);
        this.overlays.setPlacementType(null);
      }
    });

    this.ui.setInfiniteResourcesHandler((flag) => {
      this.sim.setInfiniteResources(flag);
    });

    this.ui.setViewModeHandler(() => {
      const mode = this.viewModeCtl.toggleMode();
      this.ui.setViewMode(mode);
    });
    this.ui.setViewMode(this.viewModeCtl.getMode());

    // Manual trade routes
    this.routeMode = { active: false, mode: 'land', srcCityId: null, hoverCityId: null };
    this.ui.setTradeRouteHandlers({
      onLand: () => this._startRouteMode('land'),
      onWater: () => this._startRouteMode('water'),
      onCancel: () => this._cancelRouteMode(),
    });

    this._lastRouteListRev = -1;
    this._lastRouteRenderRev = -1;
    this._lastRouteRenderSel = { src: null, hover: null, active: false, mode: null };

    this._hudUpdateMs = this.gcfg.ui?.hudUpdateMs ?? 200;
    this._hudAccumMs = this._hudUpdateMs;

    // Spawn + initial state
    this._spawnAndInit();

    // Pointer interactions
    this.input.on("pointermove", (pointer) => {
      if (this.ui.isPointerOverUI(pointer)) return;
      const pCam = pointer.positionToCamera(this.cameras.main);
      const p = this.viewModeCtl.viewToWorld(pCam.x, pCam.y);
      const tilePos = this.viewModeCtl.viewToTile(pCam.x, pCam.y);
      const tx = tilePos.tx;
      const ty = tilePos.ty;

      if (this.routeMode.active) {
        const c = this.sim.findCityHubAt(tx, ty, 2);
        const nextHover = c?.id ?? null;
        if (nextHover !== this.routeMode.hoverCityId) this.routeMode.hoverCityId = nextHover;
        return;
      }

      const vc = this.viewModeCtl.tileToView(tx, ty);
      const worldGhost = this.viewModeCtl.viewToWorld(vc.x, vc.y);
      this.build.updateGhost(this.cfg.worldSeed, worldGhost.x, worldGhost.y);
      const selected = this.build.getSelectedBuildType();
      if (selected) {
        const placement = this.build.isValidBuildTile(this.cfg.worldSeed, tx, ty);
        this.ui.setPlacementStatus({
          ok: placement?.ok,
          affordabilityOk: placement?.affordabilityOk,
          reasons: placement?.reasons ?? [],
        });
      } else {
        this.ui.setPlacementStatus({ ok: false, affordabilityOk: true, reasonsText: 'Выберите здание.' });
      }
    });

    this.input.on("pointerdown", (pointer) => {
      if (!pointer.leftButtonDown()) return;
      if (this.ui.isPointerOverUI(pointer)) return;

      const pCam = pointer.positionToCamera(this.cameras.main);
      const tilePos = this.viewModeCtl.viewToTile(pCam.x, pCam.y);
      const tx = tilePos.tx;
      const ty = tilePos.ty;

      // Route mode has priority
      if (this.routeMode.active) {
        const c = this.sim.findCityHubAt(tx, ty, 2);
        if (!c) return;

        if (!this.routeMode.srcCityId) {
          this.routeMode.srcCityId = c.id;
          this.ui.setTradeStatus(`Источник выбран. Теперь выбери цель (${this.routeMode.mode === 'water' ? 'по воде' : 'по земле'}).`);
        } else {
          if (c.id === this.routeMode.srcCityId) return;
          const res = this.sim.createManualTradeRoute(this.routeMode.srcCityId, c.id, this.routeMode.mode);
          if (res.ok) {
            this.ui.setTradeStatus(`Маршрут создан (${this.routeMode.mode}).`);
          } else {
            const msg = res.reason === 'no_port' ? 'Нет порта рядом с одним из хабов.' : `Не удалось: ${res.reason}`;
            this.ui.setTradeStatus(msg);
          }
          this._cancelRouteMode(false);
        }
        return;
      }

      // Demolish mode has priority over build placement
      if (this.demolishMode) {
        const res = this.build.tryDemolishAtTile(tx, ty);
        if (res.ok) {
          this.ui.setTradeStatus('');
          this._rebuildButtonsGate();
        }
        return;
      }

      // Build placement
      if (this.build.getSelectedBuildType()) {
        const b = this.build.tryPlaceSelected(this.cfg.worldSeed);
        if (b) {
          const def = this.sim.getBuildingDef(b.typeId);
          if (def?.isStarter) addSpawnToRegistry(this.spawn);
          this._rebuildButtonsGate();
        }
        return;
      }
    });

    // Hotkeys
    this.input.keyboard.on("keydown-R", () => {
      if (this.sim.state.cities.length > 0) return;
      this._spawnAndInit(true);
    });

    this.input.keyboard.on("keydown-OPEN_BRACKET", () => {
      if (this.sim.state.cities.length > 0) return;
      this.safeDist = Math.max(this.gcfg.spawn.safeDistanceTilesMin, this.safeDist - this.gcfg.spawn.safeDistanceStep);
      this._spawnAndInit(true);
    });

    this.input.keyboard.on("keydown-CLOSE_BRACKET", () => {
      if (this.sim.state.cities.length > 0) return;
      this.safeDist = Math.min(this.gcfg.spawn.safeDistanceTilesMax, this.safeDist + this.gcfg.spawn.safeDistanceStep);
      this._spawnAndInit(true);
    });

    this.input.keyboard.on("keydown-ESC", () => {
      if (this.routeMode.active) {
        this._cancelRouteMode();
        return;
      }

      if (this.demolishMode) {
        // turn off demolish and sync UI state
        this.demolishMode = false;
        this.ui.setDemolishActive(false);
        return;
      }
      this.build.setSelectedBuildType(null);
      this.ui.setSelectedBuilding(null);
      this.overlays.setPlacementType(null);
    });

    this.input.keyboard.on("keydown-V", () => {
      const mode = this.viewModeCtl.toggleMode();
      this.ui.setViewMode(mode);
    });

    this.input.keyboard.on("keydown-C", (ev) => {
      if (ev.shiftKey) {
        clearSpawnRegistry();
        if (this.sim.state.cities.length === 0) this._spawnAndInit(true);
      }
    });
  }

  _startRouteMode(mode) {
    this.routeMode.active = true;
    this.routeMode.mode = mode;
    this.routeMode.srcCityId = null;
    this.routeMode.hoverCityId = null;

    // cancel build mode
    this.build.setSelectedBuildType(null);
    this.ui.setSelectedBuilding(null);
    this.ui.setBuildInfo(null);

    this.ui.setTradeStatus(`Режим маршрута: выбери источник (${mode === 'water' ? 'по воде' : 'по земле'}). Клик по хабам.`);
  }

  _cancelRouteMode(clearStatus = true) {
    this.routeMode.active = false;
    this.routeMode.srcCityId = null;
    this.routeMode.hoverCityId = null;
    if (clearStatus) this.ui.setTradeStatus('');
  }

  _spawnAndInit(reroll = false) {
    if (reroll) {
      this.units.destroy();
      this.build.destroy();
      this.fog.reset();

      // reset sim
      this.sim = new GameSim(this.gameData, this.cfg, this.cfg.worldSeed);
      const doctrineSnapshot = loadDoctrineSnapshotFromStorage();
      if (doctrineSnapshot) this.sim.importDoctrineSnapshot(doctrineSnapshot);
      this._lastDoctrineSaveRev = -1;
      this.fog.setSim(this.sim);

      // rewire overlays sim ref
      this.overlays.sim = this.sim;

      this.build = new BuildManager(this, this.cfg, this.gcfg, this.fog, this.sim);
      this.units = new UnitManager(this, this.cfg, this.gcfg, this.fog);

      this.build.setSelectedBuildType(null);
      this.ui.setSelectedBuilding(null);

      this._cancelRouteMode();
    }

    const other = loadSpawnRegistry();
    const spawn = findSpawn(this.cfg.worldSeed, this.cfg, this.gcfg, other, this.safeDist);
    this.spawn = spawn;

    const wx = (spawn.x + 0.5) * this.cfg.tileSize;
    const wy = (spawn.y + 0.5) * this.cfg.tileSize;
    this.cameras.main.centerOn(wx, wy);
    this.cameras.main.setZoom(this.gcfg.camera.initialZoom);

    this.build.setSpawnTile(spawn);
    this.sim.setSpawn(spawn.x, spawn.y);

    const u = this.units.addUnitAtTile(spawn.x, spawn.y, { name: "Разведчик" });
    this.units.selectUnit(u.id);

    const starter = this.sim.getCatalogue().find((b) => b.isStarter || b.isHub || b.buildZone?.addsBuildZone);
    if (starter) {
      this.build.setSelectedBuildType(starter.id);
      this.ui.setSelectedBuilding(starter.id);
      this.ui.setBuildInfo(starter);
      this.overlays.setPlacementType(starter.id);
    }

    this._rebuildButtonsGate();
  }

  _rebuildButtonsGate() {
    const cat = this.sim.getCatalogue();
    const hasStarter = this.sim.state.cities.length > 0;

    for (const t of cat) {
      const isAnchor = !!(t.isStarter || t.isHub || t.buildZone?.addsBuildZone);
      const enabled = hasStarter ? true : isAnchor;
      this.ui.setBuildingEnabled(t.id, enabled);
    }
  }

  update(_t, dt) {
    if (!this.sim) return;

    this.cameraCtl.update();
    this.viewModeCtl?.update();
    this.chunkMgr.update();
    this.viewModeCtl?.update();
    this.fog.update();
    this.build.updateVisibilityByFog();
    this.units.updateVisibilityByFog();

    // sim
    this.sim.update(dt);

    // overlays + routes
    this.overlays.update();

    // route list (manual routes) update only when sim changes
    const rev = this.sim.getRevision();

    const shouldRerenderRoutes = (
      rev !== this._lastRouteRenderRev
      || this._lastRouteRenderSel.src !== this.routeMode.srcCityId
      || this._lastRouteRenderSel.hover !== this.routeMode.hoverCityId
      || this._lastRouteRenderSel.active !== this.routeMode.active
      || this._lastRouteRenderSel.mode !== this.routeMode.mode
    );

    if (shouldRerenderRoutes) {
      this.routeRenderer.render(
        this.sim.state.trade.routes,
        this.sim.getCities(),
        {
          src: this.routeMode.srcCityId,
          hover: this.routeMode.hoverCityId,
        }
      );
      this._lastRouteRenderRev = rev;
      this._lastRouteRenderSel.src = this.routeMode.srcCityId;
      this._lastRouteRenderSel.hover = this.routeMode.hoverCityId;
      this._lastRouteRenderSel.active = this.routeMode.active;
      this._lastRouteRenderSel.mode = this.routeMode.mode;
    }
    if (rev !== this._lastRouteListRev) {
      this._lastRouteListRev = rev;
      this.ui.renderRoutes(this.sim.state.trade.routes, this.sim.getCities(), (routeId) => {
        this.sim.removeManualTradeRoute(routeId);
      });
    }

    if (rev !== this._lastDoctrineSaveRev) {
      this._lastDoctrineSaveRev = rev;
      saveDoctrineSnapshotToStorage(this.sim.exportDoctrineSnapshot());
    }

    // UI (throttled to reduce per-frame string allocations/layout churn)
    this._hudAccumMs += dt;
    if (this._hudAccumMs >= this._hudUpdateMs) {
      this._hudAccumMs = 0;

      const sel = this.units.getSelectedUnit();
      const buildType = this.build.getSelectedBuildType();

      const res = this.sim.getResources();
      const per = this.sim.state.perMin;

      const cities = this.sim.getCities();
      const routes = this.sim.state.trade.routes.length;

      const mode = this.routeMode.active
        ? `маршрут: ${this.routeMode.mode}${this.routeMode.srcCityId ? ' (источник выбран)' : ''}`
        : (this.demolishMode ? 'СНОС' : (buildType ? `строю: ${buildType.name}` : 'выбор'));

      this.ui.setPlayerText([
        `seed=${this.cfg.worldSeed}`,
        `spawn=${this.spawn.x},${this.spawn.y}`,
        `cities=${cities.length}  routes=${routes}`,
        `selected=${sel ? `${sel.name} @ ${sel.tx},${sel.ty}` : "—"}`,
        `mode=${mode}`,
        `gold=${res.gold.toFixed(1)}  (+${per.gold.toFixed(2)}/min)`,
        `wood=${res.wood.toFixed(1)} (+${per.wood.toFixed(2)}/min)  metal=${res.metal.toFixed(1)} (+${per.metal.toFixed(2)}/min)`,
        `marble=${res.marble.toFixed(1)} (+${per.marble.toFixed(2)}/min)  glass=${res.glass.toFixed(1)} (+${per.glass.toFixed(2)}/min)`,
        `powder=${res.powder.toFixed(1)} (+${per.powder.toFixed(2)}/min)  research=${(res.research ?? 0).toFixed(1)} (+${per.research.toFixed(2)}/min)`,
        `trade_income=${this.sim.state.trade.goldPerMin.toFixed(2)}/min`,
        `cheats=${this.sim.isInfiniteResources() ? '∞' : '—'}`,
        `doctrines=${(this.sim.state.doctrineLoadout?.selectedDoctrineIds ?? []).join(', ') || '—'}`,
        `chunks=${this.chunkMgr.getLoadedCount?.() ?? "?"}`,
      ]);
    }
  }
}
