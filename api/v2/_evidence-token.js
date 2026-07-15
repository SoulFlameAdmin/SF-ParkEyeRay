'use strict';

const crypto = require('crypto');
const TOKEN_VERSION = 1;
const DEFAULT_TTL_SECONDS = 10 * 60;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function secret() {
  const value = process.env.EVIDENCE_TOKEN_SECRET;
  if (!value || value.length < 32) {
    const error = new Error('evidence_token_secret_not_configured');
    error.code = 'EVIDENCE_TOKEN_SECRET_NOT_CONFIGURED';
    throw error;
  }
  return value;
}

function signPart(encoded) {
  return crypto.createHmac('sha256', secret()).update(encoded).digest('base64url');
}

function createEvidenceToken({ userId, path, contentType, maxBytes, now = Date.now(), ttlSeconds = DEFAULT_TTL_SECONDS }) {
  const payload = {
    v: TOKEN_VERSION,
    sub: userId,
    path,
    contentType,
    maxBytes,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ttlSeconds
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${signPart(encoded)}`;
}

function verifyEvidenceToken(token, { userId, now = Date.now() } = {}) {
  const [encoded, signature, extra] = String(token || '').split('.');
  if (!encoded || !signature || extra) return null;
  const expected = signPart(encoded);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;

  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { return null; }
  if (payload.v !== TOKEN_VERSION || !payload.sub || !payload.path || !payload.contentType) return null;
  if (!Number.isInteger(payload.maxBytes) || payload.maxBytes < 1) return null;
  if (!Number.isInteger(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;
  if (userId && payload.sub !== userId) return null;
  return payload;
}

module.exports = { createEvidenceToken, verifyEvidenceToken, DEFAULT_TTL_SECONDS };
