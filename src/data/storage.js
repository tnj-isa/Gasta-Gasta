/**
 * Guarda texto por chave. `compareAndSet` só grava se o que está guardado ainda é o `expected` (`undefined` = nada
 * guardado) e diz se gravou: é como duas janelas do app não pisam uma na outra.
 * @typedef {{
 *   get(key: string): Promise<string|undefined>,
 *   set(key: string, value: string): Promise<void>,
 *   compareAndSet(key: string, expected: string|undefined, value: string): Promise<boolean>,
 * }} Storage
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
    /** Ler e gravar na mesma transação: o navegador não deixa outra janela entrar no meio. */
    compareAndSet: async (key, expected, value) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        let gravou = false;
        const lendo = store.get(key);
        lendo.onsuccess = () => {
          if (lendo.result === expected) { store.put(value, key); gravou = true; }
        };
        tx.oncomplete = () => resolve(gravou);
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    },
  };
}

/** @returns {Storage} */
export function memoryStorage() {
  const map = new Map();
  return {
    async get(key) { return map.get(key); },
    async set(key, value) { map.set(key, value); },
    async compareAndSet(key, expected, value) {
      if (map.get(key) !== expected) return false;
      map.set(key, value);
      return true;
    },
  };
}
