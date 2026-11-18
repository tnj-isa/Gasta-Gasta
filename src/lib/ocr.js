/** Maior lado (em pixels) da foto que vai para a leitura: foto de celular é grande demais e só deixa lento. */
export const LADO_MAXIMO = 2000;

// Em que parte da barra de progresso cada etapa da leitura aparece (de 0 a 1).
const FAIXAS = {
  'loading tesseract core': [0, 0.1],
  'initializing tesseract': [0.1, 0.15],
  'loading language traineddata': [0.15, 0.25],
  'initializing api': [0.25, 0.3],
  'recognizing text': [0.3, 1],
};

/**
 * Transforma uma mensagem do Tesseract em um número de 0 a 1 para a barra de progresso,
 * ou null se a mensagem não é de progresso.
 * @param {{status?: string, progress?: number} | null} mensagem
 * @returns {number | null}
 */
export function fracaoDoProgresso(mensagem) {
  const faixa = FAIXAS[mensagem?.status];
  if (!faixa) return null;
  const p = Number.isFinite(mensagem.progress) ? Math.min(1, Math.max(0, mensagem.progress)) : 0;
  return Math.round((faixa[0] + (faixa[1] - faixa[0]) * p) * 1e6) / 1e6;
}

/** Tamanho da foto depois de reduzida para o lado maior caber em `maximo` (nunca amplia). */
export function tamanhoReduzido(largura, altura, maximo = LADO_MAXIMO) {
  const escala = Math.min(1, maximo / Math.max(largura, altura));
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

/** Reduz a foto (já na posição certa, como aparece na tela). Sem suporte do navegador, devolve a original. */
async function prepararFoto(imagem) {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return imagem;
  const bitmap = await createImageBitmap(imagem);
  try {
    const { largura, altura } = tamanhoReduzido(bitmap.width, bitmap.height);
    if (largura === bitmap.width && altura === bitmap.height) return imagem;
    const tela = new OffscreenCanvas(largura, altura);
    const desenho = tela.getContext('2d');
    desenho.fillStyle = '#FFFFFF';
    desenho.fillRect(0, 0, largura, altura);
    desenho.drawImage(bitmap, 0, 0, largura, altura);
    return await tela.convertToBlob({ type: 'image/png' });
  } finally {
    bitmap.close();
  }
}

const PASTA = new URL('../../vendor/tesseract/', import.meta.url);

/**
 * Lê o texto de uma foto de nota, em português, tudo dentro do celular (sem internet).
 * Os arquivos do leitor ficam em `vendor/tesseract/` e entram no cache do app.
 * @param {Blob} image
 * @param {(fracao: number) => void} [onProgress] recebe um número de 0 a 1, sempre crescente
 * @returns {Promise<string>}
 */
export async function readReceiptText(image, onProgress = () => {}) {
  let maior = 0;
  const avisar = (mensagem) => {
    const fracao = fracaoDoProgresso(mensagem);
    if (fracao !== null && fracao > maior) {
      maior = fracao;
      onProgress(fracao);
    }
  };

  const foto = await prepararFoto(image);
  const { default: Tesseract } = await import('../../vendor/tesseract/tesseract.esm.min.js');
  const worker = await Tesseract.createWorker('por', Tesseract.OEM.LSTM_ONLY, {
    workerPath: new URL('worker.min.js', PASTA).href,
    corePath: new URL('core', PASTA).href,
    langPath: new URL('lang', PASTA).href,
    workerBlobURL: false, // o arquivo do leitor já está guardado no cache do app
    cacheMethod: 'none', // o idioma já está guardado no cache do app; não duplicar
    gzip: true,
    logger: avisar,
  });
  try {
    const { data } = await worker.recognize(foto);
    onProgress(1);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
