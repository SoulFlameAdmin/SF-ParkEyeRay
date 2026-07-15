'use strict';

const { verifyEvidenceToken } = require('./_evidence-token');

const STATUS = 'pending_soulflame';
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const buckets = new Map();

function send(res, statusCode, payload, headers = {}) {
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getBearer(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function rateKey(req, token) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return `${forwarded || req.socket?.remoteAddress || 'unknown'}:${token.slice(-16)}`;
}

function consumeRateLimit(key, now = Date.now()) {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt: now + WINDOW_MS };
  }
  current.count += 1;
  return { allowed: current.count <= MAX_REQUESTS, remaining: Math.max(0, MAX_REQUESTS - current.count), resetAt: current.resetAt };
}

function isFinitePair(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function validatePolygon(geometry) {
  if (!geometry || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) return false;
  const ring = geometry.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(isFinitePair)) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function validatePoint(point) {
  return point == null || (point.type === 'Point' && isFinitePair(point.coordinates));
}

function normalizePayload(body) {
  const errors = [];
  const clientSubmissionId = String(body?.clientSubmissionId || '').trim();
  const name = String(body?.name || '').trim();
  const access = String(body?.access || 'unknown').trim();
  const evidenceNote = String(body?.evidence?.note || '').trim();
  const uploadToken = String(body?.evidence?.uploadToken || '').trim() || null;

  if (!/^[a-zA-Z0-9_-]{3,120}$/.test(clientSubmissionId)) errors.push('invalid_client_submission_id');
  if (name.length < 2 || name.length > 160) errors.push('invalid_name');
  if (!validatePolygon(body?.geometry)) errors.push('invalid_geometry');
  if (!validatePoint(body?.vehicleEntrance)) errors.push('invalid_vehicle_entrance');
  if (!validatePoint(body?.pedestrianExit)) errors.push('invalid_pedestrian_exit');
  if (body?.capacity != null && (!Number.isInteger(body.capacity) || body.capacity < 1 || body.capacity > 100000)) errors.push('invalid_capacity');
  if (!evidenceNote && !uploadToken) errors.push('evidence_required');

  return {
    errors,
    value: {
      clientSubmissionId,
      name,
      geometry: body?.geometry,
      vehicleEntrance: body?.vehicleEntrance || null,
      pedestrianExit: body?.pedestrianExit || null,
      access: access || 'unknown',
      capacity: body?.capacity ?? null,
      fee: body?.fee || null,
      openingHours: body?.openingHours || null,
      evidence: { note: evidenceNote || null, capturedAt: body?.evidence?.capturedAt || null, uploadToken, upload: null }
    }
  };
}

async function supabaseRequest(path, { token, method = 'GET', body, prefer } = {}) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const error = new Error('supabase_not_configured');
    error.code = 'SUPABASE_NOT_CONFIGURED';
    throw error;
  }
  const headers = { apikey: anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  if (prefer) headers.prefer = prefer;
  const response = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  return { response, data };
}

async function getUser(token) {
  const { response, data } = await supabaseRequest('/auth/v1/user', { token });
  return response.ok && data?.id ? data : null;
}

async function findExisting(token, clientSubmissionId) {
  const query = `/rest/v1/parking_zones?source=eq.soulflame&external_id=eq.${encodeURIComponent(clientSubmissionId)}&select=id,status,created_at&limit=1`;
  const { response, data } = await supabaseRequest(query, { token });
  if (!response.ok) return null;
  return Array.isArray(data) ? data[0] || null : null;
}

async function insertProposal(token, userId, payload) {
  const zone = {
    source: 'soulflame', external_id: payload.clientSubmissionId, name: payload.name,
    geometry: payload.geometry, vehicle_entrance: payload.vehicleEntrance,
    pedestrian_exit: payload.pedestrianExit, access: payload.access, capacity: payload.capacity,
    fee: payload.fee, opening_hours: payload.openingHours, status: STATUS, created_by: userId
  };
  const result = await supabaseRequest('/rest/v1/parking_zones?select=id,status,created_at', {
    token, method: 'POST', body: zone, prefer: 'return=representation'
  });
  if (result.response.status === 409) return findExisting(token, payload.clientSubmissionId);
  if (!result.response.ok) {
    const error = new Error('proposal_insert_failed');
    error.details = result.data;
    throw error;
  }
  const created = Array.isArray(result.data) ? result.data[0] : result.data;
  if (payload.evidence.note || payload.evidence.upload) {
    const evidence = {
      parking_zone_id: created.id,
      storage_path: payload.evidence.upload?.path || null,
      note: payload.evidence.note,
      captured_at: payload.evidence.capturedAt,
      created_by: userId
    };
    const evidenceResult = await supabaseRequest('/rest/v1/parking_evidence', {
      token, method: 'POST', body: evidence, prefer: 'return=minimal'
    });
    if (!evidenceResult.response.ok) {
      const error = new Error('evidence_insert_failed');
      error.details = evidenceResult.data;
      throw error;
    }
  }
  return created;
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const token = getBearer(req);
  if (!token) return send(res, 401, { error: 'authentication_required' });

  const limit = consumeRateLimit(rateKey(req, token));
  const rateHeaders = {
    'x-ratelimit-limit': String(MAX_REQUESTS),
    'x-ratelimit-remaining': String(limit.remaining),
    'x-ratelimit-reset': String(Math.ceil(limit.resetAt / 1000))
  };
  if (!limit.allowed) return send(res, 429, { error: 'rate_limit_exceeded' }, rateHeaders);

  const parsed = normalizePayload(req.body);
  if (parsed.errors.length) return send(res, 400, { error: 'invalid_submission', details: parsed.errors }, rateHeaders);

  try {
    const user = await getUser(token);
    if (!user) return send(res, 401, { error: 'invalid_authentication' }, rateHeaders);
    if (parsed.value.evidence.uploadToken) {
      const upload = verifyEvidenceToken(parsed.value.evidence.uploadToken, { userId: user.id });
      if (!upload || !upload.path.startsWith(`${user.id}/`)) {
        return send(res, 400, { error: 'invalid_evidence_upload_token' }, rateHeaders);
      }
      parsed.value.evidence.upload = upload;
    }

    const existing = await findExisting(token, parsed.value.clientSubmissionId);
    if (existing) return send(res, 200, { id: existing.id, status: existing.status, idempotent: true }, rateHeaders);

    const created = await insertProposal(token, user.id, parsed.value);
    if (!created || created.status !== STATUS) throw new Error('invalid_created_status');
    return send(res, 201, { id: created.id, status: STATUS, idempotent: false }, rateHeaders);
  } catch (error) {
    if (error.code === 'SUPABASE_NOT_CONFIGURED' || error.code === 'EVIDENCE_TOKEN_SECRET_NOT_CONFIGURED') {
      return send(res, 503, { error: 'submission_service_not_configured', retryable: true }, rateHeaders);
    }
    console.error('parking proposal submission failed', error);
    return send(res, 502, { error: 'submission_service_failed', retryable: true }, rateHeaders);
  }
}

module.exports = handler;
module.exports._test = { normalizePayload, validatePolygon, consumeRateLimit, getBearer };
