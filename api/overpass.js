const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];

const MAX_QUERY_LENGTH = 20000;
const TIMEOUT_MS = 18000;
const HEALTH_QUERY = '[out:json][timeout:10];node(42.68,23.30,42.71,23.34)["amenity"="parking"];out ids 1;';

async function fetchEndpoint(endpoint, query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'user-agent': 'ParkEyeRay/1.0 (https://sf-parkeyeray.vercel.app)'
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Overpass ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.elements)) {
      throw new Error('Invalid Overpass response');
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function runQuery(query) {
  let lastError = null;

  for (const endpoint of ENDPOINTS) {
    try {
      const data = await fetchEndpoint(endpoint, query);
      return { data, endpoint };
    } catch (error) {
      lastError = error;
      console.warn(`[ParkEyeRay] Overpass failed: ${endpoint}`, error?.message || error);
    }
  }

  const error = new Error('Parking data service is temporarily unavailable');
  error.cause = lastError;
  throw error;
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query?.health === '1') {
    try {
      const { data, endpoint } = await runQuery(HEALTH_QUERY);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        ok: true,
        endpoint,
        elements: data.elements.length
      });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        error: error.message,
        detail: error.cause?.message || 'Unknown upstream error'
      });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  if (!query) {
    return res.status(400).json({ error: 'Missing Overpass query' });
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return res.status(413).json({ error: 'Query is too large' });
  }

  try {
    const { data } = await runQuery(query);
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({
      error: error.message,
      detail: error.cause?.message || 'Unknown upstream error'
    });
  }
}
