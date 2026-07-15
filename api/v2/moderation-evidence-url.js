'use strict';

const { send, requireModerator, serviceRequest } = require('./_moderation-auth');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TTL_SECONDS = 120;

function normalizeRequest(body = {}) {
  const proposalId = String(body.proposalId || '').trim();
  const evidenceId = String(body.evidenceId || '').trim();
  const requestedTtl = Number.parseInt(body.expiresIn, 10);
  const expiresIn = Number.isFinite(requestedTtl)
    ? Math.max(30, Math.min(MAX_TTL_SECONDS, requestedTtl))
    : 60;
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

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }

  try {
    const auth = requireModerator(req);
    if (!auth) return send(res, 403, { error: 'moderator_access_denied' });

    const normalized = normalizeRequest(req.body || {});
    if (normalized.errors.length) {
      return send(res, 400, { error: 'invalid_request', details: normalized.errors });
    }

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

    const signedResult = await serviceRequest(
      auth,
      `/storage/v1/object/sign/parking-evidence/${encodeStoragePath(storagePath)}`,
      { method: 'POST', body: { expiresIn } }
    );
    if (!signedResult.response.ok || !signedResult.data?.signedURL) {
      console.error('moderation evidence signing failed', signedResult.data);
      return send(res, 502, { error: 'evidence_signing_failed', retryable: true });
    }

    const signedURL = String(signedResult.data.signedURL);
    const url = signedURL.startsWith('http') ? signedURL : `${auth.url}/storage/v1${signedURL}`;
    return send(res, 200, {
      evidenceId,
      proposalId,
      expiresIn,
      url,
      cacheable: false
    });
  } catch (error) {
    if (error.code === 'MODERATION_NOT_CONFIGURED') {
      return send(res, 503, { error: 'moderation_service_not_configured', retryable: true });
    }
    console.error('moderation evidence endpoint failed', error);
    return send(res, 502, { error: 'moderation_evidence_service_failed', retryable: true });
  }
}

module.exports = handler;
module.exports._test = { normalizeRequest, safeStoragePath, encodeStoragePath, MAX_TTL_SECONDS };
