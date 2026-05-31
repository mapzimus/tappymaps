// Same-origin proxy for the US Census ACS API.
//
// Why this exists: api.census.gov does not return an Access-Control-Allow-Origin
// header, so a browser fetch from tappymaps.com is blocked by CORS even though the
// data is public. A server-to-server fetch is not subject to browser CORS, so we
// proxy the request here and return the raw Census JSON array unchanged. All
// FIPS-mapping / compute / trend logic stays client-side in fetchCensusData().

// CORS helper (mirrors api/stripe/* so localhost dev works too)
function getAllowedOrigin(req) {
  const origin = req.headers?.origin || '';
  const allowed = ['https://tappymaps.com', 'http://localhost:8000', 'http://localhost:3000'];
  return allowed.includes(origin) ? origin : 'https://tappymaps.com';
}

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(req),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  Object.entries(corsHeaders(req)).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const year = String(req.query?.year || '');
  const vars = String(req.query?.vars || '');

  // SSRF guard: only allow values that can be safely interpolated into the fixed
  // Census URL template. year = 4 digits in a sane range; vars = uppercase Census
  // variable codes separated by commas. Anything else is rejected before fetch.
  if (!/^\d{4}$/.test(year) || Number(year) < 2005 || Number(year) > 2030) {
    return res.status(400).json({ error: 'Invalid year' });
  }
  if (!/^[A-Z0-9_,]+$/.test(vars) || vars.length > 500) {
    return res.status(400).json({ error: 'Invalid vars' });
  }

  const url = 'https://api.census.gov/data/' + year + '/acs/acs1?get=NAME,' + vars + '&for=state:*';

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return res.status(502).json({ error: 'Census API returned ' + upstream.status });
    }
    const data = await upstream.json();
    // ACS data is static per-year — let Vercel's CDN cache it for a day.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Census API' });
  }
}
