'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const ALLOWED_SOURCES = new Set(['osm', 'operator', 'municipality']);
const FEATURE_TYPES = new Set(['area', 'space', 'street', 'entrance', 'point']);
const BATCH_SIZE = 250;

function isCoordinate(value) {
  return Array.isArray(value)
    && value.length === 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && value[0] >= 22.2 && value[0] <= 28.75
    && value[1] >= 41.1 && value[1] <= 44.3;
}

function validatePoint(value) {
  return value && value.type === 'Point' && isCoordinate(value.coordinates);
}

function validateGeometry(value) {
  if (!value || !['Point', 'LineString', 'Polygon'].includes(value.type) || !Array.isArray(value.coordinates)) return false;
  if (value.type === 'Point') return isCoordinate(value.coordinates);
  if (value.type === 'LineString') return value.coordinates.length >= 2 && value.coordinates.every(isCoordinate);
  const ring = value.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(isCoordinate)) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function validateBatch(batch) {
  const errors = [];
  if (!batch || typeof batch !== 'object' || Array.isArray(batch)) return ['invalid_batch'];
  if (!ALLOWED_SOURCES.has(batch.source)) errors.push('invalid_source');
  if (!/^[a-zA-Z0-9._:-]{2,120}$/.test(String(batch.scopeKey || ''))) errors.push('invalid_scope_key');
  if (!String(batch.revision || '').trim() || String(batch.revision).length > 160) errors.push('invalid_revision');
  if (!Array.isArray(batch.features) || batch.features.length > 50000) errors.push('invalid_features');

  (Array.isArray(batch.features) ? batch.features : []).forEach((feature, index) => {
    const prefix = `feature_${index}`;
    if (!feature || typeof feature !== 'object') return errors.push(`${prefix}_invalid`);
    if (!String(feature.externalId || '').trim() || String(feature.externalId).length > 180) errors.push(`${prefix}_external_id`);
    if (!FEATURE_TYPES.has(feature.featureType)) errors.push(`${prefix}_feature_type`);
    if (!String(feature.kind || '').trim() || String(feature.kind).length > 80) errors.push(`${prefix}_kind`);
    if (!validateGeometry(feature.geometry)) errors.push(`${prefix}_geometry`);
    if (!validatePoint(feature.representativePoint)) errors.push(`${prefix}_representative_point`);
    if (feature.vehicleEntrance != null && !validatePoint(feature.vehicleEntrance)) errors.push(`${prefix}_vehicle_entrance`);
    if (feature.capacity != null && (!Number.isInteger(feature.capacity) || feature.capacity < 1 || feature.capacity > 100000)) errors.push(`${prefix}_capacity`);
    if (feature.tags != null && (typeof feature.tags !== 'object' || Array.isArray(feature.tags))) errors.push(`${prefix}_tags`);
  });

  return errors;
}

function normalizeRows(batch, runId) {
  return batch.features.map(feature => ({
    source: batch.source,
    external_id: String(feature.externalId),
    scope_key: batch.scopeKey,
    feature_type: feature.featureType,
    name: feature.name || null,
    kind: feature.kind,
    geometry: feature.geometry,
    representative_point: feature.representativePoint,
    vehicle_entrance: feature.vehicleEntrance || null,
    access: feature.access || null,
    capacity: feature.capacity ?? null,
    fee: feature.fee || null,
    covered: feature.covered ?? null,
    lit: feature.lit ?? null,
    surveillance: feature.surveillance ?? null,
    tags: feature.tags || {},
    source_revision: batch.revision,
    source_updated_at: feature.sourceUpdatedAt || batch.sourceUpdatedAt || null,
    import_run_id: runId,
    imported_at: new Date().toISOString(),
    is_active: true
  }));
}

function chunks(items, size = BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function configFromEnv() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  return { url, key };
}

async function request(config, endpoint, options = {}) {
  const response = await fetch(`${config.url}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      'content-type': 'application/json',
      ...(options.prefer ? { prefer: options.prefer } : {})
    },
    body: options.body == null ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(`Supabase ${response.status}`);
    error.data = data;
    throw error;
  }
  return data;
}

async function createRun(config, batch) {
  const data = await request(config, '/rest/v1/parking_import_runs?select=id', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      source: batch.source,
      scope_key: batch.scopeKey,
      revision: batch.revision,
      bbox: batch.bbox || null,
      status: 'running'
    }
  });
  const run = Array.isArray(data) ? data[0] : data;
  if (!run?.id) throw new Error('Import run was not created');
  return run.id;
}

async function markFailed(config, runId, error) {
  try {
    await request(config, `/rest/v1/parking_import_runs?id=eq.${encodeURIComponent(runId)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: {
        status: 'failed',
        error_message: String(error?.message || error).slice(0, 2000),
        completed_at: new Date().toISOString()
      }
    });
  } catch (markError) {
    console.error('Could not mark import as failed:', markError.message);
  }
}

async function importBatch(batch, options = {}) {
  const errors = validateBatch(batch);
  if (errors.length) {
    const error = new Error(`Invalid import batch: ${errors.slice(0, 20).join(', ')}`);
    error.validationErrors = errors;
    throw error;
  }

  if (options.dryRun) {
    return { dryRun: true, source: batch.source, scopeKey: batch.scopeKey, revision: batch.revision, features: batch.features.length };
  }

  const config = options.config || configFromEnv();
  const runId = await createRun(config, batch);
  let upserted = 0;

  try {
    const rows = normalizeRows(batch, runId);
    for (const group of chunks(rows)) {
      await request(config, '/rest/v1/parking_features?on_conflict=source,external_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: group
      });
      upserted += group.length;
      process.stdout.write(`Imported ${upserted}/${rows.length}\r`);
    }

    const final = await request(config, '/rest/v1/rpc/finalize_parking_import', {
      method: 'POST',
      body: { p_run_id: runId, p_seen_count: rows.length, p_upserted_count: upserted }
    });
    const deactivated = Array.isArray(final) ? Number(final[0]?.deactivated_count || 0) : 0;
    return { runId, source: batch.source, scopeKey: batch.scopeKey, revision: batch.revision, seen: rows.length, upserted, deactivated };
  } catch (error) {
    await markFailed(config, runId, error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find(value => !value.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  if (!fileArg) {
    console.error('Usage: node scripts/import-osm-parking.cjs <batch.json> [--dry-run]');
    process.exitCode = 2;
    return;
  }

  const filePath = path.resolve(process.cwd(), fileArg);
  const batch = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const result = await importBatch(batch, { dryRun });
  process.stdout.write('\n');
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    if (error.data) console.error(JSON.stringify(error.data, null, 2));
    process.exitCode = 1;
  });
}

module.exports = { validateBatch, validateGeometry, validatePoint, normalizeRows, chunks, importBatch };
