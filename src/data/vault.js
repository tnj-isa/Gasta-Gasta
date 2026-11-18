import { DEFAULT_ITERATIONS, deriveKey, fromB64, openJSON, sealJSON } from '../lib/crypto.js';

const KEY = 'vault';

/**
 * O cofre guarda todos os dados como UM bloco criptografado.
 * A chave derivada fica só na memória enquanto estiver destravado.
 * @param {import('./storage.js').Storage} storage
 * @param {{iterations?: number}} [opts]
 */
export function createVault(storage, { iterations = DEFAULT_ITERATIONS } = {}) {
  /** @type {{key: CryptoKey, salt: Uint8Array, iterations: number} | null} */
  let session = null;

  async function persist(state, { key, salt, iterations: n }) {
    const blob = await sealJSON(state, key, { salt, iterations: n });
    await storage.set(KEY, JSON.stringify(blob));
  }

  return {
    async isInitialized() {
      return (await storage.get(KEY)) !== undefined;
    },

    /** Cria o cofre pela primeira vez. Nunca sobrescreve um cofre existente. */
    async init(password, state) {
      if (await this.isInitialized()) throw new Error('O cofre já existe');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await deriveKey(password, salt, iterations);
      const next = { key, salt, iterations };
      await persist(state, next);
      session = next;
    },

    /** Só troca o estado do cofre depois de abrir com sucesso; senha errada não muda nada. */
    async unlock(password) {
      const raw = await storage.get(KEY);
      if (raw === undefined) throw new Error('O cofre ainda não foi criado');
      const blob = JSON.parse(raw);
      const salt = fromB64(blob.salt);
      const key = await deriveKey(password, salt, blob.iterations);
      const state = await openJSON(blob, key);
      session = { key, salt, iterations: blob.iterations };
      return state;
    },

    async save(state) {
      if (!session) throw new Error('O cofre está bloqueado');
      await persist(state, session);
    },

    lock() {
      session = null;
    },

    isUnlocked() {
      return session !== null;
    },
  };
}

/**
 * Trava depois de um tempo sem uso. `touch()` reinicia o relógio.
 * `check()` confere pelo horário se o tempo já passou: o celular pode congelar o app em segundo
 * plano e o relógio do navegador não disparar, então a conferência roda quando o app volta.
 * @param {{timeoutMs: number, onLock: () => void, setTimer?: Function, clearTimer?: Function, now?: () => number}} opts
 */
export function createAutoLock({ timeoutMs, onLock, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now }) {
  let id = null;
  let ativo = false;
  let ultimoToque = 0;

  const cancelar = () => {
    if (id !== null) clearTimer(id);
    id = null;
  };
  const travar = () => {
    cancelar();
    ativo = false;
    onLock();
  };

  return {
    touch() {
      cancelar();
      ativo = true;
      ultimoToque = now();
      id = setTimer(travar, timeoutMs);
    },
    check() {
      if (ativo && now() - ultimoToque >= timeoutMs) travar();
    },
    stop() {
      cancelar();
      ativo = false;
    },
  };
}
