const assert = require('node:assert/strict');
const fs = require('node:fs');

const moderation = require('../api/v2/moderation.js')._test;
const auth = require('../server/v2/moderation-auth.js');

const approved = moderation.normalizeBody({
  proposalId: '123e4567-e89b-42d3-a456-426614174000',
  action: 'approve'
});
assert.deepEqual(approved.errors, []);
assert.equal(approved.value.nextStatus, 'approved');

const rejected = moderation.normalizeBody({
  proposalId: '123e4567-e89b-42d3-a456-426614174000',
  action: 'reject'
});
assert.ok(rejected.errors.includes('reason_required'));

const changes = moderation.normalizeBody({
  proposalId: '123e4567-e89b-42d3-a456-426614174000',
  action: 'request_changes',
  reason: 'Добавете снимка на входа.'
});
assert.deepEqual(changes.errors, []);
assert.equal(changes.value.nextStatus, 'changes_requested');
assert.equal(moderation.clampLimit('999'), 100);
assert.equal(moderation.clampLimit('0'), 1);
assert.equal(auth.safeEqual('secret', 'secret'), true);
assert.equal(auth.safeEqual('secret', 'wrong'), false);

const validEvidence = moderation.normalizeRequest({
  proposalId: '123e4567-e89b-42d3-a456-426614174000',
  evidenceId: '123e4567-e89b-42d3-a456-426614174001',
  expiresIn: 999
});
assert.deepEqual(validEvidence.errors, []);
assert.equal(validEvidence.value.expiresIn, moderation.MAX_TTL_SECONDS);
assert.equal(moderation.safeStoragePath('123e4567-e89b-42d3-a456-426614174000/photo.webp'), '123e4567-e89b-42d3-a456-426614174000/photo.webp');
assert.equal(moderation.safeStoragePath('../service-role-secret'), null);
assert.equal(moderation.safeStoragePath('/absolute/path.jpg'), null);
assert.equal(moderation.safeStoragePath('owner\\photo.jpg'), null);
assert.equal(moderation.encodeStoragePath('owner/photo 1.webp'), 'owner/photo%201.webp');

const invalidEvidence = moderation.normalizeRequest({ proposalId: 'bad', evidenceId: 'also-bad' });
assert.ok(invalidEvidence.errors.includes('proposal_id_invalid'));
assert.ok(invalidEvidence.errors.includes('evidence_id_invalid'));

const sql = fs.readFileSync('supabase/migrations/20260715233000_soulflame_moderation_api.sql', 'utf8');
assert.match(sql, /auth\.role\(\) <> 'service_role'/);
assert.match(sql, /current_zone\.status <> 'pending_soulflame'/);
assert.match(sql, /insert into public\.parking_moderation_events/);
assert.match(sql, /grant execute[\s\S]*to service_role/i);
assert.match(sql, /revoke update, delete, truncate/i);

const consolidatedEndpoint = fs.readFileSync('api/v2/moderation.js', 'utf8');
assert.match(consolidatedEndpoint, /parking_zone_id=eq\./);
assert.match(consolidatedEndpoint, /object\/sign\/parking-evidence/);
assert.match(consolidatedEndpoint, /cacheable: false/);
assert.match(consolidatedEndpoint, /operation === 'proposals'/);
assert.match(consolidatedEndpoint, /operation === 'transition'/);
assert.match(consolidatedEndpoint, /operation === 'evidence-url'/);
assert.doesNotMatch(consolidatedEndpoint, /SUPABASE_SERVICE_ROLE_KEY[^\n]*url/);

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const rewrites = new Map(vercel.rewrites.map(item => [item.source, item.destination]));
assert.equal(rewrites.get('/api/v2/moderation-proposals'), '/api/v2/moderation?operation=proposals');
assert.equal(rewrites.get('/api/v2/moderate-parking-proposal'), '/api/v2/moderation?operation=transition');
assert.equal(rewrites.get('/api/v2/moderation-evidence-url'), '/api/v2/moderation?operation=evidence-url');

console.log('V2 moderation API contracts OK');