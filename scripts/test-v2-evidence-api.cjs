'use strict';

const assert = require('assert');
const { createEvidenceToken, verifyEvidenceToken } = require('../api/v2/_evidence-token');
const endpoint = require('../api/v2/evidence-upload-token');

process.env.EVIDENCE_TOKEN_SECRET = 'test-secret-that-is-at-least-thirty-two-bytes-long';

const now = Date.UTC(2026, 6, 15, 18, 0, 0);
const token = createEvidenceToken({
  userId: 'user-123',
  path: 'user-123/photo.webp',
  contentType: 'image/webp',
  maxBytes: 1024,
  now,
  ttlSeconds: 600
});

const verified = verifyEvidenceToken(token, { userId: 'user-123', now: now + 1000 });
assert.equal(verified.path, 'user-123/photo.webp');
assert.equal(verified.contentType, 'image/webp');
assert.equal(verified.maxBytes, 1024);
assert.equal(verifyEvidenceToken(token, { userId: 'other-user', now: now + 1000 }), null);
assert.equal(verifyEvidenceToken(token, { userId: 'user-123', now: now + 601000 }), null);
assert.equal(verifyEvidenceToken(`${token}x`, { userId: 'user-123', now: now + 1000 }), null);

assert.deepEqual(endpoint._test.normalize({ contentType: 'image/jpeg', sizeBytes: 2048 }), {
  contentType: 'image/jpeg', sizeBytes: 2048, extension: 'jpg'
});
assert.equal(endpoint._test.normalize({ contentType: 'image/gif', sizeBytes: 2048 }).error, 'unsupported_content_type');
assert.equal(endpoint._test.normalize({ contentType: 'image/png', sizeBytes: 0 }).error, 'invalid_file_size');
assert.equal(endpoint._test.normalize({ contentType: 'image/png', sizeBytes: endpoint._test.MAX_BYTES + 1 }).error, 'invalid_file_size');

console.log('SmartCity V2 evidence upload contract: OK');
