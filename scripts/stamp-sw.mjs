// Escreve em sw.js um número de versão calculado a partir do conteúdo dos arquivos do app.
// Sem isso, o celular não perceberia que o app mudou e ficaria com a versão antiga guardada.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const LINHA_DA_VERSAO = /const CACHE = 'gasta-[0-9a-f]{8}';/;

/** Caminhos (sem o "./") listados em ASSETS dentro do sw.js. */
export function listarAssets(textoDoSw) {
  const bloco = /const ASSETS = \[([\s\S]*?)\];/.exec(textoDoSw);
  if (!bloco) throw new Error('sw.js precisa ter "const ASSETS = [ ... ];"');
  return [...bloco[1].matchAll(/['"]\.\/([^'"]*)['"]/g)].map((m) => m[1]);
}

/** Oito letras/números que mudam quando qualquer arquivo guardado muda. */
export function calcularVersao(raiz = RAIZ) {
  const assets = listarAssets(readFileSync(join(raiz, 'sw.js'), 'utf8')).sort();
  const hash = createHash('sha256');
  for (const caminho of assets) {
    hash.update(`${caminho}\0`);
    if (caminho) hash.update(readFileSync(join(raiz, caminho)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 8);
}

export function carimbar(raiz = RAIZ) {
  const arquivo = join(raiz, 'sw.js');
  const texto = readFileSync(arquivo, 'utf8');
  if (!LINHA_DA_VERSAO.test(texto)) throw new Error("sw.js precisa ter a linha \"const CACHE = 'gasta-XXXXXXXX';\"");
  const novo = texto.replace(LINHA_DA_VERSAO, `const CACHE = 'gasta-${calcularVersao(raiz)}';`);
  if (novo !== texto) writeFileSync(arquivo, novo);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) carimbar();
