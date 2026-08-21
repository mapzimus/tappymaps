// The single US map renderer.
//
// Every surface uses this: the Create editor, the Arcade, both GeoDraft
// boards, the Hub's decorative map, the embed view, and — via the same
// geometry module — the server-side OG renderer. The legacy app had a separate
// builder per surface, so "the map" meant something slightly different
// depending on where you looked.
//
// Rendering is deliberately dumb: hand it feature data and a fill lookup, get
// back an <svg>. It owns no state, reads no globals, and fires a callback on
// tap rather than reaching for a specific handler.

import { el, replace } from '../core/dom.js';
import { geometryToPath, geometryBounds, VIEWBOX_STRING } from './geometry.js';
import { FIPS_TO_STATE, NON_COLORABLE } from '../data/states.js';

/**
 * @typedef {object} MapFeature
 * @property {string} name
 * @property {string} fips
 * @property {string} path      SVG path data
 * @property {object|null} bounds
 * @property {boolean} colorable
 */

/**
 * Turn a decoded TopoJSON feature collection into render-ready features.
 * Doing this once and caching it is what makes a second surface cheap.
 *
 * @param {{features: Array}} collection  output of topojson.feature(...)
 * @returns {MapFeature[]}
 */
export function buildFeatures(collection) {
  if (!collection || !Array.isArray(collection.features)) return [];
  return collection.features
    .map((f) => {
      const fips = String(f.id ?? '').padStart(2, '0');
      const name = FIPS_TO_STATE[fips];
      if (!name) return null; // territories the atlas carries but we don't draw
      return {
        name,
        fips,
        path: geometryToPath(f.geometry),
        bounds: geometryBounds(f.geometry),
        colorable: !NON_COLORABLE.has(name),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Render (or re-render) a map into a host element.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.host
 * @param {MapFeature[]} opts.features
 * @param {(feature: MapFeature) => string|null} [opts.fill]   per-state fill
 * @param {(feature: MapFeature) => string|null} [opts.className]
 * @param {(name: string, event: Event) => void} [opts.onTap]
 * @param {string} [opts.groupId]
 * @param {string} [opts.emptyFill]
 * @param {boolean} [opts.interactive=true]
 * @param {string} [opts.label]  accessible name for the svg
 * @returns {SVGSVGElement}
 */
export function renderMap({
  host,
  features,
  fill,
  className,
  onTap,
  groupId = 'statesGroup',
  emptyFill = 'var(--map-empty, #2a3441)',
  interactive = true,
  label = 'Map of the United States',
}) {
  const paths = features.map((f) => {
    const explicit = fill ? fill(f) : null;
    const node = el('svg:path', {
      d: f.path,
      class: ['state', className ? className(f) : null, f.colorable ? null : 'state--noncolorable'],
      fill: explicit || emptyFill,
      'data-state': f.name,
      'data-fips': f.fips,
      // The legacy map was unreachable by keyboard: the core interaction of
      // this product could not be performed without a pointer. Interactive
      // states are real buttons in the accessibility tree.
      ...(interactive && f.colorable
        ? { role: 'button', tabindex: '0', 'aria-label': f.name }
        : { 'aria-hidden': 'true' }),
    });

    if (interactive && onTap && f.colorable) {
      node.addEventListener('click', (e) => onTap(f.name, e));
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap(f.name, e);
        }
      });
    }
    return node;
  });

  const svg = el(
    'svg:svg',
    {
      viewBox: VIEWBOX_STRING,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'map-svg',
      role: 'group',
      'aria-label': label,
    },
    [el('svg:g', { id: groupId, class: 'states-group' }, paths)]
  );

  if (host) replace(host, svg);
  return svg;
}

/**
 * Update fills in place. Re-rendering 51 paths on every tap is wasteful and
 * loses focus — which, now that states are keyboard-reachable, would make the
 * map unusable with a keyboard.
 */
export function paintMap(svgOrHost, fillFor, emptyFill = 'var(--map-empty, #2a3441)') {
  if (!svgOrHost) return;
  const paths = svgOrHost.querySelectorAll('path[data-state]');
  for (const p of paths) {
    const name = p.getAttribute('data-state');
    const next = fillFor(name) || emptyFill;
    // Touching the DOM only when it changes keeps large fills (quick-fill,
    // data maps) from thrashing style recalculation.
    if (p.getAttribute('fill') !== next) p.setAttribute('fill', next);
  }
}

/** The path element for a state, within a given root. */
export function statePath(root, name) {
  return root ? root.querySelector(`path[data-state="${CSS.escape(name)}"]`) : null;
}
