const assert = require('node:assert/strict');
const fs = require('node:fs');

const moderation = require('../api/v2/moderate-parking-proposal.js')._test;
const list = require('../api/v2/moderation-proposals.js')._test;
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

const sql = fs.readFileSync('supabase/migrations/20260715233000_soulflame_moderation_api.sql', 'utf8');
assert.match(sql, /auth\.role\(\) <> 'service_role'/);
assert.match(sql, /current_zone\.status <> 'pending_soulflame'/);
assert.match(sql, /insert into public\.parking_moderation_events/);
assert.match(sql, /grant execute[\s\S]*to service_role/i);
assert.match(sql, /revoke update, delete, truncate/i);

console.log('V2 moderation API contracts OK');
