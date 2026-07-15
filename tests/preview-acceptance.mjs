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
  assert(home.text.includes('rel="manifest" href="/manifest.webmanifest"'), 'Manifest is not linked from onboarding');
  assert(home.text.includes('src="/pwa-register.js"'), 'PWA registration script is not loaded from onboarding');

  const register = await request('/pwa-register.js');
  assert(register.response.ok, `PWA registration script failed: ${register.response.status}`);
  assert(register.text.includes("navigator.serviceWorker.register('/sw.js'"), 'Service worker registration call is missing');
  assert(register.text.includes("scope: '/'"), 'Service worker scope must cover the application');
  assert(register.text.includes("beforeinstallprompt"), 'Install prompt lifecycle is not handled');
  assert(register.text.includes('window.ParkEyeRayPWA'), 'PWA control API is missing');
  assert(register.text.includes("outcome: 'unavailable'"), 'Unavailable install prompt must be reported honestly');
  assert(register.text.includes('registration.waiting'), 'Waiting service-worker update is not detected');
  assert(register.text.includes("type: 'SKIP_WAITING'"), 'Explicit update activation contract is missing');

  const app = await request('/app');
  assert(app.response.ok, `Map app failed: ${app.response.status}`);
  assert(app.text.includes('SmartCity Mobility'), 'Map app does not contain product title');
  assert(app.text.includes('AI Mobility OS'), 'Locked AI Mobility OS entry is missing');
  assert(app.text.includes('Няма live информация за свободни места'), 'Honest occupancy label is missing');

  const manifest = await request('/manifest.webmanifest');
  assert(manifest.response.ok, `Manifest failed: ${manifest.response.status}`);
  const manifestJson = JSON.parse(manifest.text);
  assert(manifestJson.display === 'standalone', 'Manifest display must be standalone');
  assert(manifestJson.id === '/app', 'Installed PWA identity must resolve to /app');
  assert(manifestJson.start_url === '/app?source=pwa', 'Installed PWA must launch the map, not onboarding');
  assert(manifestJson.shortcuts?.[0]?.url === '/app?action=parking', 'Parking shortcut must open the map app');
  assert(Array.isArray(manifestJson.icons) && manifestJson.icons.length >= 2, 'Manifest icons are incomplete');

  const sw = await request('/sw.js');
  assert(sw.response.ok, `Service worker failed: ${sw.response.status}`);
  assert(sw.text.includes("'/app'"), 'Service worker app route shell entry is missing');
  assert(sw.text.includes('offline.html'), 'Service worker offline fallback is missing');
  assert(sw.text.includes("'/api/'"), 'Service worker API bypass is missing');
  assert(sw.text.includes("error: 'offline'"), 'Service worker honest offline API response is missing');
  assert(sw.text.includes("'Cache-Control': 'no-store'"), 'Offline API responses must never be cached');

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