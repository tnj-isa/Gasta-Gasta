/**
 * Guarda texto por chave. Só `memoryStorage` existe por enquanto; o de IndexedDB vem na Tarefa 3.
 * @typedef {{get(key: string): Promise<string|undefined>, set(key: string, value: string): Promise<void>}} Storage
 */

/**
 * Guarda no IndexedDB do navegador (um object store "kv"). Só roda no navegador.
 * @param {string} [dbName]
 * @returns {Storage}
 */
export function indexedDbStorage(dbName = 'controle-financeiro') {
  let opening = null;
  const open = () => {
    opening ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { opening = null; reject(req.error); };
    });
    return opening;
  };
  const run = async (mode, action) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', mode);
      const req = action(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  };
  return {
    get: (key) => run('readonly', (store) => store.get(key)),
    set: async (key, value) => { await run('readwrite', (store) => store.put(value, key)); },
  };
}

/** @returns {Storage} */
export function memoryStorage() {
  const map = new Map();
  return {
    async get(key) { return map.get(key); },
    async set(key, value) { map.set(key, value); },
  };
}
