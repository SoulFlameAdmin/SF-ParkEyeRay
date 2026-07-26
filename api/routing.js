const PROFILE_BASES = {
  driving: [
    'https://router.project-osrm.org',
    'https://routing.openstreetmap.de/routed-car'
  ],
  walking: [
    'https://routing.openstreetmap.de/routed-foot'
  ],
  cycling: [
    'https://routing.openstreetmap.de/routed-bike'
  ]
};

const MAX_ROUTE_POINTS = 12;
const MAX_MATCH_POINTS = 40;

function validPoint(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
    && point.lat >= -90 && point.lat <= 90
    && point.lon >= -180 && point.lon <= 180;
}

function parsePoints(value) {
  return String(value || '').split('|').filter(Boolean).map((part) => {
    const [lat, lon] = part.split(',').map(Number);
    return { lat, lon };
  });
}

function selectedProfile(value) {
  if (value === 'walking') return 'walking';
  if (value === 'cycling') return 'cycling';
  return 'driving';
}

function selectedMode(value) {
  return ['route', 'table', 'nearest', 'match'].includes(value) ? value : 'route';
}

function routePath(coordinates, query) {
  const alternatives = query.alternatives === '0' || query.alternatives === 'false' ? 'false' : 'true';
  const steps = query.steps === '0' || query.steps === 'false' ? 'false' : 'true';
  return `/route/v1/driving/${coordinates}`
    + `?overview=full&geometries=geojson&steps=${steps}`
    + `&alternatives=${alternatives}`
    + '&annotations=distance,duration,speed'
    + '&continue_straight=default';
}

function tablePath(coordinates, points) {
  const destinations = points.slice(1).map((_, index) => index + 1).join(';');
  return `/table/v1/driving/${coordinates}?sources=0&destinations=${destinations}&annotations=duration,distance`;
}

function nearestPath(coordinates) {
  return `/nearest/v1/driving/${coordinates}?number=1`;
}

function matchPath(coordinates, query) {
  const timestamps = String(query.timestamps || '').trim();
  const timestampQuery = timestamps ? `&timestamps=${encodeURIComponent(timestamps)}` : '';
  return `/match/v1/driving/${coordinates}`
    + '?overview=full&geometries=geojson&steps=true&annotations=true&tidy=true&gaps=split'
    + timestampQuery;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });

  const points = parsePoints(req.query.points);
  const profile = selectedProfile(req.query.profile);
  const mode = selectedMode(req.query.mode);
  const maxPoints = mode === 'match' ? MAX_MATCH_POINTS : MAX_ROUTE_POINTS;
  const minPoints = mode === 'nearest' ? 1 : 2;

  if (points.length < minPoints || points.length > maxPoints || points.some((point) => !validPoint(point))) {
    return res.status(400).json({ error:'Invalid route points' });
  }
  if (mode === 'table' && profile !== 'driving') {
    return res.status(400).json({ error:'Table mode supports driving only' });
  }
  if (mode === 'match' && points.length < 2) {
    return res.status(400).json({ error:'Map matching requires at least two points' });
  }

  const coordinates = points.map((point) => `${point.lon},${point.lat}`).join(';');
  const path = mode === 'table'
    ? tablePath(coordinates, points)
    : mode === 'nearest'
      ? nearestPath(coordinates)
      : mode === 'match'
        ? matchPath(coordinates, req.query)
        : routePath(coordinates, req.query);

  let lastError;
  for (const base of PROFILE_BASES[profile]) {
    try {
      const response = await fetch(`${base}${path}`, {
        headers:{
          'User-Agent':'SoulFlame-Navigation/2.0 (https://soulflame-twins.vercel.app/map)',
          'Accept':'application/json'
        },
        signal:AbortSignal.timeout(8500)
      });
      const data = await response.json();
      if (!response.ok || !['Ok', 'NoMatch'].includes(data.code)) {
        throw new Error(data.message || `OSRM ${response.status}`);
      }
      if (data.code === 'NoMatch') throw new Error('No road match');

      res.setHeader('Cache-Control', mode === 'table'
        ? 's-maxage=45, stale-while-revalidate=180'
        : 'no-store');
      return res.status(200).json({
        ...data,
        profile,
        mode,
        engine:'osrm',
        source:'openstreetmap',
        endpoint:new URL(base).hostname
      });
    } catch (error) {
      lastError = error;
    }
  }

  console.error('Routing error', { profile, mode, message:lastError?.message });
  return res.status(502).json({
    error:'Routing service is temporarily unavailable',
    profile,
    mode
  });
}
