// src/world/game/sim/gameSim.js
// Lightweight sim layer: districts (hubs), influence, trade (auto + manual), doctrines, geo resource extraction.

import { dist2, dist, clamp } from './utils.js';
import { computeCityStats } from './statsSystem.js';
import { computeCityInfluenceRadius, influenceStrengthAt } from './influenceSystem.js';
import { recomputeTrade } from './tradeSystem.js';
import { buildLandRoute, buildWaterRoute } from './routePathfinding.js';
import { resolveBuildZoneOwner, resolveBuildZoneOwnerMeta } from './buildZoneSystem.js';
import { validatePlacement } from './placementValidator.js';
export { validatePlacement } from './placementValidator.js';

function nowId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

export class GameSim {
  constructor(gameData, infiniteCfg, seed) {
    this.data = gameData;
    this.infiniteCfg = infiniteCfg;
    this.seed = seed;

    this._rev = 1;

    this.state = {
      spawn: null,
      governmentId: this.data.balance.defaultGovernmentId ?? 'default',
      doctrineLoadout: {
        startingPointsTotal: this.data.doctrineConfig?.startPoints ?? 5,
        selectedDoctrineIds: [],
        pendingDoctrineIds: [],
        lastReformTurn: -1,
        reformCooldownUntilTurn: 0,
      },
      doctrineState: {
        phase: 'initial',
        presetId: 'custom',
        legacySelectedPreset: null,
      },
      reform: null,
      reformProject: null,
      simTimeMs: 0,
      turn: 0,

      resources: { ...this.data.balance.startingResources },

      cheats: {
        infiniteResources: false,
      },

      cities: [], // {id, hub:{typeId,tx,ty,level}, buildings:[], stats, influenceRadiusTiles}
      buildings: [], // flat list {id,typeId,tx,ty,cityId,level, extract?}
      zoneSourcesByCity: new Map(), // cityId -> ZoneSource[]
      cityBuildZoneTiles: new Map(), // cityId -> Set('tx,ty')

      trade: { routes: [], manualRoutes: [], goldPerMin: 0 },

      perMin: {
        gold: 0,
        research: 0,
        wood: 0,
        metal: 0,
        marble: 0,
        glass: 0,
        powder: 0,
      },
    };

    this._accMs = 0;
  }

  getRevision() { return this._rev; }

  getDistanceToActiveZone(tx, ty) {
    return this._distanceToBuildNetwork(tx, ty);
  }

  getFogRadiusBonuses() {
    let fullInfoBonusTiles = 0;
    let terrainInfoBonusTiles = 0;

    for (const b of this.state.buildings) {
      const def = this.getBuildingDef(b.typeId);
      if (!def) continue;

      const both = Number(def.fogRadiusBonusTiles ?? 0);
      const full = Number(def.fogFullInfoBonusTiles ?? 0);
      const terrain = Number(def.fogTerrainInfoBonusTiles ?? 0);

      if (Number.isFinite(both)) {
        fullInfoBonusTiles += both;
        terrainInfoBonusTiles += both;
      }
      if (Number.isFinite(full)) fullInfoBonusTiles += full;
      if (Number.isFinite(terrain)) terrainInfoBonusTiles += terrain;
    }

    return {
      fullInfoBonusTiles,
      terrainInfoBonusTiles,
    };
  }

  _bump() { this._rev++; }

  setSpawn(tx, ty) {
    this.state.spawn = { tx, ty };
    this._bump();
  }

  getCatalogue() { return this.data.buildingDefinitions ?? this.data.buildings; }

  getBuildingDef(id) { return this.getCatalogue().find(b => b.id === id) ?? null; }

  getCityById(id) { return this.state.cities.find(c => c.id === id) ?? null; }

  getCities() { return this.state.cities; }

  getResources() { return this.state.resources; }

  setInfiniteResources(flag) {
    this.state.cheats.infiniteResources = !!flag;
    if (this.state.cheats.infiniteResources) this._applyInfiniteResources();
    this._bump();
  }

  isInfiniteResources() {
    return !!this.state.cheats.infiniteResources;
  }

  _applyInfiniteResources() {
    const v = this.data.balance.cheats?.infiniteValue ?? 999999;
    for (const k of Object.keys(this.state.resources)) {
      if (k === 'research') continue;
      this.state.resources[k] = v;
    }
  }

  // --- District logic ---


  _tileKey(tx, ty) {
    return `${tx},${ty}`;
  }

  _buildZoneTilesForSource(source) {
    const out = new Set();
    const shape = source?.shape ?? 'TILE_DISK';
    const radius = Math.max(0, Math.floor(source?.radius ?? 0));
    const cx = source?.centerTx ?? source?.tx ?? 0;
    const cy = source?.centerTy ?? source?.ty ?? 0;

    if (Array.isArray(source?.tiles) && source.tiles.length > 0) {
      for (const t of source.tiles) out.add(this._tileKey(t.tx, t.ty));
      return out;
    }

    if (radius <= 0) return out;

    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (shape === 'TILE_RECT') {
          out.add(this._tileKey(x, y));
          continue;
        }
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) out.add(this._tileKey(x, y));
      }
    }

    return out;
  }

  _ensureBuildZoneSource(building, def) {
    if (!def?.buildZone?.addsBuildZone || !building?.cityId) return;

    const cityId = building.cityId;
    const zoneSource = {
      cityId,
      sourceBuildingId: building.id,
      centerTx: building.tx,
      centerTy: building.ty,
      tx: building.tx,
      ty: building.ty,
      priority: Number(def.buildZone.zonePriority ?? def.zonePriority ?? 0),
      shape: def.buildZone.zoneShape ?? 'TILE_DISK',
      radius: Math.max(0, Math.floor(def.buildZone.zoneRadiusTiles ?? def.buildAreaRadiusTiles ?? 0)),
      rTiles: Math.max(0, Math.floor(def.buildZone.zoneRadiusTiles ?? def.buildAreaRadiusTiles ?? 0)),
      tiles: [],
      typeId: building.typeId,
      isHub: !!(def?.isHub || def?.isStarter),
    };

    const generated = this._buildZoneTilesForSource(zoneSource);
    zoneSource.tiles = Array.from(generated).map((k) => {
      const [tx, ty] = k.split(',').map(Number);
      return { tx, ty };
    });

    const list = this.state.zoneSourcesByCity.get(cityId) ?? [];
    const existingIdx = list.findIndex((s) => s.sourceBuildingId === building.id);
    if (existingIdx >= 0) list[existingIdx] = zoneSource;
    else list.push(zoneSource);
    this.state.zoneSourcesByCity.set(cityId, list);

    this.rebuildCityZones(cityId);
  }

  rebuildCityZones(cityId) {
    const list = this.state.zoneSourcesByCity.get(cityId) ?? [];
    const union = new Set();
    for (const src of list) {
      const tiles = (Array.isArray(src.tiles) && src.tiles.length > 0)
        ? src.tiles.map((t) => this._tileKey(t.tx, t.ty))
        : Array.from(this._buildZoneTilesForSource(src));
      for (const key of tiles) union.add(key);
    }
    this.state.cityBuildZoneTiles.set(cityId, union);
    return union;
  }

  _materializeSpawnCity(newCityId) {
    const spawnKey = 'spawn';

    const spawnOwnedBuildings = this.state.buildings.filter((b) => b.cityId === spawnKey);
    for (const b of spawnOwnedBuildings) b.cityId = newCityId;

    const movedSources = this.state.zoneSourcesByCity.get(spawnKey) ?? [];
    if (movedSources.length > 0) {
      for (const src of movedSources) src.cityId = newCityId;
      const existing = this.state.zoneSourcesByCity.get(newCityId) ?? [];
      this.state.zoneSourcesByCity.set(newCityId, [...existing, ...movedSources]);
      this.state.zoneSourcesByCity.delete(spawnKey);
    }

    const spawnTiles = this.state.cityBuildZoneTiles.get(spawnKey);
    if (spawnTiles) {
      const existing = this.state.cityBuildZoneTiles.get(newCityId) ?? new Set();
      const merged = new Set([...existing, ...spawnTiles]);
      this.state.cityBuildZoneTiles.set(newCityId, merged);
      this.state.cityBuildZoneTiles.delete(spawnKey);
    }
  }

  _rebuildAllCityZones() {
    for (const city of this.state.cities) this.rebuildCityZones(city.id);
  }

  _nearestHubs(tx, ty) {
    const hubs = this.state.cities.map(c => c.hub).filter(Boolean);
    if (hubs.length === 0) return { first: null, second: null };

    let first = null;
    let second = null;
    for (const h of hubs) {
      const d2v = dist2(tx, ty, h.tx, h.ty);
      if (!first || d2v < first.d2) {
        second = first;
        first = { hub: h, d2: d2v };
      } else if (!second || d2v < second.d2) {
        second = { hub: h, d2: d2v };
      }
    }
    return { first, second };
  }


  _citiesCoveringTile(tx, ty) {
    const out = [];
    for (const c of this.state.cities) {
      if (this._isInCityBuildArea(c, tx, ty)) out.push(c);
    }
    return out;
  }

  _zoneSourcesCoveringTile(tx, ty) {
    const key = this._tileKey(tx, ty);
    const out = [];
    for (const list of this.state.zoneSourcesByCity.values()) {
      for (const s of list) {
        if (Array.isArray(s.tiles) && s.tiles.length > 0) {
          const has = s.tiles.some((t) => t.tx === tx && t.ty === ty);
          if (has) out.push(s);
          continue;
        }
        const r = s.rTiles ?? s.radius ?? 0;
        if (r <= 0) continue;
        const dx = tx - (s.centerTx ?? s.tx);
        const dy = ty - (s.centerTy ?? s.ty);
        if (dx * dx + dy * dy <= r * r) out.push(s);
      }
    }
    return out.filter((s) => (this.state.cityBuildZoneTiles.get(s.cityId)?.has(key) ?? true));
  }

  _ownerFromCovered(tx, ty, coveredSources = null) {
    const sources = coveredSources ?? this._zoneSourcesCoveringTile(tx, ty);
    if (!sources || sources.length === 0) return null;
    const cityId = resolveBuildZoneOwner(tx, ty, sources);
    return cityId ? this.getCityById(cityId) : null;
  }

  _findCityForTile(tx, ty) {
    return this._ownerFromCovered(tx, ty);
  }

  _buildAreaRadiusTilesForDef(def) {
    if (!def) return 0;
    if (typeof def.buildAreaRadiusTiles === 'number') return def.buildAreaRadiusTiles;
    const d = this.data.balance.district ?? {};
    if (def.isHub || def.isStarter) return d.hubBuildAreaRadiusTiles ?? 8;
    return d.defaultBuildAreaRadiusTiles ?? 6;
  }

  // City build area is UNION of individual circles around each placed building in that city.
  _isInCityBuildArea(city, tx, ty) {
    if (!city) return false;
    for (const b of (city.buildings ?? [])) {
      const def = this.getBuildingDef(b.typeId);
      const r = this._buildAreaRadiusTilesForDef(def);
      if (r <= 0) continue;
      if (dist2(tx, ty, b.tx, b.ty) <= r * r) return true;
    }
    return false;
  }

  _isInSomeCityBuildArea(tx, ty) {
    for (const c of this.state.cities) {
      if (this._isInCityBuildArea(c, tx, ty)) return true;
    }
    return false;
  }

  // Debug/visual helper: return an enclosing radius around hub (NOT used for placement).
  _cityEnclosingBuildRadiusTiles(city) {
    const hub = city?.hub;
    if (!hub) return 0;
    let maxR = 0;
    for (const b of (city.buildings ?? [])) {
      const def = this.getBuildingDef(b.typeId);
      const r = this._buildAreaRadiusTilesForDef(def);
      const d = dist(hub.tx, hub.ty, b.tx, b.ty);
      maxR = Math.max(maxR, d + r);
    }
    if (maxR <= 0) {
      const hubDef = this.getBuildingDef(hub.typeId);
      maxR = this._buildAreaRadiusTilesForDef(hubDef);
    }
    return maxR;
  }

  _nearestCityByHub(tx, ty) {
    let best = null;
    let bestD2 = Infinity;
    for (const c of this.state.cities) {
      const d2v = dist2(tx, ty, c.hub.tx, c.hub.ty);
      if (d2v < bestD2) { bestD2 = d2v; best = c; }
    }
    return best;
  }

  // Distance (in tiles) to nearest build-zone tile.
  // Uses exact union of build-zone sources (and starter spawn disk before first city).
  _distanceToBuildNetwork(tx, ty) {
    if (this.state.cities.length === 0) {
      const sp = this.state.spawn;
      if (!sp) return Infinity;
      const r = this.data.balance.district?.firstBuildRadiusTiles ?? 10;
      return Math.max(0, dist(sp.tx, sp.ty, tx, ty) - r);
    }

    const sources = this.getZoneSources();
    if (sources.length === 0) return Infinity;

    let best = Infinity;
    for (const s of sources) {
      const r = s.rTiles ?? 0;
      if (r <= 0) continue;
      best = Math.min(best, Math.max(0, dist(tx, ty, s.tx, s.ty) - r));
    }
    return best;
  }

  getDistrictInfo(tx, ty) {
    if (this.state.cities.length === 0) return { cityId: null, disputed: false };
    const ownerMeta = this.getOwnerMeta(tx, ty);
    return { cityId: ownerMeta?.cityId ?? null, disputed: false };
  }

  // For build-area visualization: union of per-building zones, per district.
  // Returns: { cityId, buildable, disputed }
  getBuildAreaInfo(tx, ty) {
    // Before first hub: show initial starter area around spawn
    if (this.state.cities.length === 0) {
      const sp = this.state.spawn;
      if (!sp) return { cityId: null, buildable: false, disputed: false };
      const r = this.data.balance.district?.firstBuildRadiusTiles ?? 10;
      const ok = dist2(tx, ty, sp.tx, sp.ty) <= r * r;
      return { cityId: ok ? 'spawn' : null, buildable: ok, disputed: false };
    }

    const ownerMeta = this.getOwnerMeta(tx, ty);
    if (!ownerMeta) return { cityId: null, buildable: false, disputed: false };
    return { cityId: ownerMeta.cityId, buildable: true, disputed: false };
  }

  getBuildZoneOwner(tx, ty) {
    if (this.state.cities.length === 0) {
      const sp = this.state.spawn;
      if (!sp) return null;
      const r = this.data.balance.district?.firstBuildRadiusTiles ?? 10;
      return dist2(tx, ty, sp.tx, sp.ty) <= r * r ? 'spawn' : null;
    }
    return this.getOwnerMeta(tx, ty)?.cityId ?? null;
  }

  getOwnerMeta(tx, ty) {
    const sources = this.getZoneSources();
    const meta = resolveBuildZoneOwnerMeta(tx, ty, sources);
    if (!meta) return null;
    return { cityId: meta.cityId, dist: meta.dist, priority: meta.priority };
  }

  // For placement preview overlay: returns the same result as canPlaceBuilding
  // but ignores resource affordability (handled elsewhere).
  getPlacementHint(typeId, tx, ty) {
    return this.validatePlacement(typeId, tx, ty);
  }

  validatePlacement(typeId, tx, ty) {
    const def = this.getBuildingDef(typeId);
    if (!def) {
      return {
        ok: false,
        affordabilityOk: true,
        reasons: [{ code: 'UNKNOWN_BUILDING' }],
        cityId: null,
        footprint: [{ tx, ty }],
      };
    }

    return validatePlacement(def, tx, ty, {
      data: this.data,
      seed: this.seed,
      infiniteCfg: this.infiniteCfg,
      state: this.state,
      getBuildZoneOwner: (gx, gy) => this.getBuildZoneOwner(gx, gy),
      distanceToBuildZone: (gx, gy) => this._distanceToBuildNetwork(gx, gy),
      nearestCity: (gx, gy) => this._nearestCityByHub(gx, gy),
      canAfford: (id) => this.canAfford(id),
    });
  }

  getInfluenceStrength(tx, ty) {
    return influenceStrengthAt(this.state, tx, ty);
  }

  findCityHubAt(tx, ty, maxDistTiles = 1) {
    const r2 = maxDistTiles * maxDistTiles;
    let best = null;
    let bestD2 = Infinity;
    for (const c of this.state.cities) {
      const d2v = dist2(tx, ty, c.hub.tx, c.hub.ty);
      if (d2v <= r2 && d2v < bestD2) {
        best = c;
        bestD2 = d2v;
      }
    }
    return best;
  }

  // --- Placement rules ---

  canPlaceBuilding(typeId, tx, ty) {
    const res = this.validatePlacement(typeId, tx, ty);
    if (!res.ok) return { ok: false, reason: res.reasons?.[0]?.code ?? 'invalid_placement' };
    return { ok: true, cityId: res.cityId };
  }

  canAfford(typeId) {
    if (this.state.cheats?.infiniteResources) return true;
    const def = this.getBuildingDef(typeId);
    const cost = def?.buildCost ?? def?.cost;
    if (!cost) return true;
    for (const [k, v] of Object.entries(cost)) {
      if ((this.state.resources[k] ?? 0) < v) return false;
    }
    return true;
  }

  spendCost(typeId) {
    if (this.state.cheats?.infiniteResources) return;
    const def = this.getBuildingDef(typeId);
    const cost = def?.buildCost ?? def?.cost;
    if (!cost) return;
    for (const [k, v] of Object.entries(cost)) {
      this.state.resources[k] = (this.state.resources[k] ?? 0) - v;
    }
  }

  placeBuilding(typeId, tx, ty) {
    const placement = this.validatePlacement(typeId, tx, ty);
    if (!placement.ok) return { ok: false, reason: placement.reasons?.[0]?.code ?? 'invalid_placement' };
    if (!placement.affordabilityOk) return { ok: false, reason: 'no_resources' };

    const def = this.getBuildingDef(typeId);
    this.spendCost(typeId);

    // city assignment
    let cityId = placement.cityId;
    let createdCity = null;

    const createsZone = !!def?.buildZone?.addsBuildZone;
    const shouldMaterializeSpawnCity = cityId === 'spawn' && createsZone;
    if (def.isStarter || def.isHub || (!cityId && createsZone) || shouldMaterializeSpawnCity) {
      cityId = nowId('city');
      const city = {
        id: cityId,
        hub: { typeId, tx, ty, level: 1 },
        buildings: [],
        stats: null,
        influenceRadiusTiles: 0,
      };
      this.state.cities.push(city);
      createdCity = city;

      if (shouldMaterializeSpawnCity) this._materializeSpawnCity(cityId);
    }

    const b = {
      id: nowId(def.id),
      typeId,
      tx, ty,
      level: 1,
      cityId,
      isHub: !!def.isHub,
      extract: def.extract ? { ...def.extract } : null,
    };

    this.state.buildings.push(b);

    const city = this.getCityById(cityId);
    if (city) city.buildings.push(b);

    this._ensureBuildZoneSource(b, def);

    this.recomputeDerived();
    this._bump();

    return { ok: true, building: b, createdCityId: createdCity?.id ?? null };
  }

  // --- Removal ---

  removeManualTradeRoute(routeId) {
    const before = this.state.trade.manualRoutes.length;
    this.state.trade.manualRoutes = this.state.trade.manualRoutes.filter(r => r.id !== routeId);
    const after = this.state.trade.manualRoutes.length;
    if (after !== before) {
      this.recomputeDerived();
      this._bump();
      return true;
    }
    return false;
  }

  removeBuildingAt(tx, ty) {
    const idx = this.state.buildings.findIndex(b => b.tx === tx && b.ty === ty);
    if (idx < 0) return { ok: false, reason: 'no_building' };

    const b = this.state.buildings[idx];
    const def = this.getBuildingDef(b.typeId);
    const city = b.cityId ? this.getCityById(b.cityId) : null;

    // Hub demolition rules
    if (def?.isHub || def?.isStarter) {
      if (!city) return { ok: false, reason: 'no_city' };
      if ((city.buildings?.length ?? 0) > 1) return { ok: false, reason: 'hub_has_buildings' };
    }

    // Refund
    const ratio = this.data.balance.demolishRefundRatio ?? 0.5;
    if (!this.state.cheats?.infiniteResources && def?.cost && ratio > 0) {
      for (const [k, v] of Object.entries(def.cost)) {
        this.state.resources[k] = (this.state.resources[k] ?? 0) + v * ratio;
      }
    }

    // Remove building from flat list
    this.state.buildings.splice(idx, 1);

    // Remove from city list if present
    if (city) {
      city.buildings = city.buildings.filter(x => x.id !== b.id);
    }

    // Keep zone sources in sync
    if (b.cityId) {
      const list = this.state.zoneSourcesByCity.get(b.cityId) ?? [];
      const next = list.filter((src) => src.sourceBuildingId !== b.id);
      this.state.zoneSourcesByCity.set(b.cityId, next);
      this.rebuildCityZones(b.cityId);
    }

    // If it was a hub -> remove city and linked manual routes
    let removedCityId = null;
    if (def?.isHub || def?.isStarter) {
      removedCityId = city?.id ?? null;
      if (removedCityId) {
        this.state.cities = this.state.cities.filter(c => c.id !== removedCityId);
        this.state.zoneSourcesByCity.delete(removedCityId);
        this.state.cityBuildZoneTiles.delete(removedCityId);
        // remove any manual routes touching this city
        this.state.trade.manualRoutes = this.state.trade.manualRoutes.filter(r => r.aCityId !== removedCityId && r.bCityId !== removedCityId);
      }
    }

    this.recomputeDerived();
    this._bump();

    return { ok: true, removedBuildingId: b.id, removedCityId };
  }

  // --- Doctrines ---

  _activeDoctrineIds() {
    return this.state.doctrineLoadout.selectedDoctrineIds ?? [];
  }

  _editableDoctrineIds() {
    const phase = this.state.doctrineState?.phase ?? 'locked';
    if (phase === 'initial' || phase === 'planning') return this.state.doctrineLoadout.pendingDoctrineIds ?? [];
    return this._activeDoctrineIds();
  }

  getDoctrineGroups() {
    const groups = new Map();
    for (const d of this.data.doctrines) {
      const g = d.category ?? 'other';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(d);
    }
    return groups;
  }

  _doctrineConfig() {
    return this.data.doctrineConfig ?? {};
  }

  getDoctrinePointsSummary(list = this._editableDoctrineIds()) {
    const budget = this.state.doctrineLoadout.startingPointsTotal ?? this._doctrineConfig().startPoints ?? 5;
    let spent = 0;
    for (const id of list) {
      const d = this.data.doctrines.find((x) => x.id === id);
      spent += d?.costPoints ?? 0;
    }
    return { spent, budget, remaining: budget - spent };
  }

  getDoctrineAvailability(doctrineId, list = this._editableDoctrineIds()) {
    const d = this.data.doctrines.find((x) => x.id === doctrineId);
    if (!d) return { ok: false, status: 'forbidden', reason: 'UNKNOWN' };

    const phase = this.state.doctrineState?.phase ?? 'locked';
    if (!['initial', 'planning'].includes(phase)) return { ok: false, status: 'forbidden', reason: 'LOCKED' };

    const selected = list.includes(doctrineId);
    if (selected) return { ok: true, status: 'selected', reason: null };

    const points = this.getDoctrinePointsSummary(list);
    if (points.spent + (d.costPoints ?? 0) > points.budget) return { ok: false, status: 'unavailable', reason: 'NOT_ENOUGH_POINTS' };

    const groups = d.exclusiveGroups ?? [];
    if (groups.length) {
      for (const id of list) {
        const dd = this.data.doctrines.find((x) => x.id === id);
        if (!dd || dd.id === doctrineId) continue;
        if ((dd.exclusiveGroups ?? []).some((g) => groups.includes(g))) return { ok: false, status: 'forbidden', reason: 'EXCLUSIVE_CONFLICT' };
      }
    }

    for (const req of (d.requires ?? [])) if (!list.includes(req)) return { ok: false, status: 'forbidden', reason: 'REQUIRES' };
    for (const f of (d.forbids ?? [])) if (list.includes(f)) return { ok: false, status: 'forbidden', reason: 'FORBIDS' };

    const maxPerCategory = this._doctrineConfig().maxPerCategory ?? null;
    if (Number.isFinite(maxPerCategory) && maxPerCategory > 0) {
      const used = list.map((id) => this.data.doctrines.find((x) => x.id === id)).filter(Boolean).filter((x) => x.category === d.category).length;
      if (used >= maxPerCategory) return { ok: false, status: 'forbidden', reason: 'MAX_PER_CATEGORY' };
    }

    return { ok: true, status: 'available', reason: null };
  }

  canSelectDoctrine(doctrineId, list = this._editableDoctrineIds()) {
    return this.getDoctrineAvailability(doctrineId, list).ok;
  }

  toggleDoctrine(doctrineId) {
    const phase = this.state.doctrineState?.phase ?? 'locked';
    if (!['initial', 'planning'].includes(phase)) return false;

    const target = this._editableDoctrineIds();
    const idx = target.indexOf(doctrineId);
    if (idx >= 0) {
      target.splice(idx, 1);
      this.state.doctrineState.presetId = 'custom';
      this._bump();
      return true;
    }

    if (!this.canSelectDoctrine(doctrineId, target)) return false;
    target.push(doctrineId);
    this.state.doctrineState.presetId = 'custom';
    this._bump();
    return true;
  }

  applyDoctrinePreset(presetId) {
    const phase = this.state.doctrineState?.phase ?? 'locked';
    if (!['initial', 'planning'].includes(phase)) return false;

    if (presetId === 'custom') {
      this.state.doctrineState.presetId = 'custom';
      this._bump();
      return true;
    }

    const preset = (this.data.doctrinePresets ?? []).find((p) => p.id === presetId);
    if (!preset) return false;

    const next = [];
    for (const id of (preset.doctrineIds ?? [])) {
      if (!this.canSelectDoctrine(id, next)) return false;
      next.push(id);
    }

    this.state.doctrineLoadout.pendingDoctrineIds = next;
    this.state.doctrineState.presetId = presetId;
    this._bump();
    return true;
  }

  resetDoctrineDraft() {
    const phase = this.state.doctrineState?.phase ?? 'locked';
    if (phase === 'initial') {
      this.state.doctrineLoadout.pendingDoctrineIds = [];
      this.state.doctrineState.presetId = 'custom';
      this._bump();
      return true;
    }
    if (phase === 'planning') {
      this.state.doctrineLoadout.pendingDoctrineIds = [...this._activeDoctrineIds()];
      this.state.doctrineState.presetId = 'custom';
      this._bump();
      return true;
    }
    return false;
  }

  beginDoctrinePlanning() {
    if ((this.state.doctrineState?.phase ?? 'locked') !== 'locked') return false;
    this.state.doctrineState.phase = 'planning';
    this.state.doctrineState.presetId = 'custom';
    this.state.doctrineLoadout.pendingDoctrineIds = [...this._activeDoctrineIds()];
    this.state.reformProject = null;
    this._bump();
    return true;
  }

  cancelDoctrinePlanning() {
    if ((this.state.doctrineState?.phase ?? 'locked') !== 'planning') return false;
    this.state.doctrineState.phase = 'locked';
    this.state.doctrineLoadout.pendingDoctrineIds = [];
    this.state.reformProject = null;
    this._bump();
    return true;
  }

  _calcReformProject(fromIds, toIds) {
    const cfg = this._doctrineConfig();
    const from = new Set(fromIds);
    const to = new Set(toIds);
    const symDiff = [...new Set([...fromIds, ...toIds])].filter((id) => from.has(id) !== to.has(id));
    const changedCount = symDiff.length;
    const changedPoints = symDiff.reduce((acc, id) => acc + (this.data.doctrines.find((d) => d.id === id)?.costPoints ?? 0), 0);
    const extremeCount = toIds
      .map((id) => this.data.doctrines.find((d) => d.id === id))
      .filter((d) => d?.balanceClass === 'EXTREME').length;

    const durationTurns = (cfg.reformBaseDurationTurns ?? 3) + changedPoints;
    const cost = {
      gold: (cfg.reformBaseGold ?? 120) + (cfg.reformGoldPerPoint ?? 30) * changedPoints + (cfg.reformGoldPerExtreme ?? 80) * extremeCount,
      marble: (cfg.reformBaseMarble ?? 0) + (cfg.reformMarblePerDoctrine ?? 2) * changedCount,
      metal: (cfg.reformBaseMetal ?? 0) + (cfg.reformMetalPerPoint ?? 1) * changedPoints,
      glass: (cfg.reformBaseGlass ?? 0) + (cfg.reformGlassPerDoctrine ?? 1) * changedCount,
      wood: (cfg.reformBaseWood ?? 0) + (cfg.reformWoodPerDoctrine ?? 2) * changedCount,
      powder: (cfg.reformBasePowder ?? 0) + (cfg.reformPowderPerExtreme ?? 0) * extremeCount,
    };

    const temporaryModifiers = cfg.reformTemporaryModifiers ?? [
      { stat: 'HappinessPct', type: 'AddPct', value: -0.1 },
      { stat: 'BuildSpeedPct', type: 'AddPct', value: -0.1 },
      { stat: 'WarWeariness', type: 'AddFlat', value: 1 },
    ];

    return {
      id: nowId('reform_project'),
      fromDoctrineIds: [...fromIds],
      toDoctrineIds: [...toIds],
      changedPoints,
      durationTurns,
      cost,
      temporaryModifiers,
      startTurn: null,
      endTurn: null,
      state: 'PROPOSED',
      cooldownTurns: cfg.reformCooldownTurns ?? 180,
      extremeCount,
    };
  }

  proposeDoctrineReform() {
    if ((this.state.doctrineState?.phase ?? 'locked') !== 'planning') return false;
    const from = this._activeDoctrineIds();
    const to = this._editableDoctrineIds();
    this.state.reformProject = this._calcReformProject(from, to);
    this._bump();
    return true;
  }

  confirmDoctrineReform() {
    const project = this.state.reformProject;
    if (!project || project.state !== 'PROPOSED') return false;
    if (this.state.turn < (this.state.doctrineLoadout.reformCooldownUntilTurn ?? 0)) return false;

    for (const [k, v] of Object.entries(project.cost ?? {})) {
      if ((this.state.resources[k] ?? 0) < v) return false;
    }
    for (const [k, v] of Object.entries(project.cost ?? {})) {
      this.state.resources[k] = (this.state.resources[k] ?? 0) - v;
    }

    project.state = 'ACTIVE';
    project.startTurn = this.state.turn;
    project.endTurn = this.state.turn + project.durationTurns;
    this.state.reformProject = project;
    this.state.reform = { state: 'ACTIVE', temporaryModifiers: project.temporaryModifiers ?? [] };
    this.state.doctrineState.phase = 'reform';
    this._bump();
    return true;
  }

  finalizeInitialDoctrines() {
    if ((this.state.doctrineState?.phase ?? 'locked') !== 'initial') return false;
    this.state.doctrineLoadout.selectedDoctrineIds = [...this.state.doctrineLoadout.pendingDoctrineIds];
    this.state.doctrineLoadout.pendingDoctrineIds = [];
    this.state.doctrineState.phase = 'locked';
    this.recomputeDerived();
    this._bump();
    return true;
  }

  getDoctrineScreenState() {
    const points = this.getDoctrinePointsSummary();
    const selectedIds = [...this._editableDoctrineIds()];
    const activeIds = [...this._activeDoctrineIds()];
    const groups = Array.from(this.getDoctrineGroups().entries());
    const categoryOrder = this._doctrineConfig().categories ?? ['economy', 'governance', 'society', 'military', 'science', 'industry', 'diplomacy'];

    return {
      groups,
      categoryOrder,
      selectedIds,
      activeIds,
      canPick: (id) => this.canSelectDoctrine(id),
      availability: (id) => this.getDoctrineAvailability(id),
      points,
      phase: this.state.doctrineState?.phase ?? 'locked',
      presetId: this.state.doctrineState?.presetId ?? 'custom',
      presets: this.data.doctrinePresets ?? [],
      reformProject: this.state.reformProject,
      canProposeReform: (this.state.doctrineState?.phase ?? 'locked') === 'planning',
      canConfirmReform: (this.state.reformProject?.state ?? null) === 'PROPOSED',
      cooldownTurnsLeft: Math.max(0, (this.state.doctrineLoadout.reformCooldownUntilTurn ?? 0) - this.state.turn),
    };
  }

  // --- Manual trade routes ---

  createManualTradeRoute(aCityId, bCityId, mode = 'land') {
    if (aCityId === bCityId) return { ok: false, reason: 'same_city' };
    const a = this.getCityById(aCityId);
    const b = this.getCityById(bCityId);
    if (!a || !b) return { ok: false, reason: 'no_city' };

    // Build path segments
    let built;
    if (mode === 'water') built = buildWaterRoute(this.seed, a, b, this.infiniteCfg, this.data.balance);
    else built = buildLandRoute(this.seed, a, b, this.infiniteCfg, this.data.balance);

    if (!built.ok) return built;

    const segments = built.segments;
    const pathLen = segments.reduce((acc, seg) => acc + Math.max(0, (seg.path?.length ?? 0) - 1), 0);

    const id = nowId('manual_route');
    this.state.trade.manualRoutes.push({
      id,
      aCityId,
      bCityId,
      mode,
      segments,
      pathLenTiles: pathLen,
    });

    this.recomputeDerived();
    this._bump();

    return { ok: true, routeId: id };
  }

  // --- Simulation tick ---

  update(dtMs) {
    this._accMs += dtMs;
    const tickMs = this.data.balance.tickMs ?? 250;

    while (this._accMs >= tickMs) {
      this._accMs -= tickMs;
      this._tick(tickMs / 60000);
    }
  }

  _tick(minFrac) {
    this.state.simTimeMs += Math.floor(minFrac * 60000);
    this.state.turn += 1;

    if (this.state.reformProject?.state === 'ACTIVE' && this.state.turn >= (this.state.reformProject.endTurn ?? 0)) {
      this.state.doctrineLoadout.selectedDoctrineIds = [...(this.state.reformProject.toDoctrineIds ?? [])];
      this.state.doctrineLoadout.pendingDoctrineIds = [];
      this.state.doctrineLoadout.lastReformTurn = this.state.turn;
      this.state.doctrineLoadout.reformCooldownUntilTurn = this.state.turn + (this.state.reformProject.cooldownTurns ?? (this._doctrineConfig().reformCooldownTurns ?? 180));
      this.state.reformProject.state = 'COMPLETED';
      this.state.reform = null;
      this.state.doctrineState.phase = 'locked';
    }

    this.recomputeDerived();

    if (this.state.cheats?.infiniteResources) {
      this._applyInfiniteResources();
    }

    for (const k of Object.keys(this.state.perMin)) {
      this.state.resources[k] = (this.state.resources[k] ?? 0) + this.state.perMin[k] * minFrac;
    }

    this.state.resources.gold = clamp(this.state.resources.gold, -999999, 999999);
  }

  recomputeDerived() {
    for (const c of this.state.cities) {
      c.stats = computeCityStats(this.data, c, this.state);
      c.influenceRadiusTiles = computeCityInfluenceRadius(this.data.balance, c.stats, c);
    }

    recomputeTrade(this.state, this.data.balance);

    const b = this.data.balance;
    const baseGold = b.baseGoldPerMin ?? 2;
    const minGold = b.minIncomePerMin?.gold ?? 1;

    const upkeepGoldPerMin = this._calcUpkeepGoldPerMin();

    let gold = minGold;
    let research = b.minIncomePerMin?.research ?? 0;

    for (const c of this.state.cities) {
      const gMul = c.stats?.pct?.GoldPerMinPct ?? 1;
      const gFlat = c.stats?.IncomeGoldPerMin ?? 0;
      gold += baseGold * gMul + gFlat;
      const rMul = (c.stats?.pct?.ResearchPerMinPct ?? 1) * (c.stats?.pct?.ScienceLevelPct ?? 1);
      research += (b.baseResearchPerMin ?? 0.6) * rMul;
    }

    // Extractors
    const yields = { wood: 0, metal: 0, marble: 0, glass: 0, powder: 0 };
    for (const bd of this.state.buildings) {
      if (!bd.extract) continue;
      const resId = bd.extract.resource;
      const base = bd.extract.basePerMin ?? 0.5;
      const city = this.getCityById(bd.cityId);
      const mul = city?.stats?.pct?.ResourceYieldPct ?? 1;
      yields[resId] = (yields[resId] ?? 0) + base * mul;
    }

    // Trade income
    gold += this.state.trade.goldPerMin;


    gold -= upkeepGoldPerMin;

    this.state.perMin.gold = gold;
    this.state.perMin.research = research;
    this.state.perMin.wood = yields.wood;
    this.state.perMin.metal = yields.metal;
    this.state.perMin.marble = yields.marble;
    this.state.perMin.glass = yields.glass;
    this.state.perMin.powder = yields.powder;
  }

  // helpers for overlays
  getCityBuildRadiusTiles(cityId) {
    const c = this.getCityById(cityId);
    if (!c) return 0;
    return this._cityEnclosingBuildRadiusTiles(c);
  }

  // Build area sources for visualization (union of ZoneSources).
  getBuildAreaSources() {
    return this.getZoneSources();
  }

  getZoneSources() {
    const out = [];
    for (const list of this.state.zoneSourcesByCity.values()) out.push(...list);
    return out;
  }

  getCityInfluenceRadiusTiles(cityId) {
    const c = this.getCityById(cityId);
    if (!c) return 0;
    return c.influenceRadiusTiles ?? 0;
  }

  _calcUpkeepGoldPerMin() {
    let up = 0;
    for (const b of this.state.buildings) {
      const def = this.getBuildingDef(b.typeId);
      if (!def?.upkeep?.goldPerMin) continue;
      up += def.upkeep.goldPerMin;
    }
    return up;
  }

  getDoctrineBuildingRecommendations() {
    const selected = this._activeDoctrineIds()
      .map((id) => this.data.doctrines.find((d) => d.id === id))
      .filter(Boolean);

    const recommendedIds = new Set();
    const tags = new Set();
    for (const d of selected) {
      for (const id of (d.recommendedBuildings ?? [])) recommendedIds.add(id);
      for (const t of (d.recommendedBuildingTags ?? [])) tags.add(String(t).toLowerCase());

      const taxBias = (d.effects ?? []).some((e) => e.stat === 'TaxEfficiency' && (e.value ?? 0) > 0);
      if (taxBias) {
        tags.add('казна');
        tags.add('подат');
      }
    }

    const catalogue = this.getCatalogue();
    for (const b of catalogue) {
      const blob = `${b.id} ${b.name ?? ''} ${(b.ui?.nameRu ?? '')} ${(b.ui?.tagsRu ?? []).join(' ')} ${(b.category ?? '')}`.toLowerCase();
      for (const t of tags) {
        if (blob.includes(t)) {
          recommendedIds.add(b.id);
          break;
        }
      }
    }

    return {
      ids: Array.from(recommendedIds),
      tags: Array.from(tags),
      hintText: tags.size > 0 ? `Согласно курсу державы полезно: ${Array.from(tags).slice(0, 4).join(', ')}` : 'Согласно курсу державы полезно: ориентируйся на текущие доктрины',
    };
  }

  exportDoctrineSnapshot() {
    return {
      selectedDoctrineIds: [...(this.state.doctrineLoadout?.selectedDoctrineIds ?? [])],
      startingPointsTotal: this.state.doctrineLoadout?.startingPointsTotal ?? this._doctrineConfig().startPoints ?? 5,
      reformProject: this.state.reformProject ? { ...this.state.reformProject } : null,
      reformCooldownUntilTurn: this.state.doctrineLoadout?.reformCooldownUntilTurn ?? 0,
      turn: this.state.turn ?? 0,
    };
  }

  importDoctrineSnapshot(snapshot = {}) {
    const sel = Array.isArray(snapshot.selectedDoctrineIds) ? snapshot.selectedDoctrineIds.filter((id) => this.data.doctrines.some((d) => d.id === id)) : [];
    this.state.doctrineLoadout.startingPointsTotal = Number.isFinite(snapshot.startingPointsTotal) ? snapshot.startingPointsTotal : (this._doctrineConfig().startPoints ?? 5);
    this.state.doctrineLoadout.selectedDoctrineIds = sel;
    this.state.doctrineLoadout.pendingDoctrineIds = [];
    this.state.doctrineLoadout.reformCooldownUntilTurn = Number.isFinite(snapshot.reformCooldownUntilTurn) ? snapshot.reformCooldownUntilTurn : 0;
    this.state.turn = Number.isFinite(snapshot.turn) ? snapshot.turn : 0;

    this.state.reformProject = snapshot.reformProject ?? null;
    if (this.state.reformProject?.state === 'ACTIVE') {
      this.state.doctrineState.phase = 'reform';
      this.state.reform = { state: 'ACTIVE', temporaryModifiers: this.state.reformProject.temporaryModifiers ?? [] };
    } else {
      this.state.doctrineState.phase = 'locked';
      this.state.reform = null;
    }

    if (snapshot.legacyPresetId) {
      console.info('legacy preset ignored');
    }

    this.recomputeDerived();
    this._bump();
  }

  // --- Advisor ---

  recommendNextBuilding() {
    const rec = this.getDoctrineBuildingRecommendations();
    const direct = new Set(rec.ids ?? []);
    const tags = new Set((rec.tags ?? []).map((t) => String(t).toLowerCase()));

    const defs = this.getCatalogue().filter((b) => !b.isStarter);
    if (defs.length === 0) return null;

    let best = { id: null, score: -Infinity };
    for (const b of defs) {
      let score = 0;
      if (direct.has(b.id)) score += 10;

      if (tags.size > 0) {
        const blob = `${b.category ?? ''} ${(b.ui?.tagsRu ?? []).join(' ')} ${b.name ?? ''}`.toLowerCase();
        for (const t of tags) if (blob.includes(t)) score += 3;
      }

      for (const m of (b.mods ?? [])) {
        if (m.stat === 'GoldPerMinPct' || m.stat === 'ResourceYieldPct') score += 0.5;
      }

      const cost = b.cost?.gold ?? 0;
      score -= 0.0015 * cost;

      if (score > best.score) best = { id: b.id, score };
    }

    return best.id;
  }

}
