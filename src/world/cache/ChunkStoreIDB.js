const DB_NAME = "4xv2_world_cache";
const DB_VERSION = 1;
const STORE_NAME = "chunks";

export class ChunkStoreIDB {
  constructor({ dbName = DB_NAME, version = DB_VERSION } = {}) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Failed to open IndexedDB"));
    });
    return this.db;
  }

  async get(key) {
    return this._request("readonly", (store) => store.get(key));
  }

  async put(record) {
    return this._request("readwrite", (store) => store.put(record));
  }

  async bulkPut(records) {
    await this.open();
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const record of records) store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("bulkPut failed"));
      tx.onabort = () => reject(tx.error || new Error("bulkPut aborted"));
    });
  }

  async delete(key) {
    return this._request("readwrite", (store) => store.delete(key));
  }

  async clear() {
    return this._request("readwrite", (store) => store.clear());
  }

  async _request(mode, fn) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
    });
  }
}
