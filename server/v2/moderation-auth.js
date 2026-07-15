'use strict';

const crypto = require('node:crypto');

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function requireModerator(req) {
  const configuredKey = process.env.SOULFLAME_MODERATOR_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  const suppliedKey = req.headers['x-soulflame-moderator-key'];
  const moderatorId = String(req.headers['x-soulflame-moderator-id'] || '').trim();

  if (!configuredKey || !serviceRoleKey || !url) {
    const error = new Error('moderation_not_configured');
    error.code = 'MODERATION_NOT_CONFIGURED';
    throw error;
  }
  if (!safeEqual(suppliedKey, configuredKey)) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(moderatorId)) return null;
  return { moderatorId, serviceRoleKey, url: url.replace(/\/$/, '') };
}

async function serviceRequest(auth, path, { method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: auth.serviceRoleKey,
    authorization: `Bearer ${auth.serviceRoleKey}`,
    'content-type': 'application/json'
  };
  if (prefer) headers.prefer = prefer;
  const response = await fetch(`${auth.url}${path}`, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  return { response, data };
}

module.exports = { send, safeEqual, requireModerator, serviceRequest };