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
      selectedDoctrines: [],

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
    console.log("ZoneSources city", cityId, list.length);

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
    console.log("CityZoneTiles size", cityId, union.size);
    return union;
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

  _isDisputed() {
    return false;
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

    if (def.isStarter || def.isHub || (!cityId && def.buildZone?.addsBuildZone)) {
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

  getDoctrineGroups() {
    const groups = new Map();
    for (const d of this.data.doctrines) {
      const g = d.choiceGroup ?? 'default';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(d);
    }
    return groups;
  }

  canSelectDoctrine(doctrineId) {
    const d = this.data.doctrines.find(x => x.id === doctrineId);
    if (!d) return false;
    const g = d.choiceGroup;
    if (!g) return true;
    for (const id of this.state.selectedDoctrines) {
      const dd = this.data.doctrines.find(x => x.id === id);
      if (dd?.choiceGroup === g && dd.id !== doctrineId) return false;
    }
    return true;
  }

  selectDoctrine(doctrineId) {
    if (!this.canSelectDoctrine(doctrineId)) return false;
    if (this.state.selectedDoctrines.includes(doctrineId)) return true;
    this.state.selectedDoctrines.push(doctrineId);
    this.recomputeDerived();
    this._bump();
    return true;
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

  // --- Advisor ---

  recommendNextBuilding(presetId = 'Balanced') {
    const preset = this.data.presets.find(p => p.id === presetId) ?? this.data.presets[0];
    if (!preset) return null;

    const weights = preset.weights ?? {};
    const best = { id: null, score: -Infinity };

    for (const b of this.data.buildings) {
      if (b.isStarter) continue;
      let s = 0;
      for (const m of (b.mods ?? [])) {
        const w = weights[m.stat] ?? 0;
        if (m.type === 'AddPct') s += w * m.value;
        else if (m.type === 'Mul') s += w * (m.value - 1);
        else if (m.type === 'AddFlat') s += w * m.value;
      }
      const cost = b.cost?.gold ?? 0;
      s -= (preset.costPenalty ?? 0.002) * cost;

      if (s > best.score) {
        best.id = b.id;
        best.score = s;
      }
    }

    return best.id;
  }
}
