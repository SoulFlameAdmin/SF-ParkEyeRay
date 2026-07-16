'use strict';

const crypto = require('crypto');
const { createEvidenceToken } = require('../../server/v2/evidence-token');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function supabase(path, { token, method = 'GET', body, serviceRole = false } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = serviceRole ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    const error = new Error('supabase_not_configured');
    error.code = 'SUPABASE_NOT_CONFIGURED';
    throw error;
  }
  const response = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${serviceRole ? key : token}`,
      'content-type': 'application/json'
    },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  return { response, data };
}

async function getUser(token) {
  const { response, data } = await supabase('/auth/v1/user', { token });
  return response.ok && data?.id ? data : null;
}

function normalize(body) {
  const contentType = String(body?.contentType || '').toLowerCase();
  const sizeBytes = Number(body?.sizeBytes);
  const extension = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : '';
  if (!ALLOWED_TYPES.has(contentType)) return { error: 'unsupported_content_type' };
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_BYTES) return { error: 'invalid_file_size' };
  return { contentType, sizeBytes, extension };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const token = bearer(req);
  if (!token) return send(res, 401, { error: 'authentication_required' });
  const input = normalize(req.body);
  if (input.error) return send(res, 400, { error: input.error });

  try {
    const user = await getUser(token);
    if (!user) return send(res, 401, { error: 'invalid_authentication' });

    const objectId = crypto.randomUUID();
    const path = `${user.id}/${objectId}.${input.extension}`;
    const signed = await supabase('/storage/v1/object/upload/sign/parking-evidence', {
      serviceRole: true,
      method: 'POST',
      body: { path }
    });
    if (!signed.response.ok || !signed.data?.url) {
      console.error('evidence signed upload creation failed', signed.data);
      return send(res, 502, { error: 'upload_token_creation_failed', retryable: true });
    }

    const uploadToken = createEvidenceToken({
      userId: user.id,
      path,
      contentType: input.contentType,
      maxBytes: input.sizeBytes
    });
    return send(res, 201, {
      bucket: 'parking-evidence',
      path,
      signedUploadUrl: signed.data.url,
      uploadToken,
      expiresIn: 600,
      maxBytes: input.sizeBytes,
      contentType: input.contentType
    });
  } catch (error) {
    if (error.code === 'SUPABASE_NOT_CONFIGURED' || error.code === 'EVIDENCE_TOKEN_SECRET_NOT_CONFIGURED') {
      return send(res, 503, { error: 'evidence_service_not_configured', retryable: true });
    }
    console.error('evidence upload token failed', error);
    return send(res, 502, { error: 'evidence_service_failed', retryable: true });
  }
}

module.exports = handler;
module.exports._test = { normalize, bearer, ALLOWED_TYPES, MAX_BYTES };