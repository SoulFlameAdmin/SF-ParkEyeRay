'use strict';

const { send, requireModerator, serviceRequest } = require('./_moderation-auth');

const ACTIONS = new Map([
  ['approve', 'approved'],
  ['reject', 'rejected'],
  ['request_changes', 'changes_requested']
]);

function normalizeBody(body) {
  const proposalId = String(body?.proposalId || '').trim();
  const action = String(body?.action || '').trim();
  const reason = String(body?.reason || '').trim();
  const nextStatus = ACTIONS.get(action) || null;
  const errors = [];

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(proposalId)) errors.push('invalid_proposal_id');
  if (!nextStatus) errors.push('invalid_action');
  if (nextStatus && nextStatus !== 'approved' && reason.length < 3) errors.push('reason_required');
  if (reason.length > 1000) errors.push('reason_too_long');

  return { errors, value: { proposalId, action, nextStatus, reason: reason || null } };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(res, 405, { error: 'method_not_allowed' });
  }

  const parsed = normalizeBody(req.body);
  if (parsed.errors.length) return send(res, 400, { error: 'invalid_moderation_request', details: parsed.errors });

  try {
    const auth = requireModerator(req);
    if (!auth) return send(res, 403, { error: 'moderator_access_denied' });

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
    return send(res, 200, {
      proposal: row,
      action: parsed.value.action,
      published: row?.status === 'approved'
    });
  } catch (error) {
    if (error.code === 'MODERATION_NOT_CONFIGURED') {
      return send(res, 503, { error: 'moderation_service_not_configured', retryable: true });
    }
    console.error('moderation endpoint failed', error);
    return send(res, 502, { error: 'moderation_service_failed', retryable: true });
  }
}

module.exports = handler;
module.exports._test = { normalizeBody, ACTIONS };
