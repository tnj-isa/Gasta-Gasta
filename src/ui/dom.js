/**
 * Cria um elemento. `class` define a classe, `onclick` etc. ligam eventos, `false`/`null` são ignorados.
 * Texto entra sempre como texto (nunca como HTML), então nada digitado pode virar código.
 * @param {string} tag
 * @param {Record<string, unknown>} [props]
 * @param {...(Node|string|number|false|null|undefined|Array<unknown>)} children
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [nome, valor] of Object.entries(props)) {
    if (valor === false || valor == null) continue;
    if (nome === 'class') node.className = String(valor);
    else if (nome.startsWith('on') && typeof valor === 'function') node.addEventListener(nome.slice(2), valor);
    else node.setAttribute(nome, valor === true ? '' : String(valor));
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}
