const PROFILE_BASES = {
  driving: [
    'https://router.project-osrm.org',
    'https://routing.openstreetmap.de/routed-car'
  ],
  walking: [
    'https://routing.openstreetmap.de/routed-foot'
  ]
};

const BG_LIMITS = { south:41.10, north:44.30, west:22.20, east:28.75 };

function validPoint(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
    && point.lat >= BG_LIMITS.south && point.lat <= BG_LIMITS.north
    && point.lon >= BG_LIMITS.west && point.lon <= BG_LIMITS.east;
}

function parsePoints(value) {
  return String(value || '').split('|').filter(Boolean).map((part) => {
    const [lat, lon] = part.split(',').map(Number);
    return { lat, lon };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });

  const points = parsePoints(req.query.points);
  if (points.length < 2 || points.length > 9 || points.some((point) => !validPoint(point))) {
    return res.status(400).json({ error:'Invalid route points' });
  }

  const profile = req.query.profile === 'walking' ? 'walking' : 'driving';
  const coordinates = points.map((point) => `${point.lon},${point.lat}`).join(';');
  const isTable = req.query.mode === 'table' && profile === 'driving';
  // The routed-car and routed-foot public instances expose their selected
  // backend through the base URL while retaining OSRM's /driving API slug.
  const path = isTable
    ? `/table/v1/driving/${coordinates}?sources=0&destinations=${points.slice(1).map((_, index) => index + 1).join(';')}&annotations=duration,distance`
    : `/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;

  let lastError;
  for (const base of PROFILE_BASES[profile]) {
    try {
      const response = await fetch(`${base}${path}`, {
        headers:{ 'User-Agent':'SF-SmartCity/1.6 (https://sf-parkeyeray.vercel.app)' },
        signal:AbortSignal.timeout(9000)
      });
      const data = await response.json();
      if (!response.ok || data.code !== 'Ok') throw new Error(data.message || `OSRM ${response.status}`);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(200).json({ ...data, profile });
    } catch (error) {
      lastError = error;
    }
  }

  console.error('Routing error', profile, lastError);
  return res.status(502).json({ error:'Routing service is temporarily unavailable', profile });
}