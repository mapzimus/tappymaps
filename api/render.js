// Server-side map image renderer (Phase 3 — Distribution).
//
// Turns a shared map's encoded state into a PNG (or SVG) so links unfurl with
// a real picture: og:image, Reddit/Devvit previews, etc. The browser export
// path (dom-to-image) can't run on a crawler, so we re-draw the map here from
// the same TopoJSON + the same encoded state the editor produces.
//
//   GET /api/render?m=<urlencoded-base64-state>&format=png|svg&w=<width>
//
// `m` is encodeURIComponent(btoa(JSON.stringify({colors, legend, title,
// subtitle, legendTitle, source}))) — identical to encodeStateToURL() / the
// share-link fragment in index.html.

import { Resvg } from '@resvg/resvg-js';
import { feature } from 'topojson-client';

// FIPS → state name (mirrors FIPS_TO_STATE in index.html). DC is drawn but
// never coloured (matches the editor's nonColorable rule).
const FIPS_TO_STATE = {
  '01': 'Alabama', '02': 'Alaska', '04': 'Arizona', '05': 'Arkansas', '06': 'California',
  '08': 'Colorado', '09': 'Connecticut', '10': 'Delaware', '11': 'District of Columbia',
  '12': 'Florida', '13': 'Georgia', '15': 'Hawaii', '16': 'Idaho', '17': 'Illinois',
  '18': 'Indiana', '19': 'Iowa', '20': 'Kansas', '21': 'Kentucky', '22': 'Louisiana',
  '23': 'Maine', '24': 'Maryland', '25': 'Massachusetts', '26': 'Michigan', '27': 'Minnesota',
  '28': 'Mississippi', '29': 'Missouri', '30': 'Montana', '31': 'Nebraska', '32': 'Nevada',
  '33': 'New Hampshire', '34': 'New Jersey', '35': 'New Mexico', '36': 'New York',
  '37': 'North Carolina', '38': 'North Dakota', '39': 'Ohio', '40': 'Oklahoma',
  '41': 'Oregon', '42': 'Pennsylvania', '44': 'Rhode Island', '45': 'South Carolina',
  '46': 'South Dakota', '47': 'Tennessee', '48': 'Texas', '49': 'Utah', '50': 'Vermont',
  '51': 'Virginia', '53': 'Washington', '54': 'West Virginia', '55': 'Wisconsin', '56': 'Wyoming',
};

// Cache the TopoJSON across warm invocations (it's static per deploy).
let _topoCache = null;
async function getTopology() {
  if (_topoCache) return _topoCache;
  const r = await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json');
  if (!r.ok) throw new Error('topology fetch failed: ' + r.status);
  _topoCache = await r.json();
  return _topoCache;
}

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Decode the share-state param. Tolerant of URL-encoding quirks (a literal '+'
// that got turned into a space) and of base64url.
export function decodeState(m) {
  let b64 = String(m || '').replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(b64, 'base64').toString('utf8');
  return JSON.parse(json);
}

function geomToPath(geo) {
  let d = '';
  const rings = geo.type === 'Polygon' ? [geo.coordinates]
    : geo.type === 'MultiPolygon' ? geo.coordinates : [];
  for (const poly of rings) {
    for (const ring of poly) {
      d += 'M' + ring.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + 'Z';
    }
  }
  return d;
}

// Compose the full poster SVG. Coordinate space matches the editor's map
// (viewBox content 0..1010 x, 0..710 y) plus a title band on top.
export function buildMapSVG(state, topology) {
  state = state || {};
  const colors = state.colors || {};
  const legend = Array.isArray(state.legend) ? state.legend.slice(0, 8) : [];
  const title = (state.title || 'My US Map').slice(0, 80);
  const subtitle = (state.subtitle || '').slice(0, 120);
  const source = (state.source || '').slice(0, 120);
  const legendTitle = (state.legendTitle || '').slice(0, 60);

  const UNCOLORED = '#e2e8f0';
  const STROKE = '#cbd5e1';
  const BG = '#ffffff';
  const INK = '#0f172a';
  const MUTED = '#64748b';

  const features = feature(topology, topology.objects.states).features;
  let paths = '';
  for (const f of features) {
    const fips = String(f.id).padStart(2, '0');
    const name = FIPS_TO_STATE[fips] || '';
    const fill = (name && colors[name]) ? colors[name] : UNCOLORED;
    paths += '<path d="' + geomToPath(f.geometry) + '" fill="' + fill + '" stroke="' + STROKE + '" stroke-width="1"/>';
  }

  // Title band sits above the map (negative y). Final viewBox: x -20..990,
  // y -120..710  => width 1010, height 830.
  const VB = '-20 -120 1010 830';
  const W = 1200, H = Math.round(1200 * (830 / 1010)); // ~986, keeps the map un-cropped

  let titleBand = '<text x="490" y="-60" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" '
    + 'font-size="46" font-weight="700" fill="' + INK + '">' + escapeXml(title) + '</text>';
  if (subtitle) {
    titleBand += '<text x="490" y="-22" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" '
      + 'font-size="24" fill="' + MUTED + '">' + escapeXml(subtitle) + '</text>';
  }

  // Legend box, bottom-left of the map area.
  let legendSvg = '';
  if (legend.length) {
    const rowH = 30, padX = 14, padTop = legendTitle ? 36 : 14;
    const boxH = padTop + legend.length * rowH + 8;
    const boxW = 270;
    const bx = 24, by = 690 - boxH;
    legendSvg += '<g>'
      + '<rect x="' + bx + '" y="' + by + '" width="' + boxW + '" height="' + boxH + '" rx="12" '
      + 'fill="#ffffff" stroke="' + STROKE + '" stroke-width="1.5"/>';
    if (legendTitle) {
      legendSvg += '<text x="' + (bx + padX) + '" y="' + (by + 26) + '" font-family="Arial, Helvetica, sans-serif" '
        + 'font-size="17" font-weight="700" fill="' + INK + '">' + escapeXml(legendTitle) + '</text>';
    }
    legend.forEach((e, i) => {
      const ly = by + padTop + i * rowH;
      legendSvg += '<rect x="' + (bx + padX) + '" y="' + ly + '" width="20" height="20" rx="4" fill="'
        + escapeXml(e.color || '#999') + '" stroke="' + STROKE + '" stroke-width="0.75"/>'
        + '<text x="' + (bx + padX + 30) + '" y="' + (ly + 16) + '" font-family="Arial, Helvetica, sans-serif" '
        + 'font-size="17" fill="' + INK + '">' + escapeXml(String(e.label || '').slice(0, 26)) + '</text>';
    });
    legendSvg += '</g>';
  }

  const sourceSvg = source
    ? '<text x="490" y="702" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="' + MUTED + '">' + escapeXml(source) + '</text>'
    : '';

  // Pin + wordmark logo (same artwork as the on-map logoWatermark).
  const logo = '<g transform="translate(700, 628) scale(0.9)" opacity="0.85">'
    + '<circle cx="30" cy="24" r="22" fill="#0EA5E9"/>'
    + '<polygon points="14,34 30,62 46,34" fill="#0EA5E9"/>'
    + '<circle cx="30" cy="24" r="12" fill="#ffffff"/>'
    + '<circle cx="30" cy="24" r="6" fill="#F97316"/>'
    + '<text x="68" y="38" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" fill="#0EA5E9" letter-spacing="-0.5">tappy</text>'
    + '<text x="178" y="38" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" fill="#F97316">maps</text>'
    + '</g>';

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="' + VB + '">'
    + '<rect x="-20" y="-120" width="1010" height="830" fill="' + BG + '"/>'
    + titleBand
    + '<g transform="translate(5, -20) scale(0.95)">' + paths + '</g>'
    + legendSvg + sourceSvg + logo
    + '</svg>';
}

export default async function handler(req, res) {
  try {
    const m = (req.query && req.query.m) || '';
    if (!m) return res.status(400).json({ error: 'Missing map state (m)' });

    let state;
    try { state = decodeState(m); }
    catch (_) { return res.status(400).json({ error: 'Invalid map state' }); }

    const topology = await getTopology();
    const svg = buildMapSVG(state, topology);

    const format = (req.query && req.query.format) === 'svg' ? 'svg' : 'png';
    // Static per state — let the CDN cache it hard.
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');

    if (format === 'svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.status(200).send(svg);
    }

    const width = Math.min(2400, Math.max(600, parseInt((req.query && req.query.w) || '1200', 10) || 1200));
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'white' })
      .render().asPng();
    res.setHeader('Content-Type', 'image/png');
    return res.status(200).send(png);
  } catch (err) {
    return res.status(500).json({ error: 'Render failed: ' + (err && err.message) });
  }
}
