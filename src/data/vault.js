import { DEFAULT_ITERATIONS, deriveKey, fromB64, openJSON, sealJSON } from '../lib/crypto.js';

const KEY = 'vault';

/** Outra janela do app gravou no meio: gravar agora apagaria o que ela guardou. */
export class VaultConflictError extends Error {
  constructor() {
    super('Os dados foram alterados em outra janela do app. Feche as outras janelas e abra o app de novo para não perder nada.');
    this.name = 'VaultConflictError';
  }
}

/**
 * O cofre guarda todos os dados como UM bloco criptografado.
 * A chave derivada fica só na memória enquanto estiver destravado.
 * @param {import('./storage.js').Storage} storage
 * @param {{iterations?: number}} [opts]
 */
export function createVault(storage, { iterations = DEFAULT_ITERATIONS } = {}) {
  /** `guardado` é o texto que esta janela viu por último no armazenamento (lido ou gravado por ela). */
  /** @type {{key: CryptoKey, salt: Uint8Array, iterations: number, guardado: string} | null} */
  let session = null;

  /** Grava só se ninguém mais gravou desde a última vez que esta janela viu; devolve o texto gravado. */
  async function persist(state, { key, salt, iterations: n, guardado }) {
    const blob = await sealJSON(state, key, { salt, iterations: n });
    const texto = JSON.stringify(blob);
    if (!(await storage.compareAndSet(KEY, guardado, texto))) return null;
    return texto;
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
      const next = { key, salt, iterations, guardado: undefined };
      const gravado = await persist(state, next);
      if (gravado === null) throw new Error('O cofre já existe');
      session = { ...next, guardado: gravado };
    },

    /** Só troca o estado do cofre depois de abrir com sucesso; senha errada não muda nada. */
    async unlock(password) {
      const raw = await storage.get(KEY);
      if (raw === undefined) throw new Error('O cofre ainda não foi criado');
      const blob = JSON.parse(raw);
      const salt = fromB64(blob.salt);
      const key = await deriveKey(password, salt, blob.iterations);
      const state = await openJSON(blob, key);
      session = { key, salt, iterations: blob.iterations, guardado: raw };
      return state;
    },

    async save(state) {
      if (!session) throw new Error('O cofre está bloqueado');
      const gravado = await persist(state, session);
      if (gravado === null) throw new VaultConflictError();
      session = { ...session, guardado: gravado };
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
