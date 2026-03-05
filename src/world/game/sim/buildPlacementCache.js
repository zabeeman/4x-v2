import { sampleHM } from '../../infinite/terrainSampler.js';
import { getNodeResourceAt } from './resourceSystem.js';

const INF_DIST = 0xffff;
const WORDS_4096 = 128;
const TILES_PER_CHUNK = 4096;
const FLAG_OCCUPIED = 1 << 0;
const FLAG_FORBIDDEN = 1 << 1;

function floorDiv(n, d) {
  return Math.floor(n / d);
}

function tileKey(x, y) {
  return `${x},${y}`;
}

function chunkKey(cx, cy) {
  return `${cx},${cy}`;
}

function idxToXY(idx, chunkSize) {
  const ly = Math.floor(idx / chunkSize);
  const lx = idx - ly * chunkSize;
  return { lx, ly };
}

function forEachBit(bitset, fn) {
  for (let w = 0; w < bitset.length; w++) {
    let word = bitset[w];
    while (word) {
      const t = word & -word;
      const b = 31 - Math.clz32(t);
      fn((w << 5) + b);
      word ^= t;
    }
  }
}

function setBit(bits, idx) {
  bits[idx >>> 5] |= (1 << (idx & 31));
}

function testBit(bits, idx) {
  return ((bits[idx >>> 5] >>> (idx & 31)) & 1) === 1;
}

function clearBitset(dst) {
  dst.fill(0);
}

function cloneBitset(src) {
  return new Uint32Array(src);
}

function andInto(dst, src) {
  for (let i = 0; i < dst.length; i++) dst[i] &= src[i];
}

export class BuildZoneProvider {
  constructor(sim) {
    this.sim = sim;
    this._version = 1;
    this._history = [];
  }

  getVersion() {
    return this._version;
  }

  isInBuildZone(x, y) {
    return !!this.sim.getBuildZoneOwner(x, y);
  }

  getAllZoneTiles() {
    const out = [];
    const seen = new Set();
    for (const src of this.sim.getZoneSources()) {
      for (const t of (src.tiles ?? [])) {
        const k = tileKey(t.tx, t.ty);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ x: t.tx, y: t.ty });
      }
    }

    if (out.length === 0 && this.sim.state.spawn) {
      const sp = this.sim.state.spawn;
      const r = this.sim.data.balance?.district?.firstBuildRadiusTiles ?? 10;
      for (let y = sp.ty - r; y <= sp.ty + r; y++) {
        for (let x = sp.tx - r; x <= sp.tx + r; x++) {
          const dx = x - sp.tx;
          const dy = y - sp.ty;
          if (dx * dx + dy * dy <= r * r) out.push({ x, y });
        }
      }
    }

    return out;
  }

  consumeDeltaSince(lastVersion) {
    if (lastVersion === this._version) return { version: this._version, added: [], removed: [] };
    const chunks = this._history.filter((h) => h.version > lastVersion);
    if (!chunks.length) return null;

    const added = [];
    const removed = [];
    for (const c of chunks) {
      if (c.fullRebuild) return null;
      added.push(...c.added);
      removed.push(...c.removed);
    }
    return { version: this._version, added, removed };
  }

  pushDelta({ added = [], removed = [], fullRebuild = false } = {}) {
    this._version += 1;
    this._history.push({ version: this._version, added, removed, fullRebuild });
    if (this._history.length > 32) this._history.shift();
  }
}

export class WorldProvider {
  constructor(sim, infiniteCfg) {
    this.sim = sim;
    this.infiniteCfg = infiniteCfg;
    this.chunkSize = 64;
    this.staticChunks = new Map();
  }

  isChunkLoaded() {
    return true;
  }

  getDynamicVersion() {
    return this.sim.getWorldDynamicVersion();
  }

  _ensureChunk(cx, cy) {
    const k = chunkKey(cx, cy);
    if (this.staticChunks.has(k)) return this.staticChunks.get(k);

    const surfaceId = new Uint8Array(TILES_PER_CHUNK);
    const coast01 = new Uint8Array(TILES_PER_CHUNK);
    const slope01 = new Uint8Array(TILES_PER_CHUNK);
    const resourceId = new Uint8Array(TILES_PER_CHUNK);

    const surfaceMap = new Map([
      ['land', 1], ['forest', 2], ['desert', 3], ['rock', 4], ['snow', 5],
      ['swamp', 6], ['beach', 7], ['coast_cliff', 8], ['shallow_water', 9], ['deep_water', 10], ['road', 11],
    ]);
    const resourceMap = new Map([['wood', 1], ['metal', 2], ['marble', 3], ['glass', 4], ['powder', 5]]);

    const startX = cx * this.chunkSize;
    const startY = cy * this.chunkSize;
    for (let ly = 0; ly < this.chunkSize; ly++) {
      for (let lx = 0; lx < this.chunkSize; lx++) {
        const x = startX + lx;
        const y = startY + ly;
        const idx = ly * this.chunkSize + lx;
        const hm = sampleHM(this.sim.seed, x, y, this.infiniteCfg);
        slope01[idx] = Math.max(0, Math.min(255, Math.round((hm.slope ?? 0) * 255)));
        coast01[idx] = Math.max(0, Math.min(255, Math.round((hm.coast ?? 0) * 255)));
        surfaceId[idx] = surfaceMap.get(hm.surface) ?? 0;
        const resource = getNodeResourceAt(this.sim.seed, x, y, this.infiniteCfg, this.sim.data.balance);
        resourceId[idx] = resourceMap.get(resource) ?? 0;
      }
    }

    const chunk = { surfaceId, coast01, slope01, resourceId };
    this.staticChunks.set(k, chunk);
    return chunk;
  }

  getTileStatic(x, y) {
    const cx = floorDiv(x, this.chunkSize);
    const cy = floorDiv(y, this.chunkSize);
    const lx = x - cx * this.chunkSize;
    const ly = y - cy * this.chunkSize;
    const idx = ly * this.chunkSize + lx;
    const c = this._ensureChunk(cx, cy);
    return {
      slope01: c.slope01[idx],
      coast01: c.coast01[idx],
      surfaceId: c.surfaceId[idx],
      resourceId: c.resourceId[idx],
    };
  }

  getTileFlags(x, y) {
    const occ = this.sim._occupiedTileSet?.has(tileKey(x, y)) ? FLAG_OCCUPIED : 0;
    return occ;
  }
}

export class RulesCompiler {
  compileRulesFromCatalog(catalog) {
    const buildings = {};
    const ruleSets = {};

    for (const def of catalog ?? []) {
      const req = [];
      const r = def.placementRules ?? {};
      const forbidden = new Set(r.forbiddenSurfaces ?? []);
      if (r.mustBeInsideBuildZone) req.push('IN_ZONE');
      if (forbidden.has('water') || forbidden.has('deep_water') || forbidden.has('shallow_water')) req.push('NOT_WATER');
      if (r.requiresCoast) req.push('COAST');
      if (r.requiresFlat) req.push('FLAT');
      if (r.requiresRoad) req.push('NEAR_ROAD');
      req.sort();
      const ruleSetId = req.join('|') || 'DEFAULT';
      if (!ruleSets[ruleSetId]) ruleSets[ruleSetId] = { requires: req };

      let specialType = null;
      if (def.extract || r.requiresResourceNode?.type) specialType = 'EXTRACTOR';
      else if (Array.isArray(r.allowedSurfaces) && r.allowedSurfaces.length > 0) specialType = 'GEO';

      buildings[def.id] = {
        ruleSetId,
        specialType,
        meta: {
          requiresResourceType: r.requiresResourceNode?.type ? String(r.requiresResourceNode.type).toLowerCase() : (def.extract?.resource ?? null),
          allowedSurfaces: r.allowedSurfaces ?? null,
          forbiddenSurfaces: r.forbiddenSurfaces ?? null,
        },
      };
    }

    return { buildings, ruleSets };
  }
}

export class BuildPlacementCache {
  constructor({ world, buildZone, rules, cfg, chunkSize = 64, radiusTiles = 300 }) {
    this.world = world;
    this.buildZone = buildZone;
    this.rules = rules;
    this.cfg = cfg;
    this.chunkSize = chunkSize;
    this.radiusTiles = radiusTiles;

    this.zoneVersionSeen = 0;
    this.worldVersionSeen = -1;
    this.workStamp = 0;
    this.baseStamp = 0;

    this.workChunks = new Map();
    this.workChunkBBox = null;
    this.dirtyChunks = new Set();
    this.ruleSetCache = new Map();
    this.extractorCache = new Map();
    this.placementChunkIndex = new Map();
  }

  warmup() {
    this.rebuildWorkSetFull();
    this.rebuildBaseMasksFull();
    this.getRuleSetMask('DEFAULT');
    this.zoneVersionSeen = this.buildZone.getVersion();
    this.worldVersionSeen = this.world.getDynamicVersion();
  }

  ensureUpToDate() {
    const zoneV = this.buildZone.getVersion();
    if (zoneV !== this.zoneVersionSeen) {
      const delta = this.buildZone.consumeDeltaSince(this.zoneVersionSeen);
      this.onBuildZoneChanged(delta);
      this.zoneVersionSeen = zoneV;
    }

    const worldV = this.world.getDynamicVersion();
    if (worldV !== this.worldVersionSeen) {
      this.rebuildBaseMasksPartial();
      this.worldVersionSeen = worldV;
    }
  }

  invalidateTile(x, y) {
    const cx = floorDiv(x, this.chunkSize);
    const cy = floorDiv(y, this.chunkSize);
    this.dirtyChunks.add(chunkKey(cx, cy));
  }

  invalidateTiles(list) {
    for (const t of (list ?? [])) this.invalidateTile(t.tx ?? t.x, t.ty ?? t.y);
  }

  onBuildZoneChanged(deltaOrNull) {
    if (!deltaOrNull) {
      this.rebuildWorkSetFull();
      this.rebuildBaseMasksFull();
      return;
    }

    if ((deltaOrNull.removed?.length ?? 0) > 0) {
      this.rebuildWorkSetFull();
      this.rebuildBaseMasksFull();
      return;
    }

    this.applyBuildZoneDelta(deltaOrNull.added ?? []);
    this.rebuildBaseMasksFull();
  }

  _ensureChunkState(cx, cy) {
    const k = chunkKey(cx, cy);
    if (this.workChunks.has(k)) return this.workChunks.get(k);
    const chunk = {
      cx,
      cy,
      dist: new Uint16Array(TILES_PER_CHUNK).fill(INF_DIST),
      inWork: new Uint32Array(WORDS_4096),
      baseOk: new Uint32Array(WORDS_4096),
      flatOk: new Uint32Array(WORDS_4096),
      coastOk: new Uint32Array(WORDS_4096),
      nearRoad: new Uint32Array(WORDS_4096),
      geoOk: new Uint32Array(WORDS_4096),
    };
    this.workChunks.set(k, chunk);
    return chunk;
  }

  rebuildWorkSetFull() {
    this.workChunks.clear();
    const sources = [...this.buildZone.getAllZoneTiles()];
    if (!sources.length) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const s of sources) {
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y);
      maxY = Math.max(maxY, s.y);
    }

    minX -= this.radiusTiles;
    minY -= this.radiusTiles;
    maxX += this.radiusTiles;
    maxY += this.radiusTiles;

    const cx0 = floorDiv(minX, this.chunkSize);
    const cy0 = floorDiv(minY, this.chunkSize);
    const cx1 = floorDiv(maxX, this.chunkSize);
    const cy1 = floorDiv(maxY, this.chunkSize);
    this.workChunkBBox = { cx0, cy0, cx1, cy1 };

    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) this._ensureChunkState(cx, cy);
    }

    const q = [];
    let qh = 0;
    for (const s of sources) {
      const cx = floorDiv(s.x, this.chunkSize);
      const cy = floorDiv(s.y, this.chunkSize);
      const lx = s.x - cx * this.chunkSize;
      const ly = s.y - cy * this.chunkSize;
      const idx = ly * this.chunkSize + lx;
      const c = this._ensureChunkState(cx, cy);
      if (c.dist[idx] === 0) continue;
      c.dist[idx] = 0;
      q.push({ x: s.x, y: s.y, d: 0 });
    }

    while (qh < q.length) {
      const cur = q[qh++];
      if (cur.d >= this.radiusTiles) continue;
      const nd = cur.d + 1;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
        const cx = floorDiv(nx, this.chunkSize);
        const cy = floorDiv(ny, this.chunkSize);
        const c = this._ensureChunkState(cx, cy);
        const lx = nx - cx * this.chunkSize;
        const ly = ny - cy * this.chunkSize;
        const idx = ly * this.chunkSize + lx;
        if (nd >= c.dist[idx]) continue;
        c.dist[idx] = nd;
        q.push({ x: nx, y: ny, d: nd });
      }
    }

    for (const c of this.workChunks.values()) {
      clearBitset(c.inWork);
      for (let idx = 0; idx < TILES_PER_CHUNK; idx++) {
        if (c.dist[idx] <= this.radiusTiles) setBit(c.inWork, idx);
      }
    }

    this.workStamp++;
    this.ruleSetCache.clear();
    this.extractorCache.clear();
    this.placementChunkIndex.clear();

    let inWorkTiles = 0;
    for (const c of this.workChunks.values()) {
      for (const w of c.inWork) inWorkTiles += (w.toString(2).match(/1/g) || []).length;
    }
    console.debug('[BuildPlacementCache] WorkSet rebuild', { chunkCount: this.workChunks.size, inWorkTiles, radiusTiles: this.radiusTiles });
  }

  applyBuildZoneDelta(addedTiles) {
    if (!this.workChunkBBox) {
      this.rebuildWorkSetFull();
      return;
    }
    const { cx0, cy0, cx1, cy1 } = this.workChunkBBox;
    const q = [];
    let qh = 0;

    for (const t of addedTiles) {
      const x = t.x ?? t.tx;
      const y = t.y ?? t.ty;
      const cx = floorDiv(x, this.chunkSize);
      const cy = floorDiv(y, this.chunkSize);
      if (cx < cx0 || cx > cx1 || cy < cy0 || cy > cy1) {
        this.rebuildWorkSetFull();
        return;
      }
      const c = this._ensureChunkState(cx, cy);
      const lx = x - cx * this.chunkSize;
      const ly = y - cy * this.chunkSize;
      const idx = ly * this.chunkSize + lx;
      if (c.dist[idx] === 0) continue;
      c.dist[idx] = 0;
      q.push({ x, y, d: 0 });
    }

    while (qh < q.length) {
      const cur = q[qh++];
      if (cur.d >= this.radiusTiles) continue;
      const nd = cur.d + 1;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const cx = floorDiv(nx, this.chunkSize);
        const cy = floorDiv(ny, this.chunkSize);
        if (cx < cx0 || cx > cx1 || cy < cy0 || cy > cy1) continue;
        const c = this._ensureChunkState(cx, cy);
        const lx = nx - cx * this.chunkSize;
        const ly = ny - cy * this.chunkSize;
        const idx = ly * this.chunkSize + lx;
        if (nd >= c.dist[idx]) continue;
        c.dist[idx] = nd;
        q.push({ x: nx, y: ny, d: nd });
      }
    }

    for (const c of this.workChunks.values()) {
      clearBitset(c.inWork);
      for (let idx = 0; idx < TILES_PER_CHUNK; idx++) {
        if (c.dist[idx] <= this.radiusTiles) setBit(c.inWork, idx);
      }
    }

    this.workStamp++;
    this.ruleSetCache.clear();
    this.extractorCache.clear();
    this.placementChunkIndex.clear();
  }

  rebuildBaseMasksFull() {
    for (const c of this.workChunks.values()) this._rebuildChunkBase(c);
    this.baseStamp++;
    this.ruleSetCache.clear();
    this.extractorCache.clear();
    this.placementChunkIndex.clear();
    this.dirtyChunks.clear();
  }

  rebuildBaseMasksPartial() {
    if (!this.dirtyChunks.size) return;
    for (const k of this.dirtyChunks) {
      const c = this.workChunks.get(k);
      if (c) this._rebuildChunkBase(c);
    }
    this.dirtyChunks.clear();
    this.baseStamp++;
    this.ruleSetCache.clear();
    this.extractorCache.clear();
    this.placementChunkIndex.clear();
  }

  _rebuildChunkBase(c) {
    clearBitset(c.baseOk);
    clearBitset(c.flatOk);
    clearBitset(c.coastOk);
    clearBitset(c.nearRoad);
    clearBitset(c.geoOk);

    const startX = c.cx * this.chunkSize;
    const startY = c.cy * this.chunkSize;
    forEachBit(c.inWork, (idx) => {
      const { lx, ly } = idxToXY(idx, this.chunkSize);
      const x = startX + lx;
      const y = startY + ly;

      const flags = this.world.getTileFlags(x, y);
      const stat = this.world.getTileStatic(x, y);
      const inZone = this.buildZone.isInBuildZone(x, y);
      const isWater = stat.surfaceId === 9 || stat.surfaceId === 10;
      const flat = stat.slope01 <= 64;
      const coast = stat.coast01 >= 128 || stat.surfaceId === 7 || stat.surfaceId === 8;

      if ((flags & (FLAG_OCCUPIED | FLAG_FORBIDDEN)) === 0 && inZone && !isWater) setBit(c.baseOk, idx);
      if (flat) setBit(c.flatOk, idx);
      if (coast) setBit(c.coastOk, idx);
      setBit(c.geoOk, idx);
    });
  }

  getRuleSetMask(ruleSetId) {
    const cached = this.ruleSetCache.get(ruleSetId);
    if (cached && cached.baseStamp === this.baseStamp && cached.workStamp === this.workStamp) return cached.chunks;

    const req = this.rules.ruleSets[ruleSetId]?.requires ?? [];
    const out = [];
    for (const c of this.workChunks.values()) {
      const bits = cloneBitset(c.baseOk);
      for (const r of req) {
        if (r === 'FLAT') andInto(bits, c.flatOk);
        else if (r === 'COAST') andInto(bits, c.coastOk);
        else if (r === 'NEAR_ROAD') andInto(bits, c.nearRoad);
      }
      out.push({ cx: c.cx, cy: c.cy, bitset4096: bits });
    }

    this.ruleSetCache.set(ruleSetId, { chunks: out, baseStamp: this.baseStamp, workStamp: this.workStamp });
    return out;
  }

  getExtractorMask(buildingId) {
    const cacheKey = `ex:${buildingId}`;
    const cached = this.extractorCache.get(cacheKey);
    if (cached && cached.baseStamp === this.baseStamp) return cached.chunks;

    const meta = this.rules.buildings[buildingId]?.meta ?? {};
    const wantRes = String(meta.requiresResourceType ?? '').toLowerCase();
    const idMap = { wood: 1, metal: 2, marble: 3, glass: 4, powder: 5 };
    const want = idMap[wantRes] ?? 0;

    const out = [];
    for (const c of this.workChunks.values()) {
      const bits = cloneBitset(c.baseOk);
      forEachBit(bits, (idx) => {
        const { lx, ly } = idxToXY(idx, this.chunkSize);
        const x = c.cx * this.chunkSize + lx;
        const y = c.cy * this.chunkSize + ly;
        const stat = this.world.getTileStatic(x, y);
        if (want && stat.resourceId !== want) bits[idx >>> 5] &= ~(1 << (idx & 31));
      });
      out.push({ cx: c.cx, cy: c.cy, bitset4096: bits });
    }

    this.extractorCache.set(cacheKey, { chunks: out, baseStamp: this.baseStamp });
    return out;
  }

  getPlacementMask(buildingId) {
    this.ensureUpToDate();
    const b = this.rules.buildings[buildingId];
    if (!b) return [];
    if (b.specialType === 'EXTRACTOR') {
      const mask = this.getExtractorMask(buildingId);
      console.debug('[BuildPlacementCache] extractor mask', { buildingId, chunks: mask.length, baseStamp: this.baseStamp });
      return mask;
    }
    const mask = this.getRuleSetMask(b.ruleSetId);
    console.debug('[BuildPlacementCache] ruleset mask', { buildingId, ruleSetId: b.ruleSetId, chunks: mask.length, baseStamp: this.baseStamp });
    return mask;
  }

  canPlaceAt(buildingId, x, y) {
    this.ensureUpToDate();
    const cx = floorDiv(x, this.chunkSize);
    const cy = floorDiv(y, this.chunkSize);
    const idx = (y - cy * this.chunkSize) * this.chunkSize + (x - cx * this.chunkSize);

    const cacheKey = String(buildingId);
    let cache = this.placementChunkIndex.get(cacheKey);
    if (!cache || cache.baseStamp !== this.baseStamp || cache.workStamp !== this.workStamp) {
      const chunkMap = new Map();
      const mask = this.getPlacementMask(buildingId);
      for (const m of mask) chunkMap.set(`${m.cx},${m.cy}`, m.bitset4096);
      cache = { baseStamp: this.baseStamp, workStamp: this.workStamp, chunkMap };
      this.placementChunkIndex.set(cacheKey, cache);
    }

    const bits = cache.chunkMap.get(`${cx},${cy}`);
    if (!bits) return false;
    return testBit(bits, idx);
  }
}
