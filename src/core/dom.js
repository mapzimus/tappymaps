// DOM construction helpers that are escaped by construction.
//
// The legacy app built most of its UI by concatenating strings into innerHTML,
// interpolating map titles, legend labels, CSV headers, class codes, and — in
// the public gallery — titles written by other users. Every one of those is a
// place where a `<img onerror>` becomes script execution, and the only defence
// was remembering to call escapeHTML() at each site.
//
// `el()` takes text as text. There is no interpolation step to forget.

/**
 * Build an element.
 *
 * @param {string} tag                   e.g. 'div', 'button', 'svg:path'
 * @param {object} [props]               attributes; `class`, `text`, `html`,
 *                                       `dataset`, `style` (object), and
 *                                       `on*` handlers are special-cased
 * @param {Array|Node|string} [children]
 */
export function el(tag, props = {}, children = []) {
  const isSvg = tag.startsWith('svg:');
  const name = isSvg ? tag.slice(4) : tag;
  const node = isSvg
    ? document.createElementNS('http://www.w3.org/2000/svg', name)
    : document.createElement(name);

  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'text') { node.textContent = String(value); continue; }
    if (key === 'html') {
      // Deliberate escape hatch for trusted, developer-authored markup only.
      // Never pass user or remote content here — use `text`.
      node.innerHTML = value;
      continue;
    }
    if (key === 'class' || key === 'className') {
      const cls = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
      if (isSvg) node.setAttribute('class', cls); else node.className = cls;
      continue;
    }
    if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
      continue;
    }
    if (key === 'dataset' && typeof value === 'object') {
      for (const [d, v] of Object.entries(value)) {
        if (v !== null && v !== undefined) node.dataset[d] = String(v);
      }
      continue;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
      continue;
    }
    node.setAttribute(key, value === true ? '' : String(value));
  }

  append(node, children);
  return node;
}

/** Append children of any shape; strings become text nodes, never markup. */
export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) { append(parent, child); continue; }
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

/** Replace all children in one pass. */
export function replace(parent, children) {
  if (!parent) return parent;
  parent.replaceChildren();
  return append(parent, children);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const byId = (id) => document.getElementById(id);

/**
 * Escape text for the rare case where a string genuinely must be built —
 * server-rendered SVG, for instance, where there is no DOM to build into.
 * Prefer `el()` anywhere a DOM exists.
 */
export function escapeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Toggle a class and return the element, for chaining. */
export function classed(node, name, on) {
  if (node) node.classList.toggle(name, !!on);
  return node;
}
