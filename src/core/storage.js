// Safe localStorage access.
//
// The legacy app read localStorage directly in dozens of places and trusted
// whatever came back. A single corrupt key — hand-edited, truncated by a full
// quota, or written by an older build — threw inside module-scope code and
// took the whole app down. Storage is shared, mutable, and outside our
// control: every read has to survive garbage, and every write has to survive a
// full or disabled store.
//
// Rules here: never throw, always return a usable value, and let the caller
// state the shape it expects.

const memoryFallback = new Map();
let backing = null;

/** Resolve a working store once. Private browsing and blocked cookies throw on access. */
function store() {
  if (backing !== null) return backing;
  try {
    const probe = '__tappymaps_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    backing = window.localStorage;
  } catch {
    // Safari private mode, embedded iframes with storage blocked, etc.
    // A Map keeps the session working; nothing persists, which is correct.
    backing = {
      getItem: (k) => (memoryFallback.has(k) ? memoryFallback.get(k) : null),
      setItem: (k, v) => memoryFallback.set(k, String(v)),
      removeItem: (k) => memoryFallback.delete(k),
    };
  }
  return backing;
}

/** Raw string read. Returns `fallback` if absent or unreadable. */
export function readRaw(key, fallback = null) {
  try {
    const v = store().getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

/** Raw string write. Returns whether it stuck. */
export function writeRaw(key, value) {
  try {
    store().setItem(key, String(value));
    return true;
  } catch {
    // Almost always QuotaExceededError. Callers decide whether to tell the user.
    return false;
  }
}

export function remove(key) {
  try { store().removeItem(key); return true; } catch { return false; }
}

/**
 * JSON read with a shape guard.
 *
 * @param {string} key
 * @param {*} fallback         returned when missing, unparseable, or rejected
 * @param {(v:*)=>boolean} [isValid]  shape check; anything failing it is treated as corrupt
 */
export function readJSON(key, fallback, isValid) {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (isValid && !isValid(parsed)) return fallback;
  return parsed;
}

export function writeJSON(key, value) {
  try {
    return writeRaw(key, JSON.stringify(value));
  } catch {
    // Circular structure, BigInt, etc. Never let a serialization bug escape.
    return false;
  }
}

/** Integer read, clamped. Non-numeric or out-of-range storage yields `fallback`. */
export function readInt(key, fallback = 0, { min = -Infinity, max = Infinity } = {}) {
  const n = parseInt(readRaw(key, ''), 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

/** Common shape guards, so callers do not hand-roll them. */
export const is = {
  array: (v) => Array.isArray(v),
  object: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
  string: (v) => typeof v === 'string',
  arrayOfObjects: (v) => Array.isArray(v) && v.every((x) => !!x && typeof x === 'object'),
};

/** Test seam: forget the resolved backing store. */
export function _resetForTests() {
  backing = null;
  memoryFallback.clear();
}
