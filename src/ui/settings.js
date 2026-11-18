import { BackupError, exportBackup, importBackup } from '../data/backup.js';
import { categoryIdFromName, validateCategoryName } from '../domain/categorias.js';
import { removeCategory, setSettings, upsertCategory } from '../domain/model.js';
import { WrongPasswordError } from '../lib/crypto.js';
import { shortDate, todayISO } from '../lib/dates.js';
import { botaoDeIcone, el } from './dom.js';
import { instalacao } from './instalacao.js';
import { validarNovaSenha } from './lock.js';
import { corDaCategoria } from './mosaico.js';
import { grupo } from './opcoes.js';

const ICONE_VOLTAR = 'M15 5l-7 7 7 7';

const TEMPOS_DE_BLOQUEIO = [
  { valor: '60000', rotulo: '1 minuto' },
  { valor: '180000', rotulo: '3 minutos' },
  { valor: '300000', rotulo: '5 minutos' },
  { valor: '600000', rotulo: '10 minutos' },
];

/** Baixa um texto como arquivo (no celular, vai para a pasta Downloads). */
function baixarArquivo(nome, texto) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const link = el('a', { href: url, download: nome });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Campo de senha com o "Mostrar senha" que vale para todos os campos do formulário. */
function camposDeSenha(rotulos) {
  const campos = rotulos.map(({ id, texto }) => ({
    rotulo: el('label', { class: 'rotulo', for: id }, texto),
    campo: el('input', { class: 'campo', id, type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }),
  }));
  const mostrar = el('input', {
    type: 'checkbox',
    onchange: (e) => campos.forEach(({ campo }) => { campo.type = e.target.checked ? 'text' : 'password'; }),
  });
  return {
    campos: campos.map((c) => c.campo),
    elementos: [...campos.flatMap((c) => [c.rotulo, c.campo]), el('label', { class: 'mostrar' }, mostrar, 'Mostrar senha')],
  };
}

function resumoDosDados(estado) {
  const partes = [
    [estado.transactions.length, 'lançamento', 'lançamentos'],
    [estado.bills.length, 'fatura', 'faturas'],
    [estado.cards.length, 'cartão', 'cartões'],
    [estado.recurring.length, 'conta fixa', 'contas fixas'],
  ];
  return partes.map(([n, um, varios]) => `${n} ${n === 1 ? um : varios}`).join(', ');
}

/** Salvar a cópia: pede uma senha (duas vezes, para não errar), gera o arquivo e baixa. */
function secaoCopia(store) {
  const caixa = el('section', { class: 'config' });
  const formularios = el('div', { class: 'config-formularios' });
  const status = el('p', { class: 'config-status', role: 'status' });
  const resultado = el('p', { class: 'config-status', role: 'status' });

  const atualizarStatus = () => {
    const ultima = store.getState().settings.lastBackup;
    status.textContent = ultima
      ? `Última cópia: ${shortDate(ultima)}${ultima.slice(0, 4) === todayISO().slice(0, 4) ? '' : ` de ${ultima.slice(0, 4)}`}.`
      : 'Você ainda não salvou nenhuma cópia.';
  };
  const fechar = () => formularios.replaceChildren();

  const formularioSalvar = () => {
    const erro = el('p', { class: 'erro', role: 'alert' });
    const { campos: [senha, confirmacao], elementos } = camposDeSenha([
      { id: 'copia-senha', texto: 'Senha da cópia (mínimo 8 caracteres)' },
      { id: 'copia-senha2', texto: 'Repita a senha' },
    ]);
    let ocupado = false;
    const botao = el('button', { class: 'botao botao-principal', type: 'submit' }, 'Salvar cópia');
    const enviar = async (evento) => {
      evento.preventDefault();
      if (ocupado) return;
      erro.textContent = '';
      const problema = validarNovaSenha(senha.value, confirmacao.value);
      if (problema) { erro.textContent = problema; return; }
      ocupado = true;
      botao.disabled = true;
      botao.textContent = 'Criptografando…';
      try {
        const hoje = todayISO();
        const texto = await exportBackup(store.getState(), senha.value);
        const nome = `controle-${hoje}.json`;
        baixarArquivo(nome, texto);
        await store.commit((s) => setSettings(s, { lastBackup: hoje }));
        fechar();
        atualizarStatus();
        resultado.textContent = `Cópia salva no arquivo ${nome} (pasta Downloads). Guarde esse arquivo também fora do celular, como no e-mail ou no Google Drive. Só abre com a senha que você acabou de escolher.`;
      } catch (falha) {
        erro.textContent = `Não consegui salvar a cópia: ${falha.message}`;
        ocupado = false;
        botao.disabled = false;
        botao.textContent = 'Salvar cópia';
      }
    };
    formularios.replaceChildren(el('form', { class: 'config-form', novalidate: true, onsubmit: enviar },
      el('p', { class: 'aviso' }, 'A cópia é um arquivo protegido por uma senha. Pode ser a mesma do app ou outra. Sem essa senha, ninguém abre o arquivo, nem você.'),
      ...elementos, erro,
      el('div', { class: 'barra-botoes' }, el('button', { class: 'botao', type: 'button', onclick: fechar }, 'Cancelar'), botao)));
    senha.focus();
  };

  /** Restaurar: escolhe o arquivo, abre com a senha da cópia, mostra o que tem e só troca depois do "sim". */
  const formularioRestaurar = () => {
    const erro = el('p', { class: 'erro', role: 'alert' });
    const arquivo = el('input', { class: 'campo', id: 'copia-arquivo', type: 'file', accept: '.json,application/json' });
    const { campos: [senha], elementos } = camposDeSenha([{ id: 'copia-senha-abrir', texto: 'Senha da cópia' }]);
    let ocupado = false;
    const botao = el('button', { class: 'botao botao-principal', type: 'submit' }, 'Abrir cópia');

    const confirmar = (estadoDaCopia) => {
      const sim = el('button', { class: 'botao botao-perigo', type: 'button' }, 'Substituir meus dados');
      const erroSubstituir = el('p', { class: 'erro', role: 'alert' });
      sim.addEventListener('click', async () => {
        sim.disabled = true;
        try {
          await store.replaceState(estadoDaCopia);
          aoRestaurar();
        } catch (falha) {
          sim.disabled = false;
          erroSubstituir.textContent = `Não consegui restaurar: ${falha.message}. Seus dados atuais continuam como estavam.`;
        }
      });
      formularios.replaceChildren(el('div', { class: 'config-form' },
        el('p', { class: 'aviso' },
          `A cópia tem ${resumoDosDados(estadoDaCopia)}. Este aparelho tem ${resumoDosDados(store.getState())}.`),
        el('p', { class: 'aviso' }, 'Isto substitui os dados deste aparelho. Não dá para desfazer.'),
        erroSubstituir,
        el('div', { class: 'barra-botoes' }, el('button', { class: 'botao', type: 'button', onclick: fechar }, 'Cancelar'), sim)));
    };

    const enviar = async (evento) => {
      evento.preventDefault();
      if (ocupado) return;
      erro.textContent = '';
      const escolhido = arquivo.files?.[0];
      if (!escolhido) { erro.textContent = 'Escolha o arquivo da cópia.'; return; }
      if (senha.value === '') { erro.textContent = 'Digite a senha da cópia.'; return; }
      ocupado = true;
      botao.disabled = true;
      botao.textContent = 'Abrindo…';
      try {
        const texto = await escolhido.text();
        confirmar(await importBackup(texto, senha.value));
      } catch (falha) {
        if (falha instanceof WrongPasswordError) erro.textContent = 'Senha da cópia incorreta. Nada foi alterado.';
        else if (falha instanceof BackupError) erro.textContent = `${falha.message} Nada foi alterado.`;
        else erro.textContent = `Não consegui ler o arquivo: ${falha.message}. Nada foi alterado.`;
        senha.value = '';
        ocupado = false;
        botao.disabled = false;
        botao.textContent = 'Abrir cópia';
      }
    };
    formularios.replaceChildren(el('form', { class: 'config-form', novalidate: true, onsubmit: enviar },
      el('label', { class: 'rotulo', for: 'copia-arquivo' }, 'Arquivo da cópia'), arquivo,
      ...elementos, erro,
      el('div', { class: 'barra-botoes' }, el('button', { class: 'botao', type: 'button', onclick: fechar }, 'Cancelar'), botao)));
  };

  let aoRestaurar = () => {};
  atualizarStatus();
  caixa.append(
    el('h2', {}, 'Cópia de segurança'),
    el('p', {}, 'Se você perder ou trocar de celular, só a cópia traz seus dados de volta.'),
    status, resultado,
    el('div', { class: 'config-botoes' },
      el('button', { class: 'botao botao-principal', type: 'button', onclick: formularioSalvar }, 'Salvar cópia de segurança'),
      el('button', { class: 'botao', type: 'button', onclick: formularioRestaurar }, 'Restaurar cópia')),
    formularios);
  return { elemento: caixa, definirAoRestaurar: (fn) => { aoRestaurar = fn; } };
}

/** Categorias: renomear, acrescentar e remover. "Outros" não pode ser removida. */
function secaoCategorias(store) {
  const caixa = el('section', { class: 'config' });
  const lista = el('ul', { class: 'categorias' });
  const erroGeral = el('p', { class: 'erro', role: 'alert' });

  const desenhar = () => {
    const estado = store.getState();
    lista.replaceChildren(...estado.categories.map((c) => linha(c, estado)));
  };

  const salvar = async (mudanca) => {
    erroGeral.textContent = '';
    try {
      await store.commit(mudanca);
    } catch (falha) {
      erroGeral.textContent = `Não consegui salvar: ${falha.message}`;
    }
    desenhar();
  };

  function linha(categoria, estado) {
    const cor = corDaCategoria(categoria.id, estado.categories);
    const ponto = el('span', { class: 'ponto', 'aria-hidden': 'true' });
    ponto.style.background = cor.fundo;
    const item = el('li', { class: 'categoria' });
    const mostrar = () => {
      const usos = [...estado.transactions, ...estado.bills, ...estado.recurring].filter((x) => x.categoryId === categoria.id).length;
      const acoes = el('div', { class: 'categoria-acoes' },
        el('button', { class: 'botao', type: 'button', onclick: renomear }, 'Renomear'));
      if (categoria.id !== 'outros') {
        acoes.append(el('button', { class: 'botao', type: 'button', onclick: () => pedirRemocao(usos) }, 'Remover'));
      }
      item.replaceChildren(el('div', { class: 'categoria-linha' }, ponto, el('span', { class: 'categoria-nome' }, categoria.name)), acoes);
    };
    const renomear = () => {
      const erro = el('p', { class: 'erro', role: 'alert' });
      const campo = el('input', { class: 'campo', type: 'text', value: categoria.name, autocomplete: 'off', 'aria-label': `Novo nome para ${categoria.name}` });
      const enviar = (evento) => {
        evento.preventDefault();
        const problema = validateCategoryName(campo.value, estado.categories, categoria.id);
        if (problema) { erro.textContent = problema; return; }
        salvar((s) => upsertCategory(s, { ...categoria, name: campo.value.trim() }));
      };
      item.replaceChildren(el('form', { class: 'config-form', novalidate: true, onsubmit: enviar },
        campo, erro,
        el('div', { class: 'barra-botoes' },
          el('button', { class: 'botao', type: 'button', onclick: mostrar }, 'Cancelar'),
          el('button', { class: 'botao botao-principal', type: 'submit' }, 'Salvar nome'))));
      campo.focus();
      campo.select();
    };
    const pedirRemocao = (usos) => {
      item.replaceChildren(el('div', { class: 'config-form' },
        el('p', { class: 'aviso' }, usos > 0
          ? `Remover "${categoria.name}"? Os ${usos} registros dela passam para "Outros".`
          : `Remover "${categoria.name}"?`),
        el('div', { class: 'barra-botoes' },
          el('button', { class: 'botao', type: 'button', onclick: mostrar }, 'Cancelar'),
          el('button', { class: 'botao botao-perigo', type: 'button', onclick: () => salvar((s) => removeCategory(s, categoria.id)) }, 'Remover'))));
    };
    mostrar();
    return item;
  }

  const erroNova = el('p', { class: 'erro', role: 'alert' });
  const campoNova = el('input', { class: 'campo', id: 'categoria-nova', type: 'text', autocomplete: 'off' });
  const adicionar = async (evento) => {
    evento.preventDefault();
    const estado = store.getState();
    const problema = validateCategoryName(campoNova.value, estado.categories);
    erroNova.textContent = problema ?? '';
    if (problema) return;
    const nome = campoNova.value.trim();
    const id = categoryIdFromName(nome, estado.categories.map((c) => c.id));
    campoNova.value = '';
    await salvar((s) => upsertCategory(s, { id, name: nome }));
  };

  desenhar();
  caixa.append(
    el('h2', {}, 'Categorias'),
    el('p', {}, 'Mude os nomes, crie as suas ou remova as que não usa.'),
    lista, erroGeral,
    el('form', { class: 'config-form', novalidate: true, onsubmit: adicionar },
      el('label', { class: 'rotulo', for: 'categoria-nova' }, 'Nova categoria'),
      campoNova, erroNova,
      el('button', { class: 'botao', type: 'submit' }, 'Adicionar categoria')));
  return caixa;
}

/** Quanto tempo parado até o app trancar sozinho. */
function secaoBloqueio(store, rearmar) {
  const atual = String(store.getState().settings.autoLockMs);
  const aviso = el('p', { class: 'config-status', role: 'status' });
  const opcoes = grupo({
    nome: 'Tempo até travar sozinho',
    inicial: TEMPOS_DE_BLOQUEIO.some((t) => t.valor === atual) ? atual : null,
    opcoes: TEMPOS_DE_BLOQUEIO,
    aoMudar: async (valor) => {
      try {
        await store.commit((s) => setSettings(s, { autoLockMs: Number(valor) }));
        rearmar();
        aviso.textContent = 'Salvo.';
      } catch (falha) {
        aviso.textContent = `Não consegui salvar: ${falha.message}`;
      }
    },
  });
  return el('section', { class: 'config' },
    el('h2', {}, 'Travar sozinho'),
    el('p', {}, 'Depois de quanto tempo sem tocar o app pede a senha de novo.'),
    opcoes.elemento, aviso);
}

/** Instalação e proteção do armazenamento neste aparelho. */
function secaoAparelho() {
  const estaInstalado = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  const instalar = el('button', { class: 'botao botao-principal', type: 'button', hidden: true }, 'Instalar o app');
  const textoInstalacao = el('p', {}, estaInstalado
    ? 'O app já está instalado neste celular.'
    : 'Para instalar: no menu ⋮ do Chrome, escolha "Instalar app".');
  instalar.addEventListener('click', async () => {
    await instalacao?.instalar();
    instalar.hidden = !instalacao?.podeInstalar();
  });
  instalacao?.aoPoderInstalar(() => { if (!estaInstalado) instalar.hidden = false; });

  const protecao = el('p', { class: 'config-status', role: 'status' }, 'Conferindo a proteção dos dados…');
  navigator.storage?.persisted?.().then((sim) => {
    protecao.textContent = sim
      ? 'Os dados estão protegidos contra limpeza automática do celular.'
      : 'O celular pode apagar os dados se faltar espaço. Por isso, faça cópias de segurança.';
  }).catch(() => { protecao.textContent = ''; });

  return el('section', { class: 'config' },
    el('h2', {}, 'Neste aparelho'), textoInstalacao, instalar, protecao);
}

/**
 * Tela de configurações: cópia de segurança, categorias, tempo para travar e dados do aparelho.
 * @param {HTMLElement} raiz
 * @param {ReturnType<typeof import('../data/store.js').createStore>} store
 * @param {{faixa: HTMLElement, go: (tela: string, params?: object) => void, rearmar: () => void, params?: {aviso?: string}}} contexto
 */
export function renderSettings(raiz, store, { faixa, go, rearmar, params = {} }) {
  faixa.replaceChildren(el('div', { class: 'topo' },
    botaoDeIcone('Voltar', ICONE_VOLTAR, () => go('home')),
    el('h1', {}, 'Configurações')));

  const copia = secaoCopia(store);
  copia.definirAoRestaurar(() => {
    rearmar();
    go('settings', { aviso: 'Pronto: os dados da cópia foram restaurados neste aparelho.' });
  });
  if (params.aviso) raiz.append(el('p', { class: 'aviso', role: 'status' }, params.aviso));
  raiz.append(copia.elemento, secaoCategorias(store), secaoBloqueio(store, rearmar), secaoAparelho());
}
