'use strict';

const assert = require('node:assert/strict');
const handler = require('../api/v2/nearby.js');
const api = handler._test;

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
  const req = { method: 'GET', query };
  const res = responseMock();
  await handler(req, res);
  return res;
}

async function run() {
  assert.deepEqual(api.parseInput({ type: 'fuel', lat: '42.68', lon: '26.32', radius: '7000', limit: '50' }).errors, []);
  assert.ok(api.parseInput({ type: 'unknown', lat: '90', lon: '26.32', radius: '10' }).errors.length >= 3);
  assert.match(api.queryFor({ type: 'fuel', lat: 42.68, lon: 26.32, radius: 7000 }), /amenity\"=\"fuel/);

  const elements = [
    { type: 'node', id: 1, lat: 42.681, lon: 26.321, tags: { amenity: 'fuel', name: 'Тест Ойл', brand: 'TestOil', opening_hours: '24/7', 'fuel:diesel': 'yes' } },
    { type: 'way', id: 2, center: { lat: 42.690, lon: 26.330 }, tags: { amenity: 'fuel', operator: 'Друг оператор', self_service: 'yes' } }
  ];
  const normalized = api.normalize(elements, { type: 'fuel', lat: 42.68, lon: 26.32, limit: 80 });
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].name, 'Тест Ойл');
  assert.equal(normalized[0].brand, 'TestOil');
  assert.deepEqual(normalized[0].fuelTypes, ['diesel']);
  assert.equal(normalized[1].selfService, true);

  const originalFetch = global.fetch;
  try {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ elements }) });
    const response = await invoke({ type: 'fuel', lat: '42.68', lon: '26.32', radius: '7000', limit: '80' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.meta.type, 'fuel');
    assert.equal(response.body.meta.liveStatus, false);
    assert.equal(response.body.places.length, 2);
  } finally {
    global.fetch = originalFetch;
  }

  console.log('SmartCity V2 nearby layers: OK');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
