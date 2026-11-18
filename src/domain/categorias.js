export const MAX_CATEGORY_NAME = 24;

/** Minúsculas, sem acento e com espaços simples: serve para comparar nomes. */
function normalizar(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Cria o id de uma categoria nova a partir do nome ("Açaí & Cia" vira "acai-cia"),
 * com um número no fim se já existir.
 * @param {string} name
 * @param {string[]} existingIds
 */
export function categoryIdFromName(name, existingIds) {
  const base = normalizar(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'categoria';
  if (!existingIds.includes(base)) return base;
  let n = 2;
  while (existingIds.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * Confere o nome digitado para uma categoria. Devolve a mensagem de erro, ou null se está certo.
 * @param {string} name
 * @param {{id: string, name: string}[]} categories
 * @param {string} [ignoreId] categoria que está sendo renomeada (não conta como repetida)
 * @returns {string | null}
 */
export function validateCategoryName(name, categories, ignoreId) {
  const limpo = name.trim();
  if (limpo === '') return 'Dê um nome à categoria.';
  if (Array.from(limpo).length > MAX_CATEGORY_NAME) return `O nome pode ter até ${MAX_CATEGORY_NAME} caracteres.`;
  const igual = categories.some((c) => c.id !== ignoreId && normalizar(c.name) === normalizar(limpo));
  return igual ? 'Já existe uma categoria com esse nome.' : null;
}
