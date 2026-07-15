import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const requiredIds = [
  'menuBtn', 'drawerClose', 'backdrop', 'searchForm', 'searchInput',
  'locateBtn', 'mapModeBtn', 'filters', 'parkingList', 'routeClose',
  'vehicleForm', 'reportForm'
];

for (const id of requiredIds) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Missing required UI control #${id}`);
  assert.match(html, new RegExp(`\\b${id}\\b`), `Control #${id} is not referenced by application code`);
}

const actions = [...html.matchAll(/data-action=["']([^"']+)["']/g)].map((match) => match[1]);
const uniqueActions = [...new Set(actions)];
const requiredActions = ['map', 'saved', 'history', 'vehicle', 'signals', 'report', 'ai', 'privacy'];

for (const action of requiredActions) {
  assert.ok(uniqueActions.includes(action), `Missing menu action: ${action}`);
  const handlerPatterns = [
    new RegExp(`action\\s*===\\s*["']${action}["']`),
    new RegExp(`case\\s+["']${action}["']`),
    new RegExp(`["']${action}["']\\s*:`)
  ];
  assert.ok(handlerPatterns.some((pattern) => pattern.test(html)), `Menu action has no explicit handler: ${action}`);
}

assert.match(html, /addEventListener\s*\(\s*["']submit["']/, 'Forms must use submit handlers');
assert.match(html, /addEventListener\s*\(\s*["']click["']/, 'Interactive controls must use click handlers');
assert.match(html, /localStorage/, 'Saved places, history and vehicle profile require local persistence');
assert.match(html, /AI Mobility OS е заключен/, 'Locked AI state must remain explicit');
assert.match(html, /Няма live информация за свободни места/, 'Parking occupancy must remain honestly labelled');
assert.match(html, /Няма live достъп до текущия цвят/, 'Traffic signal state must remain honestly labelled');

console.log(`UI contract passed: ${requiredIds.length} controls and ${requiredActions.length} menu actions verified.`);
