export class LRUCache {
  constructor(limit = 64) {
    this.limit = Math.max(0, limit | 0);
    this.map = new Map();
  }

  get size() {
    return this.map.size;
  }

  has(key) {
    return this.map.has(key);
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.limit === 0) return;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    this._evict();
  }

  delete(key) {
    return this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }

  keys() {
    return Array.from(this.map.keys());
  }

  _evict() {
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }
}
