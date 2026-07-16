'use strict';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];
const TIMEOUT_MS = 16000;
const BG = { south: 41.1, north: 44.3, west: 22.2, east: 28.75 };

function send(res, statusCode, payload, headers = {}) {
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseInput(query = {}) {
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  const radius = Math.round(Number(query.radius || 1000));
  const limit = Math.round(Number(query.limit || 100));
  const errors = [];
  if (!Number.isFinite(lat) || lat < BG.south || lat > BG.north) errors.push('invalid_latitude');
  if (!Number.isFinite(lon) || lon < BG.west || lon > BG.east) errors.push('invalid_longitude');
  if (!Number.isFinite(radius) || radius < 100 || radius > 5000) errors.push('invalid_radius');
  if (!Number.isFinite(limit) || limit < 1 || limit > 150) errors.push('invalid_limit');
  return { errors, value: { lat, lon, radius, limit } };
}

function radians(value) { return value * Math.PI / 180; }
function distanceMeters(a, b) {
  const earth = 6371000;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function pointOf(element) {
  const lat = Number(element?.lat ?? element?.center?.lat);
  const lon = Number(element?.lon ?? element?.center?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  const geometry = Array.isArray(element?.geometry) ? element.geometry : [];
  const valid = geometry
    .map(point => ({ lat: Number(point?.lat), lon: Number(point?.lon) }))
    .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  if (!valid.length) return null;
  return {
    lat: valid.reduce((sum, point) => sum + point.lat, 0) / valid.length,
    lon: valid.reduce((sum, point) => sum + point.lon, 0) / valid.length
  };
}

function parseInteger(value) {
  const match = String(value ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? Math.round(Number(match[0])) : null;
}

function booleanTag(value) {
  const normalized = String(value ?? '').toLowerCase();
  if (['yes', 'designated', 'true', '1'].includes(normalized)) return true;
  if (['no', 'false', '0'].includes(normalized)) return false;
  return null;
}

function parkingKind(tags = {}) {
  if (tags.amenity === 'parking_space') return 'parking_space';
  if (tags.parking === 'underground') return 'underground';
  if (tags.parking === 'multi-storey') return 'multi_storey';
  if (tags.parking === 'street_side' || tags.parking === 'lane' || tags['parking:left'] || tags['parking:right'] || tags['parking:both']) return 'street';
  if (tags.parking === 'surface') return 'surface';
  return 'parking';
}

function buildOverpassQuery({ lat, lon, radius }) {
  return `[out:json][timeout:25];(
    nwr(around:${radius},${lat},${lon})["amenity"="parking"];
    nwr(around:${radius},${lat},${lon})["amenity"="parking_space"];
    node(around:${radius},${lat},${lon})["amenity"="parking_entrance"];
    way(around:${radius},${lat},${lon})[~"^parking:(left|right|both)$"~".+"];
  );out center tags geom;`;
}

async function fetchWithTimeout(url, options, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function queryOverpass(input) {
  const query = buildOverpassQuery(input);
  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
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
      const payload = await response.json();
      if (!Array.isArray(payload?.elements)) throw new Error('Invalid Overpass payload');
      return { elements: payload.elements, endpoint };
    } catch (error) {
      lastError = error;
      console.warn('parking engine Overpass endpoint failed', endpoint, error?.message || error);
    }
  }
  const error = new Error('overpass_unavailable');
  error.cause = lastError;
  throw error;
}

function nearestEntrance(point, entrances) {
  let result = null;
  let best = Infinity;
  for (const entrance of entrances) {
    const value = distanceMeters(point, entrance.point);
    if (value <= 180 && value < best) {
      best = value;
      result = entrance.point;
    }
  }
  return result;
}

function normalizeOverpass(elements, origin) {
  const entrances = elements
    .filter(element => element?.tags?.amenity === 'parking_entrance')
    .map(element => ({ point: pointOf(element), externalId: `${element.type}/${element.id}` }))
    .filter(item => item.point);

  return elements
    .filter(element => element?.tags?.amenity !== 'parking_entrance')
    .map(element => {
      const point = pointOf(element);
      if (!point) return null;
      const tags = element.tags || {};
      const entrance = nearestEntrance(point, entrances) || point;
      const kind = parkingKind(tags);
      return {
        id: `osm:${element.type}/${element.id}`,
        source: 'osm',
        externalId: `${element.type}/${element.id}`,
        name: tags.name || tags.operator || null,
        kind,
        point,
        entrance,
        distance: Math.round(distanceMeters(origin, point)),
        access: tags.access || null,
        capacity: parseInteger(tags.capacity),
        fee: tags.fee || null,
        covered: ['underground', 'multi_storey'].includes(kind) || booleanTag(tags.covered),
        lit: booleanTag(tags.lit),
        surveillance: booleanTag(tags.surveillance) ?? (tags['surveillance:type'] ? true : null),
        verificationStatus: 'mapped',
        dataOrigin: 'overpass-fallback',
        sourceUpdatedAt: null,
        sourceRevision: null,
        tags,
        sourceRefs: [`osm:${element.type}/${element.id}`]
      };
    })
    .filter(Boolean);
}

function normalizeDatabaseRow(row) {
  const lat = Number(row.latitude);
  const lon = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const entranceLat = Number(row.entrance_latitude);
  const entranceLon = Number(row.entrance_longitude);
  const source = String(row.source || 'osm');
  const externalId = String(row.external_id || 'unknown');
  return {
    id: `${source}:${externalId}`,
    source,
    externalId,
    name: row.name || null,
    kind: row.kind || 'parking',
    point: { lat, lon },
    entrance: Number.isFinite(entranceLat) && Number.isFinite(entranceLon) ? { lat: entranceLat, lon: entranceLon } : { lat, lon },
    distance: Math.max(0, Math.round(Number(row.distance_m || 0))),
    access: row.access || null,
    capacity: row.capacity == null ? null : Number(row.capacity),
    fee: row.fee || null,
    covered: row.covered == null ? null : Boolean(row.covered),
    lit: row.lit == null ? null : Boolean(row.lit),
    surveillance: row.surveillance == null ? null : Boolean(row.surveillance),
    verificationStatus: row.verification_status || 'mapped',
    dataOrigin: 'postgis',
    sourceUpdatedAt: row.source_updated_at || null,
    sourceRevision: row.source_revision || null,
    tags: row.tags && typeof row.tags === 'object' ? row.tags : {},
    sourceRefs: [`${source}:${externalId}`]
  };
}

function normalizeName(value) {
  return String(value || '')
    .toLocaleLowerCase('bg-BG')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(паркинг|parking|места|зона)\b/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function priority(item) {
  if (item.source === 'soulflame' && item.verificationStatus === 'approved') return 40;
  if (item.source === 'municipality') return 30;
  if (item.source === 'operator') return 25;
  if (item.dataOrigin === 'postgis') return 15;
  return 10;
}

function areDuplicates(a, b) {
  if (a.source === b.source && a.externalId === b.externalId) return true;
  const spatial = distanceMeters(a.point, b.point);
  if (spatial > 28) return false;
  const left = normalizeName(a.name);
  const right = normalizeName(b.name);
  if (!left || !right) return spatial <= 12;
  return left === right || left.includes(right) || right.includes(left) || spatial <= 8;
}

function mergeParkingRecords(items, limit = 100) {
  const ordered = [...items].sort((a, b) => priority(b) - priority(a) || a.distance - b.distance);
  const result = [];
  for (const item of ordered) {
    const index = result.findIndex(existing => areDuplicates(existing, item));
    if (index === -1) {
      result.push(item);
      continue;
    }
    const existing = result[index];
    const preferred = priority(item) > priority(existing) ? item : existing;
    const secondary = preferred === item ? existing : item;
    result[index] = {
      ...preferred,
      name: preferred.name || secondary.name,
      capacity: preferred.capacity ?? secondary.capacity,
      access: preferred.access || secondary.access,
      fee: preferred.fee || secondary.fee,
      covered: preferred.covered ?? secondary.covered,
      lit: preferred.lit ?? secondary.lit,
      surveillance: preferred.surveillance ?? secondary.surveillance,
      sourceRefs: [...new Set([...(preferred.sourceRefs || []), ...(secondary.sourceRefs || [])])]
    };
  }
  return result.sort((a, b) => a.distance - b.distance).slice(0, limit);
}

async function queryDatabase(input) {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.SUPABASE_ANON_KEY || '');
  if (!url || !key) return { configured: false, rows: [] };

  const response = await fetchWithTimeout(`${url}/rest/v1/rpc/search_parking_features`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      p_lat: input.lat,
      p_lon: input.lon,
      p_radius_m: input.radius,
      p_limit: input.limit
    })
  }, 9000);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const error = new Error(`parking_database_${response.status}`);
    error.details = data;
    throw error;
  }
  return { configured: true, rows: Array.isArray(data) ? data : [] };
}

function freshness(items) {
  const timestamps = items
    .map(item => Date.parse(item.sourceUpdatedAt || ''))
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return send(res, 405, { error: 'method_not_allowed' });
  }

  const parsed = parseInput(req.query);
  if (parsed.errors.length) return send(res, 400, { error: 'invalid_request', details: parsed.errors });
  const input = parsed.value;
  let databaseError = null;

  try {
    const database = await queryDatabase(input);
    const databaseItems = database.rows.map(normalizeDatabaseRow).filter(Boolean);
    if (databaseItems.length) {
      const parkings = mergeParkingRecords(databaseItems, input.limit);
      return send(res, 200, {
        parkings,
        meta: {
          dataSource: 'postgis',
          fallbackUsed: false,
          radius: input.radius,
          resultCount: parkings.length,
          rawCount: databaseItems.length,
          freshness: freshness(parkings),
          liveOccupancy: false
        }
      }, { 'cache-control': 's-maxage=60, stale-while-revalidate=300' });
    }
  } catch (error) {
    databaseError = error?.message || 'database_failed';
    console.warn('parking database unavailable; using fallback', databaseError);
  }

  try {
    const fallback = await queryOverpass(input);
    const rawItems = normalizeOverpass(fallback.elements, { lat: input.lat, lon: input.lon });
    const parkings = mergeParkingRecords(rawItems, input.limit);
    return send(res, 200, {
      parkings,
      meta: {
        dataSource: 'overpass-fallback',
        fallbackUsed: true,
        fallbackEndpoint: fallback.endpoint,
        databaseError,
        radius: input.radius,
        resultCount: parkings.length,
        rawCount: rawItems.length,
        freshness: null,
        liveOccupancy: false
      }
    }, { 'cache-control': 's-maxage=35, stale-while-revalidate=120' });
  } catch (error) {
    console.error('parking engine failed', error);
    return send(res, 502, {
      error: 'parking_data_unavailable',
      retryable: true,
      databaseError,
      fallbackError: error?.cause?.message || error?.message || 'unknown'
    });
  }
}

module.exports = handler;
module.exports._test = {
  parseInput,
  distanceMeters,
  pointOf,
  buildOverpassQuery,
  normalizeOverpass,
  normalizeDatabaseRow,
  mergeParkingRecords,
  areDuplicates,
  priority,
  parkingKind
};
