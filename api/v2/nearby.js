'use strict';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];
const BG = { south: 41.1, north: 44.3, west: 22.2, east: 28.75 };
const TIMEOUT_MS = 14000;
const TYPES = {
  fuel: { tag: 'amenity', value: 'fuel', label: 'Бензиностанция' }
};

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseInput(query = {}) {
  const type = String(query.type || 'fuel');
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  const radius = Math.round(Number(query.radius || 5000));
  const limit = Math.round(Number(query.limit || 80));
  const errors = [];
  if (!TYPES[type]) errors.push('invalid_type');
  if (!Number.isFinite(lat) || lat < BG.south || lat > BG.north) errors.push('invalid_latitude');
  if (!Number.isFinite(lon) || lon < BG.west || lon > BG.east) errors.push('invalid_longitude');
  if (!Number.isFinite(radius) || radius < 250 || radius > 15000) errors.push('invalid_radius');
  if (!Number.isFinite(limit) || limit < 1 || limit > 150) errors.push('invalid_limit');
  return { errors, value: { type, lat, lon, radius, limit } };
}

function rad(value) { return value * Math.PI / 180; }
function distanceMeters(a, b) {
  const earth = 6371000;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pointOf(element) {
  const lat = Number(element?.lat ?? element?.center?.lat);
  const lon = Number(element?.lon ?? element?.center?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  const points = (Array.isArray(element?.geometry) ? element.geometry : [])
    .map(item => ({ lat: Number(item?.lat), lon: Number(item?.lon) }))
    .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon));
  if (!points.length) return null;
  return {
    lat: points.reduce((sum, item) => sum + item.lat, 0) / points.length,
    lon: points.reduce((sum, item) => sum + item.lon, 0) / points.length
  };
}

function queryFor({ type, lat, lon, radius }) {
  const config = TYPES[type];
  return `[out:json][timeout:22];nwr(around:${radius},${lat},${lon})["${config.tag}"="${config.value}"];out center tags qt;`;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function runOverpass(input) {
  const query = queryFor(input);
  let lastError = null;
  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent': 'SmartCity-SoulFlame/2.0 (https://sf-parkeyeray.vercel.app)'
        },
        body: new URLSearchParams({ data: query })
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data?.elements)) throw new Error('invalid_overpass_payload');
      return { elements: data.elements, endpoint };
    } catch (error) {
      lastError = error;
      console.warn('nearby endpoint failed', endpoint, error?.message || error);
    }
  }
  const error = new Error('nearby_service_unavailable');
  error.cause = lastError;
  throw error;
}

function normalize(elements, input) {
  const origin = { lat: input.lat, lon: input.lon };
  const seen = new Set();
  return elements.map(element => {
    const point = pointOf(element);
    if (!point) return null;
    const externalId = `${element.type}/${element.id}`;
    if (seen.has(externalId)) return null;
    seen.add(externalId);
    const tags = element.tags || {};
    return {
      id: `osm:${externalId}`,
      source: 'osm',
      type: input.type,
      name: tags.name || tags.brand || tags.operator || TYPES[input.type].label,
      brand: tags.brand || tags.operator || null,
      point,
      distance: Math.round(distanceMeters(origin, point)),
      openingHours: tags.opening_hours || null,
      phone: tags.phone || tags['contact:phone'] || null,
      website: tags.website || tags['contact:website'] || null,
      selfService: String(tags.self_service || '').toLowerCase() === 'yes',
      fuelTypes: Object.keys(tags).filter(key => key.startsWith('fuel:') && String(tags[key]).toLowerCase() === 'yes').map(key => key.slice(5)),
      tags
    };
  }).filter(Boolean).sort((a, b) => a.distance - b.distance).slice(0, input.limit);
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const parsed = parseInput(req.query);
  if (parsed.errors.length) return send(res, 400, { error: 'invalid_request', details: parsed.errors });
  try {
    const result = await runOverpass(parsed.value);
    const places = normalize(result.elements, parsed.value);
    res.setHeader('cache-control', 's-maxage=90, stale-while-revalidate=300');
    return send(res, 200, {
      places,
      meta: {
        type: parsed.value.type,
        radius: parsed.value.radius,
        resultCount: places.length,
        source: 'osm',
        endpoint: result.endpoint,
        liveStatus: false
      }
    });
  } catch (error) {
    return send(res, 502, {
      error: 'nearby_service_unavailable',
      retryable: true,
      detail: error?.cause?.message || error?.message || 'unknown'
    });
  }
}

module.exports = handler;
module.exports._test = { parseInput, pointOf, queryFor, normalize, distanceMeters };
