import { emptyState } from '../domain/model.js';

/**
 * Guarda o estado do app em memória e o salva no cofre a cada mudança.
 * @param {ReturnType<typeof import('./vault.js').createVault>} vault
 */
export function createStore(vault) {
  /** @type {import('../domain/model.js').State | null} */
  let current = null;
  // Salvamentos em fila: dois toques seguidos nunca se atropelam.
  let queue = Promise.resolve();

  const enqueue = (job) => {
    const result = queue.then(job);
    queue = result.catch(() => {});
    return result;
  };

  return {
    async create(password) {
      const state = emptyState();
      await vault.init(password, state);
      current = state;
      return state;
    },

    async load(password) {
      current = null;
      current = await vault.unlock(password);
      return current;
    },

    getState() {
      if (!vault.isUnlocked() || current === null) {
        current = null;
        throw new Error('O app está bloqueado');
      }
      return current;
    },

    /** Aplica a mudança, salva no cofre e só então atualiza o estado em memória. */
    commit(mutator) {
      return enqueue(async () => {
        const next = mutator(this.getState());
        await vault.save(next);
        current = next;
        return next;
      });
    },

    replaceState(state) {
      return enqueue(async () => {
        await vault.save(state);
        current = state;
      });
    },
  };
}
