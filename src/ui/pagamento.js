import { validarDataDoPagamento } from '../domain/bills.js';
import { el } from './dom.js';

/**
 * Troca o conteúdo de `caixa` por uma pergunta: "Em que dia você pagou?". Já vem com o dia de hoje escolhido,
 * e não deixa escolher um dia que ainda não chegou. Só chama `aoConfirmar` com uma data boa.
 * @param {HTMLElement} caixa onde a pergunta aparece (os botões que estavam ali saem)
 * @param {{hoje: string, contexto: string, aoCancelar: () => void, aoConfirmar: (data: string) => void}} opcoes
 *   `contexto` é o nome da conta, para quem usa leitor de tela.
 */
export function perguntarDataDoPagamento(caixa, { hoje, contexto, aoCancelar, aoConfirmar }) {
  const campo = el('input', { class: 'campo', type: 'date', value: hoje, max: hoje, 'aria-label': `Dia do pagamento: ${contexto}` });
  const erro = el('p', { class: 'erro', role: 'alert' });
  const botaoPagar = el('button', { class: 'botao botao-principal', type: 'submit' }, 'Pagar nesta data');
  const form = el('form', {
    class: 'corrigir', novalidate: true,
    onsubmit: (evento) => {
      evento.preventDefault();
      const problema = validarDataDoPagamento(campo.value, hoje);
      if (problema) {
        erro.textContent = problema;
        return;
      }
      botaoPagar.disabled = true;
      aoConfirmar(campo.value);
    },
  },
  el('p', { class: 'confirmar' }, 'Em que dia você pagou?'),
  campo, erro,
  el('div', { class: 'botoes-form' },
    el('button', { class: 'botao', type: 'button', onclick: aoCancelar }, 'Cancelar'),
    botaoPagar));
  caixa.replaceChildren(form);
  campo.focus();
}
