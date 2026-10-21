// Small DOM helpers. Every value is set with textContent or attributes, never as HTML.

export const $ = (id) => document.getElementById(id);

/** el('li', { class: 'x', dataset: { id } }, 'text', child) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== undefined && c !== null && c !== false) node.append(c);
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export function setError(id, message) {
  $(id).textContent = message || '';
}

/** Activate on click, Enter or Space, for list items that act like buttons. */
export function onActivate(node, fn) {
  node.addEventListener('click', fn);
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  });
}

export function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
