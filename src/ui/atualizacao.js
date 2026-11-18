/**
 * Percebe quando o navegador baixou uma versão nova do app em segundo plano.
 * A primeira instalação não conta: só quando já havia uma versão guardada e ela foi trocada.
 * @param {(EventTarget & {controller?: unknown}) | null} servico normalmente `navigator.serviceWorker`
 */
export function criarAtualizacao(servico) {
  const tinhaVersao = Boolean(servico?.controller);
  let pronta = false;
  const ouvintes = new Set();

  servico?.addEventListener('controllerchange', () => {
    if (!tinhaVersao || pronta) return;
    pronta = true;
    ouvintes.forEach((avisar) => avisar());
  });

  return {
    pronta: () => pronta,

    /** Chama `avisar` quando houver versão nova (na hora, se já houver). */
    aoFicarPronta(avisar) {
      ouvintes.add(avisar);
      if (pronta) avisar();
    },
  };
}

// Criada logo que o app abre, antes de registrar o service worker.
export const atualizacao = criarAtualizacao(
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null,
);
