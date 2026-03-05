import { ChunkStoreIDB } from "./ChunkStoreIDB.js";
import { LRUCache } from "./LRUCache.js";
import { unpackChunkStatic } from "./ChunkPacker.js";

function chunkKey(seed, genVersion, cx, cy) {
  return `${seed}:${genVersion}:${cx},${cy}`;
}

export class ChunkCacheService {
  constructor({ workerUrl = new URL("../gen/chunkGeneratorWorker.js", import.meta.url), maxWorkers = 2, ramLimit = 64 } = {}) {
    this.store = new ChunkStoreIDB();
    this.ram = new LRUCache(ramLimit);
    this.workerUrl = workerUrl;
    this.maxWorkers = Math.max(1, Math.min(2, maxWorkers | 0));

    this.workers = [];
    this.pending = [];
    this.inFlight = new Map();

    this.stats = {
      requests: 0,
      hits: 0,
      misses: 0,
      generated: 0,
      genTime: 0,
      idbTime: 0,
    };
  }

  async open() {
    await this.store.open();
    this._ensureWorkers();
  }

  async getStaticChunk(seed, genVersion, cx, cy) {
    await this.open();
    const key = chunkKey(seed, genVersion, cx, cy);
    this.stats.requests++;

    const fromRam = this.ram.get(key);
    if (fromRam) {
      this.stats.hits++;
      return fromRam;
    }

    const tIdb0 = performance.now();
    const cached = await this.store.get(key);
    this.stats.idbTime += performance.now() - tIdb0;

    if (cached?.payload) {
      const decoded = await unpackChunkStatic(cached.payload);
      this.ram.set(key, decoded);
      this.stats.hits++;
      return decoded;
    }

    this.stats.misses++;
    const generated = await this._generate(seed, genVersion, cx, cy, key);
    this.ram.set(key, generated.data);

    await this.store.put({
      key,
      seed,
      genVersion,
      cx,
      cy,
      payload: generated.payload,
      genMs: generated.genMs,
      createdAt: Date.now(),
    });

    return generated.data;
  }

  async prefetch(seed, genVersion, coordsList, concurrency = 2) {
    await this.open();
    const limit = Math.max(1, Math.min(this.maxWorkers, concurrency | 0));
    let cursor = 0;
    const run = async () => {
      while (cursor < coordsList.length) {
        const idx = cursor++;
        const { cx, cy } = coordsList[idx];
        await this.getStaticChunk(seed, genVersion, cx, cy);
      }
    };
    const jobs = Array.from({ length: limit }, () => run());
    await Promise.all(jobs);
  }

  evictRamFarFrom(centerCx, centerCy, maxDistance) {
    for (const k of this.ram.keys()) {
      const [, , coord] = k.split(":");
      const [cxS, cyS] = coord.split(",");
      const cx = Number(cxS);
      const cy = Number(cyS);
      if (Math.max(Math.abs(cx - centerCx), Math.abs(cy - centerCy)) > maxDistance) {
        this.ram.delete(k);
      }
    }
  }

  getStats() {
    const hitRatio = this.stats.requests > 0 ? this.stats.hits / this.stats.requests : 0;
    return { ...this.stats, hitRatio };
  }

  _ensureWorkers() {
    if (this.workers.length > 0) return;
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker(this.workerUrl, { type: "module" });
      const slot = { worker, busy: false };
      worker.onmessage = async (event) => {
        const msg = event.data;
        if (!msg || msg.type !== "GEN_DONE") return;
        const pending = this.inFlight.get(msg.key);
        slot.busy = false;
        if (!pending) return;
        this.inFlight.delete(msg.key);
        try {
          const data = await unpackChunkStatic(msg.payload);
          this.stats.generated++;
          this.stats.genTime += msg.genMs || 0;
          pending.resolve({ data, payload: msg.payload, genMs: msg.genMs || 0 });
        } catch (err) {
          pending.reject(err);
        }
        this._pump();
      };
      worker.onerror = (err) => {
        console.error("[ChunkCacheService] worker error", err);
      };
      this.workers.push(slot);
    }
  }

  _generate(seed, genVersion, cx, cy, key) {
    const existing = this.inFlight.get(key);
    if (existing) return existing.promise;

    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const task = { type: "GEN", key, seed, genVersion, cx, cy };
    this.inFlight.set(key, { resolve, reject, promise, task });
    this.pending.push(task);
    this._pump();
    return promise;
  }

  _pump() {
    for (const slot of this.workers) {
      if (slot.busy) continue;
      const task = this.pending.shift();
      if (!task) return;
      slot.busy = true;
      slot.worker.postMessage(task);
    }
  }
}

export { chunkKey };
