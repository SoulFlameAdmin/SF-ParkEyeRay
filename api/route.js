const PROVIDERS = {
  driving: [
    'https://routing.openstreetmap.de/routed-car/route/v1/driving',
    'https://router.project-osrm.org/route/v1/driving'
  ],
  walking: [
    'https://routing.openstreetmap.de/routed-foot/route/v1/driving'
  ]
};

function parseCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function fallbackRoute(start, end, mode) {
  const rad = (value) => value * Math.PI / 180;
  const earth = 6371000;
  const dLat = rad(end.lat - start.lat);
  const dLon = rad(end.lon - start.lon);
  const lat1 = rad(start.lat);
  const lat2 = rad(end.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const straight = earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  const factor = mode === 'walking' ? 1.22 : 1.34;
  const speed = mode === 'walking' ? 1.35 : 11.1;
  const distance = Math.round(straight * factor);
  return {
    ok: true,
    source: 'estimate',
    isEstimate: true,
    mode,
    distance,
    duration: Math.round(distance / speed),
    geometry: {
      type: 'LineString',
      coordinates: [[start.lon, start.lat], [end.lon, end.lat]]
    },
    steps: []
  };
}

async function requestRoute(base, start, end) {
  const coordinates = `${start.lon},${start.lat};${end.lon},${end.lat}`;
  const url = `${base}/${coordinates}?overview=full&geometries=geojson&steps=true&alternatives=false`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'SmartCity-Mobility/1.6 (https://sf-parkeyeray.vercel.app)'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Routing provider ${response.status}`);
    const payload = await response.json();
    const route = payload?.routes?.[0];
    if (!route || !route.geometry || !Number.isFinite(Number(route.distance))) {
      throw new Error('Invalid routing response');
    }
    const steps = Array.isArray(route.legs)
      ? route.legs.flatMap((leg) => Array.isArray(leg.steps) ? leg.steps : []).slice(0, 80)
      : [];
    return {
      ok: true,
      source: base.includes('openstreetmap.de') ? 'osm-routing' : 'osrm',
      isEstimate: false,
      distance: Math.round(Number(route.distance)),
      duration: Math.round(Number(route.duration)),
      geometry: route.geometry,
      steps: steps.map((step) => ({
        name: String(step.name || ''),
        distance: Math.round(Number(step.distance || 0)),
        duration: Math.round(Number(step.duration || 0)),
        maneuver: step.maneuver || null
      }))
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const start = {
    lat: parseCoordinate(req.query?.fromLat, -90, 90),
    lon: parseCoordinate(req.query?.fromLon, -180, 180)
  };
  const end = {
    lat: parseCoordinate(req.query?.toLat, -90, 90),
    lon: parseCoordinate(req.query?.toLon, -180, 180)
  };
  const mode = req.query?.mode === 'walking' ? 'walking' : 'driving';

  if (Object.values(start).some((value) => value === null) || Object.values(end).some((value) => value === null)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  let lastError = null;
  for (const provider of PROVIDERS[mode]) {
    try {
      const route = await requestRoute(provider, start, end);
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
      return res.status(200).json({ ...route, mode });
    } catch (error) {
      lastError = error;
      console.warn('Routing provider failed', provider, error?.message || error);
    }
  }

  const fallback = fallbackRoute(start, end, mode);
  fallback.warning = lastError?.message || 'Routing providers unavailable';
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  return res.status(200).json(fallback);
}
