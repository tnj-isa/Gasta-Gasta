import { indexedDbStorage } from '../data/storage.js';
import { decryptJSON, encryptJSON } from '../lib/crypto.js';
import { el } from './dom.js';
import { instalacao } from './instalacao.js';

const sim = (valor) => (valor ? 'sim' : 'não');

async function descreverAparelho() {
  const dados = navigator.userAgentData;
  if (!dados) return [`Navegador: ${navigator.userAgent}`];
  const marcas = dados.brands.filter((b) => !/not.?a.?brand/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`);
  let extra = {};
  try { extra = await dados.getHighEntropyValues(['model', 'platformVersion']); } catch { /* sem detalhes */ }
  return [
    `Navegador: ${marcas.join(', ') || 'desconhecido'}`,
    `Aparelho: ${extra.model || 'não informado'}, Android ${extra.platformVersion || '?'}`,
  ];
}

async function descreverServiceWorker() {
  if (!('serviceWorker' in navigator)) return ['Service worker: o navegador não tem'];
  const registro = await navigator.serviceWorker.getRegistration();
  const estado = registro?.active ? 'ativo' : registro?.installing ? 'instalando' : registro?.waiting ? 'esperando' : 'não registrado';
  return [`Service worker: ${estado}`, `Service worker controla esta página: ${sim(navigator.serviceWorker.controller)}`];
}

async function descreverManifesto() {
  const link = document.querySelector('link[rel="manifest"]');
  if (!link) return ['Manifesto: a página não aponta para nenhum'];
  const linhas = [];
  try {
    const resposta = await fetch(link.href, { cache: 'no-store' });
    linhas.push(`Manifesto: HTTP ${resposta.status}, tipo ${resposta.headers.get('content-type')}`);
    const m = await resposta.json();
    linhas.push(`Manifesto diz: modo ${m.display}, início ${m.start_url}, escopo ${m.scope}, ${m.icons?.length ?? 0} ícones`);
    for (const icone of m.icons ?? []) {
      const r = await fetch(new URL(icone.src, link.href), { cache: 'no-store' });
      linhas.push(`Ícone ${icone.sizes}: HTTP ${r.status}, tipo ${r.headers.get('content-type')}`);
    }
  } catch (erro) {
    linhas.push(`Manifesto falhou: ${erro.message}`);
  }
  return linhas;
}

/** Tudo que ajuda a entender por que o Chrome instala (ou não) o app. */
async function coletarSituacao() {
  const tela = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return [
    ...(await descreverAparelho()),
    `Endereço: ${location.href}`,
    `Site seguro (https): ${sim(isSecureContext)}`,
    `Aberto como app, em tela cheia: ${sim(tela)}`,
    `O Chrome avisou que dá para instalar: ${sim(instalacao?.podeInstalar())}`,
    ...(await descreverServiceWorker()),
    ...(await descreverManifesto()),
  ];
}

/**
 * TEMPORÁRIO (Tarefa 6): confere no celular se o armazenamento e a criptografia funcionam,
 * quanto tempo a senha leva para destravar e por que o app instala ou não.
 * Será removido antes de entregar o app (o botão de instalar vai para as configurações).
 */
export function renderDiagnostico(container) {
  const instalar = el('button', {
    class: 'botao botao-destaque',
    type: 'button',
    hidden: true,
    onclick: async () => {
      await instalacao.instalar();
      instalar.hidden = !instalacao.podeInstalar();
    },
  }, 'Instalar o app');
  instalacao?.aoPoderInstalar(() => { instalar.hidden = !instalacao.podeInstalar(); });

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

  const relatorio = el('pre', { class: 'diagnostico-relatorio', role: 'status' }, '');
  const copiar = el('button', { class: 'botao', type: 'button', hidden: true }, 'Copiar relatório');
  const ver = async () => {
    relatorio.textContent = 'Verificando…';
    const texto = (await coletarSituacao()).join('\n');
    relatorio.textContent = texto;
    copiar.hidden = false;
    copiar.onclick = async () => {
      try { await navigator.clipboard.writeText(texto); copiar.textContent = 'Copiado'; } catch { copiar.textContent = 'Não consegui copiar'; }
    };
  };

  container.append(
    el('section', { class: 'diagnostico' },
      el('h2', {}, 'Teste do celular'),
      el('p', {}, 'Esta caixa é temporária: serve só para conferir se o app guarda os dados neste celular e se ele pode ser instalado.'),
      instalar,
      el('div', { class: 'diagnostico-acoes' },
        el('button', { class: 'botao', type: 'button', onclick: testar }, 'Testar agora'),
        el('button', { class: 'botao', type: 'button', onclick: ver }, 'Ver situação da instalação')),
      resultado,
      relatorio,
      copiar),
  );
}
