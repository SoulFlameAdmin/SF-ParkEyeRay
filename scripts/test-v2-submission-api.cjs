'use strict';

const assert = require('node:assert/strict');
const handler = require('../api/v2/parking-proposals.js');
const { normalizePayload, validatePolygon, getBearer } = handler._test;

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, value) { this.headers[String(key).toLowerCase()] = value; },
    end(value) { this.body = String(value || ''); }
  };
}

function validPayload() {
  return {
    clientSubmissionId: 'proposal-contract-001',
    name: 'Community parking proposal',
    geometry: {
      type: 'Polygon',
      coordinates: [[[25.63, 42.43], [25.64, 42.43], [25.64, 42.44], [25.63, 42.43]]]
    },
    vehicleEntrance: { type: 'Point', coordinates: [25.631, 42.431] },
    pedestrianExit: null,
    access: 'public',
    capacity: 24,
    fee: 'no',
    openingHours: '24/7',
    evidence: { note: 'Visible marked parking spaces.', capturedAt: '2026-07-15T17:00:00Z', uploadToken: null }
  };
}

(async () => {
  const payload = validPayload();
  assert.equal(validatePolygon(payload.geometry), true);
  assert.deepEqual(normalizePayload(payload).errors, []);
  assert.equal(normalizePayload({ ...payload, geometry: { type: 'Polygon', coordinates: [[[1, 1], [2, 1], [2, 2], [9, 9]]] } }).errors.includes('invalid_geometry'), true);
  assert.equal(getBearer({ headers: { authorization: 'Bearer test-token' } }), 'test-token');

  const unauthenticated = responseRecorder();
  await handler({ method: 'POST', headers: {}, socket: {}, body: payload }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(JSON.parse(unauthenticated.body).error, 'authentication_required');

  const invalid = responseRecorder();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer contract-token', 'x-forwarded-for': '203.0.113.9' },
    socket: {},
    body: { ...payload, name: '', evidence: { note: '', uploadToken: null } }
  }, invalid);
  assert.equal(invalid.statusCode, 400);
  const invalidBody = JSON.parse(invalid.body);
  assert.equal(invalidBody.error, 'invalid_submission');
  assert.equal(invalidBody.details.includes('invalid_name'), true);
  assert.equal(invalidBody.details.includes('evidence_required'), true);

  const previousFetch = global.fetch;
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-contract-key';

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: '11111111-1111-1111-1111-111111111111' }), { status: 200 });
    if (url.includes('/rest/v1/parking_zones?source=eq.soulflame')) return new Response('[]', { status: 200 });
    if (url.includes('/rest/v1/parking_zones?select=')) {
      return new Response(JSON.stringify([{ id: '22222222-2222-2222-2222-222222222222', status: 'pending_soulflame', created_at: '2026-07-15T17:00:00Z' }]), { status: 201 });
    }
    if (url.endsWith('/rest/v1/parking_evidence')) return new Response('', { status: 201 });
    throw new Error(`Unexpected URL ${url}`);
  };

  const created = responseRecorder();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer valid-contract-token', 'x-forwarded-for': '203.0.113.10' },
    socket: {},
    body: payload
  }, created);
  assert.equal(created.statusCode, 201);
  const createdBody = JSON.parse(created.body);
  assert.equal(createdBody.status, 'pending_soulflame');
  assert.equal(createdBody.idempotent, false);
  const zoneCall = calls.find(call => call.url.includes('/rest/v1/parking_zones?select='));
  const zoneBody = JSON.parse(zoneCall.options.body);
  assert.equal(zoneBody.source, 'soulflame');
  assert.equal(zoneBody.status, 'pending_soulflame');
  assert.equal(zoneBody.verified_by, undefined);
  assert.equal(zoneBody.verified_at, undefined);

  global.fetch = previousFetch;
  if (previousUrl == null) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
  if (previousKey == null) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousKey;

  console.log('SmartCity V2 submission API contract smoke passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
