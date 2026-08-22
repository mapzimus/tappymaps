// Encode / decode the map state that rides in the URL fragment.
//
// This is the app's most exposed input. The same encoded blob reaches
// loadStateFromURL, the embed view, gallery thumbnails, the /s/ share route
// and the server-side OG renderer — and every one of those can be handed a
// string a stranger wrote. The legacy decoder was `JSON.parse(atob(hash))`
// straight into app state, which meant:
//
//   • a `__proto__` key could pollute Object.prototype for the whole page,
//   • wrong-typed values silently corrupted state instead of being rejected,
//   • malformed base64 threw where nothing caught it.
//
// Decoding here is total: any input produces either a valid, fully-typed
// state or null. Nothing in between reaches the app.

const MAX_ENCODED_BYTES = 64 * 1024;   // a full 50-state map with a legend is ~2KB
const MAX_LEGEND_ENTRIES = 12;
const MAX_TEXT = 200;
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

/** Keys that must never be copied out of parsed JSON onto an object. */
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

function cleanText(value, max = MAX_TEXT) {
  if (typeof value !== 'string') return '';
  // Strip control characters; they have no legitimate place in a title and
  // make downstream SVG and PNG metadata unpredictable.
  return value.replace(/[\x00-\x1F\x7F]/g, '').slice(0, max);
}

function cleanColor(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return HEX_COLOR.test(v) ? v : null;
}

/** Plain object with only own, safe, string keys. */
function safeColorMap(input, validNames) {
  const out = Object.create(null);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const key of Object.keys(input)) {
    if (FORBIDDEN.has(key)) continue;
    if (validNames && !validNames.has(key)) continue;
    const color = cleanColor(input[key]);
    if (color) out[key] = color;
  }
  // Hand back a normal object so consumers can spread/JSON it as usual.
  return Object.assign({}, out);
}

function safeLegend(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, MAX_LEGEND_ENTRIES)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const color = cleanColor(entry.color);
      if (!color) return null;
      return { color, label: cleanText(entry.label, 80) };
    })
    .filter(Boolean);
}

/**
 * @typedef {object} ShareState
 * @property {Record<string,string>} stateColors
 * @property {Record<string,string>} countyColors
 * @property {Array<{color:string,label:string}>} legendEntries
 * @property {string} title
 * @property {string} subtitle
 * @property {string} source
 * @property {string} legendTitle
 * @property {string} legendPosition
 */

export const EMPTY_STATE = Object.freeze({
  stateColors: {},
  countyColors: {},
  legendEntries: [],
  title: '',
  subtitle: '',
  source: '',
  legendTitle: '',
  legendPosition: 'bottom-left',
});

const LEGEND_POSITIONS = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

/** base64 that survives a URL fragment without escaping surprises. */
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64) {
  // Tolerate the URL-safe variant and missing padding: share links get
  // rewritten by chat apps, mail clients and Reddit, and losing a map to a
  // stripped '=' is a terrible experience.
  let s = String(b64).trim().replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Serialize app state to a fragment-safe string.
 * Empty values are omitted so a simple map produces a short link.
 */
export function encodeState(state) {
  const payload = {};
  if (state.stateColors && Object.keys(state.stateColors).length) payload.c = state.stateColors;
  if (state.countyColors && Object.keys(state.countyColors).length) payload.cc = state.countyColors;
  if (state.legendEntries && state.legendEntries.length) payload.l = state.legendEntries;
  if (state.title) payload.t = state.title;
  if (state.subtitle) payload.s = state.subtitle;
  if (state.source) payload.src = state.source;
  if (state.legendTitle) payload.lt = state.legendTitle;
  if (state.legendPosition && state.legendPosition !== EMPTY_STATE.legendPosition) {
    payload.lp = state.legendPosition;
  }
  return toBase64(JSON.stringify(payload));
}

/**
 * Decode an untrusted fragment. Never throws.
 *
 * @param {string} encoded
 * @param {object} [opts]
 * @param {Set<string>} [opts.validStateNames]  reject unknown state keys
 * @returns {ShareState|null} null when the input is not a decodable map
 */
export function decodeState(encoded, { validStateNames } = {}) {
  if (typeof encoded !== 'string' || !encoded) return null;
  if (encoded.length > MAX_ENCODED_BYTES) return null;

  let json;
  try {
    json = fromBase64(encoded);
  } catch {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  // Legacy payloads used long key names; accept both so old shared links keep
  // working. This is the whole reason the app can change its wire format.
  const pick = (short, long) => (parsed[short] !== undefined ? parsed[short] : parsed[long]);

  const stateColors = safeColorMap(pick('c', 'stateColors'), validStateNames);
  const countyColors = safeColorMap(pick('cc', 'countyColors'), null);
  const legendEntries = safeLegend(pick('l', 'legendEntries'));
  const rawPosition = cleanText(pick('lp', 'legendPosition'), 20);

  const result = {
    stateColors,
    countyColors,
    legendEntries,
    title: cleanText(pick('t', 'mapTitle')),
    subtitle: cleanText(pick('s', 'mapSubtitle')),
    source: cleanText(pick('src', 'mapSource')),
    legendTitle: cleanText(pick('lt', 'legendTitle'), 80),
    legendPosition: LEGEND_POSITIONS.has(rawPosition) ? rawPosition : EMPTY_STATE.legendPosition,
  };

  // An empty decode is indistinguishable from "no map"; say so explicitly
  // rather than handing back a blank state that overwrites the user's work.
  const hasContent =
    Object.keys(result.stateColors).length ||
    Object.keys(result.countyColors).length ||
    result.legendEntries.length ||
    result.title || result.subtitle || result.source || result.legendTitle;

  return hasContent ? result : null;
}

/** Round-trip helper used by tests and by the gallery's dedupe key. */
export function stateFingerprint(state) {
  return encodeState({ ...EMPTY_STATE, ...state });
}
