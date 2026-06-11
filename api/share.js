// Server-rendered share route (Phase 3 — crawler-facing OG previews).
//
// The SPA keeps map state in the URL *fragment* (#<base64>), which crawlers
// never send to the server and which JS-set <meta> can't help with for
// non-JS unfurlers (Facebook, Twitter). This route carries the state in a
// path-safe base64url segment so the server can emit real og:image / og:title
// meta, then bounces human visitors into the editor with the map restored.
//
//   /s/<base64url>   (rewritten to /api/share?h=<base64url> by vercel.json)
//
// og:image points at /api/render (the Phase 3 rasterizer), which decodes the
// same state. The redirect target uses standard base64 in the fragment, which
// is exactly what loadStateFromURL() in index.html expects.

function fromBase64Url(s) {
  return String(s || '').replace(/-/g, '+').replace(/_/g, '/');
}
function padBase64(b64) {
  const m = b64.length % 4;
  return m ? b64 + '='.repeat(4 - m) : b64;
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default function handler(req, res) {
  const h = (req.query && (req.query.h || req.query.m)) || '';
  const stdB64 = padBase64(fromBase64Url(h));

  let title = 'A US map', subtitle = '';
  try {
    const state = JSON.parse(Buffer.from(stdB64, 'base64').toString('utf8'));
    if (state && state.title) title = String(state.title).slice(0, 90);
    if (state && state.subtitle) subtitle = String(state.subtitle).slice(0, 140);
  } catch (_) { /* fall back to generic copy */ }

  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'tappymaps.com';
  const base = proto + '://' + host;
  const img = base + '/api/render?m=' + encodeURIComponent(h) + '&format=png';
  const editor = '/design/make#' + stdB64;          // fragment — what the SPA reads
  const desc = subtitle || 'A US map made with Tappymaps. Tap. Color. Share.';
  const canonical = base + '/s/' + h;

  const html = '<!doctype html><html lang="en"><head>'
    + '<meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + esc(title) + ' — Tappymaps</title>'
    + '<meta name="description" content="' + esc(desc) + '">'
    + '<meta property="og:type" content="website">'
    + '<meta property="og:site_name" content="Tappymaps">'
    + '<meta property="og:title" content="' + esc(title) + '">'
    + '<meta property="og:description" content="' + esc(desc) + '">'
    + '<meta property="og:image" content="' + esc(img) + '">'
    + '<meta property="og:image:width" content="1200">'
    + '<meta property="og:image:height" content="986">'
    + '<meta property="og:url" content="' + esc(canonical) + '">'
    + '<meta name="twitter:card" content="summary_large_image">'
    + '<meta name="twitter:title" content="' + esc(title) + '">'
    + '<meta name="twitter:description" content="' + esc(desc) + '">'
    + '<meta name="twitter:image" content="' + esc(img) + '">'
    + '<link rel="canonical" href="' + esc(canonical) + '">'
    + '<script>location.replace(' + JSON.stringify(editor) + ');</script>'
    + '<meta http-equiv="refresh" content="0; url=' + esc(editor) + '">'
    + '</head><body style="font-family:system-ui,-apple-system,sans-serif;background:#0F172A;color:#fff;text-align:center;padding:48px 20px">'
    + '<p style="font-size:18px">Opening this map on Tappymaps…</p>'
    + '<p><a style="color:#0EA5E9;font-weight:700" href="' + esc(editor) + '">Open the map →</a></p>'
    + '</body></html>';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=86400');
  res.status(200).send(html);
}

// Exported for tests.
export { fromBase64Url, padBase64 };
