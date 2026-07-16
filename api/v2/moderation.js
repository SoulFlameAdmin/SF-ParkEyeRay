'use strict';

const { send, requireModerator, serviceRequest } = require('../../server/v2/moderation-auth');

const ACTIONS = new Map([
  ['approve', 'approved'],
  ['reject', 'rejected'],
  ['request_changes', 'changes_requested']
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TTL_SECONDS = 120;

function clampLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 25;
  return Math.max(1, Math.min(100, parsed));
}

function normalizeBody(body) {
  const proposalId = String(body?.proposalId || '').trim();
  const action = String(body?.action || '').trim();
  const reason = String(body?.reason || '').trim();
  const nextStatus = ACTIONS.get(action) || null;
  const errors = [];
  if (!UUID_RE.test(proposalId)) errors.push('invalid_proposal_id');
  if (!nextStatus) errors.push('invalid_action');
  if (nextStatus && nextStatus !== 'approved' && reason.length < 3) errors.push('reason_required');
  if (reason.length > 1000) errors.push('reason_too_long');
  return { errors, value: { proposalId, action, nextStatus, reason: reason || null } };
}

function normalizeRequest(body = {}) {
  const proposalId = String(body.proposalId || '').trim();
  const evidenceId = String(body.evidenceId || '').trim();
  const requestedTtl = Number.parseInt(body.expiresIn, 10);
  const expiresIn = Number.isFinite(requestedTtl) ? Math.max(30, Math.min(MAX_TTL_SECONDS, requestedTtl)) : 60;
  const errors = [];
  if (!UUID_RE.test(proposalId)) errors.push('proposal_id_invalid');
  if (!UUID_RE.test(evidenceId)) errors.push('evidence_id_invalid');
  return { errors, value: { proposalId, evidenceId, expiresIn } };
}

function safeStoragePath(value) {
  const path = String(value || '').trim();
  if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\')) return null;
  const parts = path.split('/');
  if (parts.length < 2 || parts.some(part => !part || part === '.' || part === '..')) return null;
  return parts.join('/');
}

function encodeStoragePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function proposals(req, res, auth) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const proposalId = String(req.query?.id || '').trim();
  const limit = clampLimit(req.query?.limit);
  const path = proposalId
    ? `/rest/v1/parking_zones?id=eq.${encodeURIComponent(proposalId)}&source=eq.soulflame&select=id,name,status,geometry,vehicle_entrance,pedestrian_exit,access,capacity,fee,opening_hours,created_by,created_at,updated_at,parking_evidence(id,storage_path,note,captured_at,created_at),parking_moderation_events(id,action,from_status,to_status,reason,actor_id,created_at)&limit=1`
    : `/rest/v1/parking_zones?source=eq.soulflame&status=eq.pending_soulflame&select=id,name,status,access,capacity,created_by,created_at,updated_at&order=created_at.asc&limit=${limit}`;
  const result = await serviceRequest(auth, path);
  if (!result.response.ok) {
    console.error('moderation proposal read failed', result.data);
    return send(res, 502, { error: 'moderation_read_failed', retryable: true });
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  if (proposalId && !rows[0]) return send(res, 404, { error: 'proposal_not_found' });
  return send(res, 200, proposalId ? { proposal: rows[0] } : { proposals: rows, count: rows.length });
}

async function transition(req, res, auth) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const parsed = normalizeBody(req.body);
  if (parsed.errors.length) return send(res, 400, { error: 'invalid_moderation_request', details: parsed.errors });
  const result = await serviceRequest(auth, '/rest/v1/rpc/moderate_parking_proposal', {
    method: 'POST',
    body: {
      proposal_id: parsed.value.proposalId,
      next_status: parsed.value.nextStatus,
      moderator_id: auth.moderatorId,
      moderation_reason: parsed.value.reason
    }
  });
  if (!result.response.ok) {
    const message = String(result.data?.message || '');
    if (/not found/i.test(message)) return send(res, 404, { error: 'proposal_not_found' });
    if (/not pending/i.test(message)) return send(res, 409, { error: 'proposal_not_pending' });
    console.error('moderation transition failed', result.data);
    return send(res, 502, { error: 'moderation_transition_failed', retryable: true });
  }
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return send(res, 200, { proposal: row, action: parsed.value.action, published: row?.status === 'approved' });
}

async function evidenceUrl(req, res, auth) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const normalized = normalizeRequest(req.body || {});
  if (normalized.errors.length) return send(res, 400, { error: 'invalid_request', details: normalized.errors });
  const { proposalId, evidenceId, expiresIn } = normalized.value;
  const evidencePath = `/rest/v1/parking_evidence?id=eq.${encodeURIComponent(evidenceId)}&parking_zone_id=eq.${encodeURIComponent(proposalId)}&select=id,storage_path,parking_zone_id&limit=1`;
  const evidenceResult = await serviceRequest(auth, evidencePath);
  if (!evidenceResult.response.ok) {
    console.error('moderation evidence lookup failed', evidenceResult.data);
    return send(res, 502, { error: 'evidence_lookup_failed', retryable: true });
  }
  const evidence = Array.isArray(evidenceResult.data) ? evidenceResult.data[0] : null;
  if (!evidence) return send(res, 404, { error: 'evidence_not_found' });
  const storagePath = safeStoragePath(evidence.storage_path);
  if (!storagePath) return send(res, 409, { error: 'evidence_path_invalid' });
  const signedResult = await serviceRequest(auth, `/storage/v1/object/sign/parking-evidence/${encodeStoragePath(storagePath)}`, {
    method: 'POST', body: { expiresIn }
  });
  if (!signedResult.response.ok || !signedResult.data?.signedURL) {
    console.error('moderation evidence signing failed', signedResult.data);
    return send(res, 502, { error: 'evidence_signing_failed', retryable: true });
  }
  const signedURL = String(signedResult.data.signedURL);
  const url = signedURL.startsWith('http') ? signedURL : `${auth.url}/storage/v1${signedURL}`;
  return send(res, 200, { evidenceId, proposalId, expiresIn, url, cacheable: false });
}

async function handler(req, res) {
  const operation = String(req.query?.operation || '').trim();
  try {
    const auth = requireModerator(req);
    if (!auth) return send(res, 403, { error: 'moderator_access_denied' });
    if (operation === 'proposals') return proposals(req, res, auth);
    if (operation === 'transition') return transition(req, res, auth);
    if (operation === 'evidence-url') return evidenceUrl(req, res, auth);
    return send(res, 404, { error: 'unknown_moderation_operation' });
  } catch (error) {
    if (error.code === 'MODERATION_NOT_CONFIGURED') {
      return send(res, 503, { error: 'moderation_service_not_configured', retryable: true });
    }
    console.error('moderation service failed', operation, error);
    return send(res, 502, { error: 'moderation_service_failed', retryable: true });
  }
}

module.exports = handler;
module.exports._test = {
  ACTIONS, MAX_TTL_SECONDS, clampLimit, normalizeBody, normalizeRequest,
  safeStoragePath, encodeStoragePath
};