'use strict';

const assert = require('node:assert/strict');
const parkingHandler = require('../api/v2/parkings.js');
const parking = parkingHandler._test;
const importer = require('./import-osm-parking.cjs');
const builder = require('./build-osm-parking-batch.cjs');

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) { this.headers[String(key).toLowerCase()] = value; },
    end(value) { this.body = value ? JSON.parse(value) : null; }
  };
}

async function invoke(query) {
  const req = { method: 'GET', query, headers: {} };
  const res = responseMock();
  await parkingHandler(req, res);
  return res;
}

function overpassPayload() {
  return {
    elements: [
      {
        type: 'way', id: 100,
        center: { lat: 42.4385, lon: 25.6310 },
        geometry: [
          { lat: 42.4384, lon: 25.6309 }, { lat: 42.4386, lon: 25.6309 },
          { lat: 42.4386, lon: 25.6311 }, { lat: 42.4384, lon: 25.6309 }
        ],
        tags: { amenity: 'parking', name: 'Паркинг Мол Галерия', parking: 'surface', capacity: '120', fee: 'no' },
        timestamp: '2026-07-15T20:00:00Z'
      },
      {
        type: 'node', id: 101, lat: 42.43855, lon: 25.63105,
        tags: { amenity: 'parking_entrance' },
        timestamp: '2026-07-15T20:00:00Z'
      },
      {
        type: 'way', id: 102,
        center: { lat: 42.4390, lon: 25.6320 },
        tags: { amenity: 'parking_space', name: 'Достъпни места' }
      }
    ]
  };
}

async function run() {
  assert.deepEqual(parking.parseInput({ lat: '42.6', lon: '26.3', radius: '1000', limit: '80' }).errors, []);
  assert.ok(parking.parseInput({ lat: '90', lon: '26.3', radius: '20' }).errors.length >= 2);
  assert.match(parking.buildOverpassQuery({ lat: 42.6, lon: 26.3, radius: 500 }), /parking_space/);
  assert.match(parking.buildOverpassQuery({ lat: 42.6, lon: 26.3, radius: 500 }), /parking_entrance/);
  assert.match(parking.buildOverpassQuery({ lat: 42.6, lon: 26.3, radius: 500 }), /parking:\(left\|right\|both\)/);

  const normalized = parking.normalizeOverpass(overpassPayload().elements, { lat: 42.438, lon: 25.631 });
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].source, 'osm');
  assert.equal(normalized[0].capacity, 120);
  assert.notDeepEqual(normalized[0].entrance, normalized[0].point);
  assert.equal(normalized[0].dataOrigin, 'overpass-fallback');

  const merged = parking.mergeParkingRecords([
    {
      id: 'osm:way/1', source: 'osm', externalId: 'way/1', name: 'Паркинг пред блока',
      point: { lat: 42.1, lon: 25.1 }, entrance: { lat: 42.1, lon: 25.1 }, distance: 100,
      verificationStatus: 'mapped', dataOrigin: 'postgis', sourceRefs: ['osm:way/1']
    },
    {
      id: 'soulflame:a', source: 'soulflame', externalId: 'a', name: 'Паркинг пред блока',
      point: { lat: 42.10002, lon: 25.10002 }, entrance: { lat: 42.10003, lon: 25.10003 }, distance: 102,
      verificationStatus: 'approved', dataOrigin: 'postgis', sourceRefs: ['soulflame:a'], capacity: 14
    }
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, 'soulflame');
  assert.equal(merged[0].verificationStatus, 'approved');
  assert.deepEqual(merged[0].sourceRefs.sort(), ['osm:way/1', 'soulflame:a']);

  const bbox = builder.parseBbox('26.20,42.60,26.40,42.80');
  assert.equal(builder.bboxPolygon(bbox).type, 'Polygon');
  assert.match(builder.overpassQuery(bbox), /out center tags geom meta/);
  const built = builder.buildFeatures(overpassPayload().elements);
  assert.equal(built.length, 2);
  assert.equal(built[0].externalId, 'way/100');
  assert.equal(built[0].geometry.type, 'Polygon');
  assert.equal(built[0].vehicleEntrance.type, 'Point');
  assert.equal(built[0].sourceUpdatedAt, '2026-07-15T20:00:00Z');
  assert.equal(builder.classify({ 'parking:left': 'lane' }).featureType, 'street');

  const batch = {
    source: 'osm', scopeKey: 'bg:sliven', revision: '2026-07-15T22:30:00Z',
    bbox: builder.bboxPolygon(bbox),
    features: built
  };
  assert.deepEqual(importer.validateBatch(batch), []);
  const rows = importer.normalizeRows(batch, '00000000-0000-0000-0000-000000000001');
  assert.equal(rows[0].source_revision, batch.revision);
  assert.equal(rows[0].scope_key, 'bg:sliven');
  assert.equal(rows[0].is_active, true);
  assert.equal(rows[0].vehicle_entrance.type, 'Point');

  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_ANON_KEY;

  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    global.fetch = async () => ({ ok: true, status: 200, json: async () => overpassPayload() });
    const fallbackResponse = await invoke({ lat: '42.438', lon: '25.631', radius: '1000', limit: '80' });
    assert.equal(fallbackResponse.statusCode, 200);
    assert.equal(fallbackResponse.body.meta.dataSource, 'overpass-fallback');
    assert.equal(fallbackResponse.body.meta.fallbackUsed, true);
    assert.equal(fallbackResponse.body.meta.liveOccupancy, false);
    assert.equal(fallbackResponse.body.parkings.length, 2);

    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-test';
    let calls = 0;
    global.fetch = async url => {
      calls += 1;
      assert.match(String(url), /rpc\/search_parking_features/);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([{
          source: 'soulflame', external_id: 'approved-1', name: 'Одобрена зона', kind: 'community_zone',
          latitude: 42.4384, longitude: 25.6311, entrance_latitude: 42.43845, entrance_longitude: 25.63115,
          distance_m: 45, access: 'public', capacity: 18, fee: 'no', covered: null, lit: true,
          surveillance: null, verification_status: 'approved', source_updated_at: '2026-07-15T20:00:00Z',
          source_revision: null, tags: {}
        }])
      };
    };
    const databaseResponse = await invoke({ lat: '42.438', lon: '25.631', radius: '1000', limit: '80' });
    assert.equal(databaseResponse.statusCode, 200);
    assert.equal(databaseResponse.body.meta.dataSource, 'postgis');
    assert.equal(databaseResponse.body.meta.fallbackUsed, false);
    assert.equal(databaseResponse.body.parkings[0].verificationStatus, 'approved');
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl == null) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey == null) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = originalKey;
  }

  console.log('SmartCity V2 parking engine contracts: OK');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
