const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];

const BG = { south:41.1, north:44.3, west:22.2, east:28.75 };
const MAX_SPAN = 1.65;
const TIMEOUT_MS = 22000;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validBox(box) {
  return box.south !== null && box.north !== null && box.west !== null && box.east !== null
    && box.south < box.north && box.west < box.east
    && box.south >= BG.south && box.north <= BG.north
    && box.west >= BG.west && box.east <= BG.east
    && box.north - box.south <= MAX_SPAN
    && box.east - box.west <= MAX_SPAN;
}

function compact(element) {
  const lat = Number(element.lat ?? element.center?.lat);
  const lon = Number(element.lon ?? element.center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const tags = element.tags || {};
  return {
    id:`${element.type || 'osm'}:${element.id}`,
    lat,
    lon,
    name:tags.name || tags.operator || '',
    capacity:tags.capacity || '',
    fee:tags.fee || '',
    access:tags.access || '',
    parking:tags.parking || '',
    covered:tags.covered || '',
    wheelchair:tags.wheelchair || ''
  };
}

async function queryEndpoint(endpoint, query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method:'POST',
      headers:{
        'content-type':'application/x-www-form-urlencoded;charset=UTF-8',
        'user-agent':'SF-SmartCity/1.7 (https://sf-parkeyeray.vercel.app)'
      },
      body:new URLSearchParams({ data:query }),
      signal:controller.signal
    });
    if (!response.ok) throw new Error(`Overpass ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload?.elements)) throw new Error('Invalid Overpass response');
    return payload.elements.map(compact).filter(Boolean);
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error:'Method not allowed' });
  }

  const box = {
    south:number(req.query.south),
    north:number(req.query.north),
    west:number(req.query.west),
    east:number(req.query.east)
  };
  if (!validBox(box)) return res.status(400).json({ error:'Invalid Bulgaria grid box' });

  const bbox = `${box.south},${box.west},${box.north},${box.east}`;
  const query = `[out:json][timeout:25];nwr["amenity"="parking"](${bbox});out center tags qt;`;
  let lastError = null;

  for (const endpoint of ENDPOINTS) {
    try {
      const parkings = await queryEndpoint(endpoint, query);
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).json({ parkings, box, source:'OpenStreetMap/Overpass', live:false });
    } catch (error) {
      lastError = error;
      console.warn('[SmartCity] parking grid failed', endpoint, error?.message || error);
    }
  }

  return res.status(502).json({
    error:'Parking data service is temporarily unavailable',
    detail:lastError?.message || 'Unknown upstream error'
  });
}
