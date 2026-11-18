import { indexedDbStorage } from '../data/storage.js';
import { decryptJSON, encryptJSON } from '../lib/crypto.js';
import { el } from './dom.js';

/**
 * TEMPORÁRIO (Tarefa 6): confere no celular se o armazenamento e a criptografia funcionam,
 * e quanto tempo a senha leva para destravar. Será removido antes de entregar o app.
 */
export function renderDiagnostico(container) {
  const resultado = el('p', { class: 'diagnostico-resultado', role: 'status' }, 'Ainda não testado.');
  const testar = async () => {
    resultado.textContent = 'Testando…';
    try {
      const guarda = indexedDbStorage('diagnostico');
      await guarda.set('t', '1');
      const lido = await guarda.get('t');
      if (lido !== '1') throw new Error(`o celular devolveu ${JSON.stringify(lido)} em vez de "1"`);

      const inicio = performance.now();
      const bloco = await encryptJSON({ ok: true }, 'teste-de-senha');
      const volta = await decryptJSON(bloco, 'teste-de-senha');
      const ms = Math.round((performance.now() - inicio) / 2);
      if (!volta.ok) throw new Error('a criptografia não devolveu o que recebeu');

      resultado.textContent = `Funcionou. O celular guarda os dados e a senha leva cerca de ${ms} ms para destravar.`;
    } catch (erro) {
      resultado.textContent = `Não funcionou: ${erro.message}`;
    }
  };
  container.append(
    el('section', { class: 'diagnostico' },
      el('h2', {}, 'Teste do celular'),
      el('p', {}, 'Esta caixa é temporária: serve só para conferir se o app guarda os dados neste celular.'),
      el('button', { class: 'botao', type: 'button', onclick: testar }, 'Testar agora'),
      resultado),
  );
}
