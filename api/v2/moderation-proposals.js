'use strict';

const { send, requireModerator, serviceRequest } = require('./_moderation-auth');

function clampLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 25;
  return Math.max(1, Math.min(100, parsed));
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return send(res, 405, { error: 'method_not_allowed' });
  }

  try {
    const auth = requireModerator(req);
    if (!auth) return send(res, 403, { error: 'moderator_access_denied' });

    const proposalId = String(req.query?.id || '').trim();
    const limit = clampLimit(req.query?.limit);
    let path;

    if (proposalId) {
      path = `/rest/v1/parking_zones?id=eq.${encodeURIComponent(proposalId)}&source=eq.soulflame&select=id,name,status,geometry,vehicle_entrance,pedestrian_exit,access,capacity,fee,opening_hours,created_by,created_at,updated_at,parking_evidence(id,storage_path,note,captured_at,created_at),parking_moderation_events(id,action,from_status,to_status,reason,actor_id,created_at)&limit=1`;
    } else {
      path = `/rest/v1/parking_zones?source=eq.soulflame&status=eq.pending_soulflame&select=id,name,status,access,capacity,created_by,created_at,updated_at&order=created_at.asc&limit=${limit}`;
    }

    const result = await serviceRequest(auth, path);
    if (!result.response.ok) {
      console.error('moderation proposal read failed', result.data);
      return send(res, 502, { error: 'moderation_read_failed', retryable: true });
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    if (proposalId && !rows[0]) return send(res, 404, { error: 'proposal_not_found' });
    return send(res, 200, proposalId ? { proposal: rows[0] } : { proposals: rows, count: rows.length });
  } catch (error) {
    if (error.code === 'MODERATION_NOT_CONFIGURED') {
      return send(res, 503, { error: 'moderation_service_not_configured', retryable: true });
    }
    console.error('moderation proposal endpoint failed', error);
    return send(res, 502, { error: 'moderation_service_failed', retryable: true });
  }
}

module.exports = handler;
module.exports._test = { clampLimit };
