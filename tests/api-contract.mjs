import assert from 'node:assert/strict';
import routeHandler from '../api/route.js';
import geocodeHandler from '../api/geocode.js';

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

async function run(handler, req) {
  const res = mockResponse();
  await handler(req, res);
  return res;
}

{
  const res = await run(routeHandler, { method: 'POST', query: {} });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET');
}

{
  const res = await run(routeHandler, {
    method: 'GET',
    query: { fromLat: 'bad', fromLon: '23.3', toLat: '42.7', toLon: '23.4' }
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, 'Invalid coordinates');
}

{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('provider offline in contract test'); };
  try {
    const res = await run(routeHandler, {
      method: 'GET',
      query: {
        fromLat: '42.6977', fromLon: '23.3219',
        toLat: '42.7005', toLon: '23.3301', mode: 'walking'
      }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.ok, true);
    assert.equal(res.payload.mode, 'walking');
    assert.equal(res.payload.source, 'estimate');
    assert.equal(res.payload.isEstimate, true);
    assert.ok(res.payload.distance > 0);
    assert.ok(res.payload.duration > 0);
    assert.equal(res.payload.geometry.type, 'LineString');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const res = await run(geocodeHandler, { method: 'POST', query: {} });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET');
}

{
  const res = await run(geocodeHandler, { method: 'GET', query: { q: 'a' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, 'Invalid search query');
}

console.log('API contract checks passed');
