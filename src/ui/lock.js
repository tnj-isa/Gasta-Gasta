import { WrongPasswordError } from '../lib/crypto.js';
import { el } from './dom.js';

export const TAMANHO_MINIMO_SENHA = 8;

/**
 * Confere a senha nova digitada duas vezes. Devolve a mensagem de erro, ou null se está tudo certo.
 * @param {string} senha
 * @param {string} confirmacao
 * @returns {string | null}
 */
export function validarNovaSenha(senha, confirmacao) {
  if (Array.from(senha).length < TAMANHO_MINIMO_SENHA) {
    return `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  }
  if (senha.trim() === '') return 'A senha não pode ser só espaços.';
  if (senha !== confirmacao) return 'As senhas não são iguais.';
  return null;
}

/**
 * Confere a troca de senha: a atual preenchida e a nova valendo as mesmas regras de uma senha nova,
 * mas diferente da atual. Devolve a mensagem de erro, ou null se está tudo certo.
 * @param {string} atual
 * @param {string} nova
 * @param {string} confirmacao
 * @returns {string | null}
 */
export function validarTrocaDeSenha(atual, nova, confirmacao) {
  if (atual === '') return 'Digite a senha atual.';
  const problema = validarNovaSenha(nova, confirmacao);
  if (problema) return problema;
  if (nova === atual) return 'A senha nova precisa ser diferente da atual.';
  return null;
}

/**
 * Tela de senha: cria a senha no primeiro uso e destrava nas outras vezes.
 * Nada dos dados aparece antes de destravar; `aoDestravar` recebe o estado já aberto.
 * @param {HTMLElement} raiz
 * @param {{isInitialized(): Promise<boolean>, create(senha: string): Promise<unknown>, load(senha: string): Promise<unknown>}} store
 * @param {(estado: any) => void} aoDestravar
 */
export async function renderLock(raiz, store, aoDestravar) {
  let primeiroUso;
  try {
    primeiroUso = !(await store.isInitialized());
  } catch (erro) {
    raiz.append(el('p', { class: 'erro', role: 'alert' },
      `Não consegui acessar o armazenamento deste celular: ${erro.message}`));
    return;
  }

  const rotuloDoBotao = primeiroUso ? 'Criar senha' : 'Abrir';
  const erro = el('p', { class: 'erro', role: 'alert' });
  const botao = el('button', { class: 'botao botao-principal', type: 'submit' }, rotuloDoBotao);

  // Campo de nome escondido: faz o gerenciador de senhas do celular oferecer para guardar a senha.
  const nomeEscondido = el('input', {
    class: 'campo-escondido', type: 'text', name: 'username', autocomplete: 'username',
    value: 'Gasta&Gasta', tabindex: '-1', 'aria-hidden': 'true',
  });
  const campoSenha = el('input', {
    class: 'campo', id: 'senha', type: 'password', name: 'password',
    autocomplete: primeiroUso ? 'new-password' : 'current-password', autocapitalize: 'off', spellcheck: 'false',
  });
  const campoConfirmacao = el('input', {
    class: 'campo', id: 'confirmacao', type: 'password', name: 'confirmacao',
    autocomplete: 'new-password', autocapitalize: 'off', spellcheck: 'false',
  });
  const campos = primeiroUso ? [campoSenha, campoConfirmacao] : [campoSenha];

  const mostrar = el('input', {
    type: 'checkbox',
    onchange: (evento) => campos.forEach((c) => { c.type = evento.target.checked ? 'text' : 'password'; }),
  });

  let ocupado = false;
  const enviar = async (evento) => {
    evento.preventDefault();
    if (ocupado) return;
    erro.textContent = '';

    if (primeiroUso) {
      const problema = validarNovaSenha(campoSenha.value, campoConfirmacao.value);
      if (problema) { erro.textContent = problema; return; }
    } else if (campoSenha.value === '') {
      erro.textContent = 'Digite a senha.';
      return;
    }

    ocupado = true;
    botao.disabled = true;
    botao.textContent = primeiroUso ? 'Criando…' : 'Abrindo…';
    try {
      const estado = primeiroUso ? await store.create(campoSenha.value) : await store.load(campoSenha.value);
      campos.forEach((c) => { c.value = ''; });
      aoDestravar(estado);
    } catch (falha) {
      erro.textContent = falha instanceof WrongPasswordError
        ? 'Senha incorreta.'
        : `Não foi possível abrir os dados: ${falha.message}`;
      campoSenha.value = '';
      campoSenha.focus();
    } finally {
      ocupado = false;
      botao.disabled = false;
      botao.textContent = rotuloDoBotao;
    }
  };

  raiz.append(el('form', { class: 'lock', novalidate: true, onsubmit: enviar },
    el('h2', {}, primeiroUso ? 'Crie a sua senha' : 'Digite a sua senha'),
    primeiroUso && el('p', { class: 'aviso' },
      'Sem a senha, não há como recuperar os dados. Guarde-a no gerenciador de senhas do celular.'),
    nomeEscondido,
    el('label', { class: 'rotulo', for: 'senha' }, primeiroUso ? 'Senha (mínimo 8 caracteres)' : 'Senha'),
    campoSenha,
    primeiroUso && el('label', { class: 'rotulo', for: 'confirmacao' }, 'Repita a senha'),
    primeiroUso && campoConfirmacao,
    el('label', { class: 'mostrar' }, mostrar, 'Mostrar senha'),
    erro,
    botao));

  campoSenha.focus();
}
