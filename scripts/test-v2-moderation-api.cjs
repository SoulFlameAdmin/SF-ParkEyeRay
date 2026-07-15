const assert = require('node:assert/strict');
const fs = require('node:fs');

const moderation = require('../api/v2/moderate-parking-proposal.js')._test;
const list = require('../api/v2/moderation-proposals.js')._test;
const evidence = require('../api/v2/moderation-evidence-url.js')._test;
const auth = require('../api/v2/_moderation-auth.js');

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
assert.equal(list.clampLimit('999'), 100);
assert.equal(list.clampLimit('0'), 1);
assert.equal(auth.safeEqual('secret', 'secret'), true);
assert.equal(auth.safeEqual('secret', 'wrong'), false);

const validEvidence = evidence.normalizeRequest({
  proposalId: '123e4567-e89b-42d3-a456-426614174000',
  evidenceId: '123e4567-e89b-42d3-a456-426614174001',
  expiresIn: 999
});
assert.deepEqual(validEvidence.errors, []);
assert.equal(validEvidence.value.expiresIn, evidence.MAX_TTL_SECONDS);
assert.equal(evidence.safeStoragePath('123e4567-e89b-42d3-a456-426614174000/photo.webp'), '123e4567-e89b-42d3-a456-426614174000/photo.webp');
assert.equal(evidence.safeStoragePath('../service-role-secret'), null);
assert.equal(evidence.safeStoragePath('/absolute/path.jpg'), null);
assert.equal(evidence.safeStoragePath('owner\\photo.jpg'), null);
assert.equal(evidence.encodeStoragePath('owner/photo 1.webp'), 'owner/photo%201.webp');

const invalidEvidence = evidence.normalizeRequest({ proposalId: 'bad', evidenceId: 'also-bad' });
assert.ok(invalidEvidence.errors.includes('proposal_id_invalid'));
assert.ok(invalidEvidence.errors.includes('evidence_id_invalid'));

const sql = fs.readFileSync('supabase/migrations/20260715233000_soulflame_moderation_api.sql', 'utf8');
assert.match(sql, /auth\.role\(\) <> 'service_role'/);
assert.match(sql, /current_zone\.status <> 'pending_soulflame'/);
assert.match(sql, /insert into public\.parking_moderation_events/);
assert.match(sql, /grant execute[\s\S]*to service_role/i);
assert.match(sql, /revoke update, delete, truncate/i);

const signedEndpoint = fs.readFileSync('api/v2/moderation-evidence-url.js', 'utf8');
assert.match(signedEndpoint, /parking_zone_id=eq\./);
assert.match(signedEndpoint, /object\/sign\/parking-evidence/);
assert.match(signedEndpoint, /cacheable: false/);
assert.doesNotMatch(signedEndpoint, /SUPABASE_SERVICE_ROLE_KEY[^\n]*url/);

console.log('V2 moderation API contracts OK');
