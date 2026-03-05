import { chunkKey } from "../cache/ChunkCacheService.js";

const CHUNK_SIZE = 64;

function floorDiv(n, d) {
  return Math.floor(n / d);
}

export class WorldStreamer {
  constructor({ cacheService, radiusChunks = 2, prefetchConcurrency = 2, logger = console } = {}) {
    this.cacheService = cacheService;
    this.radiusChunks = Math.max(1, radiusChunks | 0);
    this.prefetchConcurrency = Math.max(1, Math.min(2, prefetchConcurrency | 0));
    this.logger = logger;
    this.activeCenter = { worldX: 0, worldY: 0 };
    this.lastNeeded = new Set();
  }

  updateActiveCenter(worldX, worldY) {
    this.activeCenter.worldX = worldX;
    this.activeCenter.worldY = worldY;
  }

  async tick(seed, genVersion) {
    const centerCx = floorDiv(this.activeCenter.worldX, CHUNK_SIZE);
    const centerCy = floorDiv(this.activeCenter.worldY, CHUNK_SIZE);

    const coords = [];
    const needed = new Set();

    for (let dy = -this.radiusChunks; dy <= this.radiusChunks; dy++) {
      for (let dx = -this.radiusChunks; dx <= this.radiusChunks; dx++) {
        const cx = centerCx + dx;
        const cy = centerCy + dy;
        coords.push({ cx, cy });
        needed.add(chunkKey(seed, genVersion, cx, cy));
      }
    }

    const missing = coords.filter(({ cx, cy }) => !this.lastNeeded.has(chunkKey(seed, genVersion, cx, cy)));
    if (missing.length > 0) {
      const t0 = performance.now();
      await this.cacheService.prefetch(seed, genVersion, missing, this.prefetchConcurrency);
      const t1 = performance.now();
      const stats = this.cacheService.getStats();
      this.logger.debug?.(
        `[WorldStreamer] prefetched=${missing.length} in ${(t1 - t0).toFixed(1)}ms ` +
        `hitRatio=${(stats.hitRatio * 100).toFixed(1)}%`
      );
    }

    this.cacheService.evictRamFarFrom(centerCx, centerCy, this.radiusChunks + 1);
    this.lastNeeded = needed;
  }
}

export { floorDiv };
