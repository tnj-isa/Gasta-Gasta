/**
 * Compartilhar a cópia de segurança pelo menu do celular (WhatsApp, Google Drive, e-mail…).
 * O Chrome só deixa compartilhar alguns tipos de arquivo: texto puro (.txt) vale, .json é recusado.
 * Por isso a cópia (um texto criptografado) é sempre um .txt de texto puro, também ao salvar no celular.
 */

export const TIPO_DA_COPIA = 'text/plain';

/** @param {string} hoje "AAAA-MM-DD" */
export const nomeDaCopia = (hoje) => `controle-${hoje}.txt`;

/**
 * @param {string} hoje "AAAA-MM-DD"
 * @param {string} texto a cópia já criptografada
 */
export function arquivoDaCopia(hoje, texto) {
  return new File([texto], nomeDaCopia(hoje), { type: TIPO_DA_COPIA });
}

/**
 * O navegador sabe compartilhar este arquivo? (Computador e alguns navegadores não sabem.)
 * @param {File} arquivo
 * @param {{share?: Function, canShare?: Function} | undefined} [nav]
 */
export function podeCompartilhar(arquivo, nav = globalThis.navigator) {
  if (typeof nav?.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [arquivo] }) === true;
  } catch {
    return false;
  }
}

/**
 * Abre o menu de compartilhar. Precisa ser chamado direto de um toque da pessoa.
 * @param {File} arquivo
 * @param {{share: Function}} [nav]
 * @returns {Promise<'compartilhado' | 'cancelado'>} "cancelado" se a pessoa fechou o menu sem escolher nada
 */
export async function compartilhar(arquivo, nav = globalThis.navigator) {
  try {
    await nav.share({ files: [arquivo], title: 'Cópia de segurança do Gasta&Gasta' });
    return 'compartilhado';
  } catch (falha) {
    if (falha?.name === 'AbortError') return 'cancelado';
    throw falha;
  }
}
