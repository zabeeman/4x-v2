export class ChunkTextureLRU {
  constructor(scene, { limit = 64 } = {}) {
    this.scene = scene;
    this.limit = Math.max(0, limit | 0);
    this.entries = new Map();
  }

  touch(key, entry = {}) {
    if (!key) return;
    if (this.entries.has(key)) {
      const existing = this.entries.get(key);
      this.entries.delete(key);
      this.entries.set(key, { ...existing, ...entry });
    } else {
      this.entries.set(key, entry);
    }
    this._evictIfNeeded();
  }

  clear() {
    for (const [key, entry] of this.entries) this._evictOne(key, entry);
    this.entries.clear();
  }

  _evictIfNeeded() {
    while (this.entries.size > this.limit) {
      const oldestKey = this.entries.keys().next().value;
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      this._evictOne(oldestKey, oldest);
    }
  }

  _evictOne(key, entry = {}) {
    try { entry.sprite?.destroy?.(); } catch {}
    try { entry.renderTexture?.destroy?.(); } catch {}
    try { entry.imageBitmap?.close?.(); } catch {}

    if (entry.textureKey && this.scene?.textures?.exists?.(entry.textureKey)) {
      this.scene.textures.remove(entry.textureKey);
    } else if (key && this.scene?.textures?.exists?.(key)) {
      this.scene.textures.remove(key);
    }
  }
}
