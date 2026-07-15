'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
];

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) { result[key] = next; index += 1; }
    else result[key] = true;
  }
  return result;
}

function parseBbox(value) {
  const numbers = String(value || '').split(',').map(Number);
  if (numbers.length !== 4 || numbers.some(number => !Number.isFinite(number))) throw new Error('Use --bbox west,south,east,north');
  const [west, south, east, north] = numbers;
  if (west < 22.2 || east > 28.75 || south < 41.1 || north > 44.3 || west >= east || south >= north) throw new Error('BBox must be a valid area inside Bulgaria');
  return { west, south, east, north };
}

function bboxPolygon(bbox) {
  return {
    type: 'Polygon',
    coordinates: [[
      [bbox.west, bbox.south], [bbox.east, bbox.south], [bbox.east, bbox.north],
      [bbox.west, bbox.north], [bbox.west, bbox.south]
    ]]
  };
}

function overpassQuery(bbox) {
  const bounds = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:120];(
    nwr(${bounds})["amenity"="parking"];
    nwr(${bounds})["amenity"="parking_space"];
    node(${bounds})["amenity"="parking_entrance"];
    way(${bounds})[~"^parking:(left|right|both)$"~".+"];
  );out center tags geom meta;`;
}

async function queryOverpass(query) {
  let lastError = null;
  for (const endpoint of ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 130000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent': 'SmartCity-SoulFlame-Importer/1.0 (https://sf-parkeyeray.vercel.app)'
        },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload?.elements)) throw new Error('Invalid Overpass response');
      return { elements: payload.elements, endpoint };
    } catch (error) {
      lastError = error;
      console.warn(`Overpass failed: ${endpoint} — ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error('All Overpass endpoints failed');
}

function pointOf(element) {
  const lat = Number(element?.lat ?? element?.center?.lat);
  const lon = Number(element?.lon ?? element?.center?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  const valid = (Array.isArray(element?.geometry) ? element.geometry : [])
    .map(item => ({ lat: Number(item?.lat), lon: Number(item?.lon) }))
    .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon));
  if (!valid.length) return null;
  return {
    lat: valid.reduce((sum, item) => sum + item.lat, 0) / valid.length,
    lon: valid.reduce((sum, item) => sum + item.lon, 0) / valid.length
  };
}

function radians(value) { return value * Math.PI / 180; }
function distanceMeters(a, b) {
  const earth = 6371000;
  const dLat = radians(b.lat - a.lat), dLon = radians(b.lon - a.lon);
  const lat1 = radians(a.lat), lat2 = radians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function geometryOf(element, featureType) {
  const coordinates = (Array.isArray(element?.geometry) ? element.geometry : [])
    .map(item => [Number(item?.lon), Number(item?.lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (coordinates.length >= 2) {
    const first = coordinates[0], last = coordinates[coordinates.length - 1];
    const closed = coordinates.length >= 4 && first[0] === last[0] && first[1] === last[1];
    if (closed && featureType !== 'street') return { type: 'Polygon', coordinates: [coordinates] };
    return { type: 'LineString', coordinates };
  }
  const point = pointOf(element);
  return point ? { type: 'Point', coordinates: [point.lon, point.lat] } : null;
}

function parseInteger(value) {
  const match = String(value ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? Math.round(Number(match[0])) : null;
}

function boolTag(value) {
  const normalized = String(value ?? '').toLowerCase();
  if (['yes', 'designated', 'true', '1'].includes(normalized)) return true;
  if (['no', 'false', '0'].includes(normalized)) return false;
  return null;
}

function classify(tags = {}) {
  if (tags.amenity === 'parking_entrance') return { featureType: 'entrance', kind: 'entrance' };
  if (tags.amenity === 'parking_space') return { featureType: 'space', kind: 'parking_space' };
  if (tags['parking:left'] || tags['parking:right'] || tags['parking:both']) return { featureType: 'street', kind: 'street' };
  if (tags.parking === 'underground') return { featureType: 'area', kind: 'underground' };
  if (tags.parking === 'multi-storey') return { featureType: 'area', kind: 'multi_storey' };
  if (tags.parking === 'surface') return { featureType: 'area', kind: 'surface' };
  return { featureType: tags.amenity === 'parking' ? 'area' : 'point', kind: 'parking' };
}

function nearestEntrance(point, entrances) {
  let best = null;
  let bestDistance = Infinity;
  for (const entrance of entrances) {
    const value = distanceMeters(point, entrance.point);
    if (value <= 180 && value < bestDistance) { best = entrance; bestDistance = value; }
  }
  return best;
}

function buildFeatures(elements) {
  const entrances = elements
    .filter(element => element?.tags?.amenity === 'parking_entrance')
    .map(element => ({ element, point: pointOf(element) }))
    .filter(item => item.point);

  const candidates = elements.filter(element => element?.tags?.amenity !== 'parking_entrance');
  const features = candidates.map(element => {
    const tags = element.tags || {};
    const classification = classify(tags);
    const point = pointOf(element);
    if (!point) return null;
    const geometry = geometryOf(element, classification.featureType);
    if (!geometry) return null;
    const entrance = nearestEntrance(point, entrances);
    return {
      externalId: `${element.type}/${element.id}`,
      featureType: classification.featureType,
      name: tags.name || tags.operator || null,
      kind: classification.kind,
      geometry,
      representativePoint: { type: 'Point', coordinates: [point.lon, point.lat] },
      vehicleEntrance: entrance ? { type: 'Point', coordinates: [entrance.point.lon, entrance.point.lat] } : null,
      access: tags.access || null,
      capacity: parseInteger(tags.capacity),
      fee: tags.fee || null,
      covered: ['underground', 'multi_storey'].includes(classification.kind) || boolTag(tags.covered),
      lit: boolTag(tags.lit),
      surveillance: boolTag(tags.surveillance) ?? (tags['surveillance:type'] ? true : null),
      tags,
      sourceUpdatedAt: element.timestamp || null
    };
  }).filter(Boolean);

  return features;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.scope || !args.bbox || !args.out) {
    console.error('Usage: node scripts/build-osm-parking-batch.cjs --scope bg:sliven --bbox west,south,east,north --out data/sliven.json [--revision value]');
    process.exitCode = 2;
    return;
  }
  if (!/^[a-zA-Z0-9._:-]{2,120}$/.test(args.scope)) throw new Error('Invalid --scope');
  const bbox = parseBbox(args.bbox);
  const revision = String(args.revision || new Date().toISOString());
  const { elements, endpoint } = await queryOverpass(overpassQuery(bbox));
  const features = buildFeatures(elements);
  const batch = {
    source: 'osm',
    scopeKey: args.scope,
    revision,
    bbox: bboxPolygon(bbox),
    sourceUpdatedAt: new Date().toISOString(),
    features
  };
  const output = path.resolve(process.cwd(), args.out);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ output, endpoint, rawElements: elements.length, features: features.length, revision }, null, 2));
}

if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { parseBbox, bboxPolygon, overpassQuery, pointOf, geometryOf, classify, buildFeatures, distanceMeters };
