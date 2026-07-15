#!/usr/bin/env node

const base = (process.env.BASE_URL || process.argv[2] || '').replace(/\/$/, '');
if (!base || !/^https?:\/\//.test(base)) {
  console.error('Usage: BASE_URL=https://preview.example node tests/preview-acceptance.mjs');
  process.exit(2);
}

const checks = [];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function request(path, options = {}) {
  const started = Date.now();
  const response = await fetch(`${base}${path}`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    ...options,
  });
  const text = await response.text();
  checks.push({ path, status: response.status, ms: Date.now() - started });
  return { response, text };
}

async function run() {
  const home = await request('/');
  assert(home.response.ok, `Onboarding failed: ${home.response.status}`);
  assert(home.text.includes('ParkEyeRay'), 'Onboarding does not contain product title');
  assert(home.text.includes('Към картата'), 'Onboarding map entry is missing');
  assert(home.text.includes("location.href='/app'"), 'Onboarding does not route to /app');

  const app = await request('/app');
  assert(app.response.ok, `Map app failed: ${app.response.status}`);
  assert(app.text.includes('SmartCity Mobility'), 'Map app does not contain product title');
  assert(app.text.includes('AI Mobility OS'), 'Locked AI Mobility OS entry is missing');
  assert(app.text.includes('Няма live информация за свободни места'), 'Honest occupancy label is missing');

  const manifest = await request('/manifest.webmanifest');
  assert(manifest.response.ok, `Manifest failed: ${manifest.response.status}`);
  const manifestJson = JSON.parse(manifest.text);
  assert(manifestJson.display === 'standalone', 'Manifest display must be standalone');
  assert(Array.isArray(manifestJson.icons) && manifestJson.icons.length >= 2, 'Manifest icons are incomplete');

  const sw = await request('/sw.js');
  assert(sw.response.ok, `Service worker failed: ${sw.response.status}`);
  assert(sw.text.includes('offline.html'), 'Service worker offline fallback is missing');
  assert(sw.text.includes("'/api/'"), 'Service worker API bypass is missing');

  const offline = await request('/offline.html');
  assert(offline.response.ok, `Offline page failed: ${offline.response.status}`);

  const invalidGeo = await request('/api/geocode?q=');
  assert([400, 422].includes(invalidGeo.response.status), `Invalid geocode should be rejected, got ${invalidGeo.response.status}`);

  const invalidRoute = await request('/api/route?from=bad&to=bad');
  assert([400, 422].includes(invalidRoute.response.status), `Invalid route should be rejected, got ${invalidRoute.response.status}`);

  console.table(checks);
  console.log(`Preview acceptance passed for ${base}`);
}

run().catch((error) => {
  console.error(`Preview acceptance failed: ${error.message}`);
  if (checks.length) console.table(checks);
  process.exit(1);
});
