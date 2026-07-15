const { test, expect } = require('@playwright/test');

const destination = {
  name: 'Мол Галерия Стара Загора, улица Хан Аспарух, Стара Загора',
  lat: 42.4381235,
  lon: 25.6315901,
  type: 'mall',
  source: 'nominatim'
};

const yambolMall = {
  name: 'Мол Ямбол, Александър Стамболийски, Ямбол, България',
  lat: 42.4848947,
  lon: 26.5099727,
  type: 'mall',
  source: 'nominatim',
  importance: 0.01,
  distance: 26711
};

const yambolParking = {
  name: 'Паркинг към Мол Ямбол, Александър Стамболийски, Ямбол, България',
  lat: 42.4847108,
  lon: 26.510374,
  type: 'parking',
  source: 'nominatim',
  importance: 0.5,
  distance: 26746
};

const parkingRecords = [
  {
    id: 'soulflame:approved-mall-zone', source: 'soulflame', externalId: 'approved-mall-zone',
    name: 'Одобрен паркинг Мол Галерия', kind: 'community_zone',
    point: { lat: 42.43855, lon: 25.63095 }, entrance: { lat: 42.43848, lon: 25.63102 },
    distance: 55, access: 'public', capacity: 120, fee: 'no', covered: false, lit: true, surveillance: true,
    verificationStatus: 'approved', dataOrigin: 'postgis', sourceUpdatedAt: '2026-07-15T20:00:00Z', sourceRefs: ['soulflame:approved-mall-zone','osm:way/101'], tags: {}
  },
  {
    id: 'osm:way/103', source: 'osm', externalId: 'way/103', name: 'Северен паркинг', kind: 'surface',
    point: { lat: 42.43910, lon: 25.63210 }, entrance: { lat: 42.43910, lon: 25.63210 },
    distance: 135, access: null, capacity: null, fee: null, covered: false, lit: null, surveillance: null,
    verificationStatus: 'mapped', dataOrigin: 'postgis', sourceUpdatedAt: '2026-07-15T19:00:00Z', sourceRevision: 'bg-2026-07-15', sourceRefs: ['osm:way/103'], tags: {}
  },
  {
    id: 'osm:way/104', source: 'osm', externalId: 'way/104', name: 'Подземен паркинг', kind: 'underground',
    point: { lat: 42.43750, lon: 25.63240 }, entrance: { lat: 42.43750, lon: 25.63240 },
    distance: 160, access: null, capacity: null, fee: 'yes', covered: true, lit: null, surveillance: null,
    verificationStatus: 'mapped', dataOrigin: 'postgis', sourceUpdatedAt: '2026-07-15T19:00:00Z', sourceRevision: 'bg-2026-07-15', sourceRefs: ['osm:way/104'], tags: {}
  },
  {
    id: 'osm:node/105', source: 'osm', externalId: 'node/105', name: 'Достъпни места', kind: 'parking_space',
    point: { lat: 42.43790, lon: 25.63040 }, entrance: { lat: 42.43790, lon: 25.63040 },
    distance: 175, access: null, capacity: 4, fee: null, covered: false, lit: null, surveillance: null,
    verificationStatus: 'mapped', dataOrigin: 'postgis', sourceUpdatedAt: '2026-07-15T19:00:00Z', sourceRevision: 'bg-2026-07-15', sourceRefs: ['osm:node/105'], tags: { wheelchair: 'yes' }
  },
  {
    id: 'osm:way/106', source: 'osm', externalId: 'way/106', name: 'Западен паркинг', kind: 'surface',
    point: { lat: 42.43940, lon: 25.62990 }, entrance: { lat: 42.43940, lon: 25.62990 },
    distance: 220, access: null, capacity: null, fee: null, covered: false, lit: null, surveillance: null,
    verificationStatus: 'mapped', dataOrigin: 'postgis', sourceUpdatedAt: '2026-07-15T19:00:00Z', sourceRevision: 'bg-2026-07-15', sourceRefs: ['osm:way/106'], tags: {}
  }
];

function routePayload(profile) {
  const walking = profile === 'walking';
  return {
    code: 'Ok',
    profile,
    routes: [{
      distance: walking ? 180 : 3500,
      duration: walking ? 150 : 420,
      geometry: {
        type: 'LineString',
        coordinates: walking
          ? [[25.63095, 42.43855], [25.63159, 42.43812]]
          : [[26.3229, 42.6817], [25.95, 42.56], [25.63102, 42.43848]]
      }
    }]
  };
}

async function mockApplicationApis(page, options = {}) {
  const geocodePayload = options.geocodePayload || { results: [destination], normalizedQuery: 'стара загора мол' };
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());

  await page.route('**/api/geocode?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(geocodePayload)
  }));

  await page.route('**/api/v2/parkings?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      parkings: parkingRecords,
      meta: { dataSource: 'postgis', fallbackUsed: false, resultCount: parkingRecords.length, rawCount: 6, liveOccupancy: false, freshness: '2026-07-15T20:00:00Z' }
    })
  }));

  await page.route('**/api/routing?**', route => {
    const url = new URL(route.request().url());
    const profile = url.searchParams.get('profile') || 'driving';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(routePayload(profile))
    });
  });
}

async function openV2(page, options = {}) {
  await mockApplicationApis(page, options);
  await page.goto('/v2.html');
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('.nav-action')).toHaveCount(5);
  await expect(page.locator('#status')).toBeVisible();
  await expect(page.locator('#search-input')).toBeEnabled();
  await expect(page.locator('#parking-list')).toBeVisible();
}

test('search → normalized parking engine → driving and walking route', async ({ page }) => {
  await openV2(page);

  await page.locator('#search-input').fill('stara zagora mol');
  await page.locator('#search-submit').click();

  await expect(page.locator('#sheet-title')).toContainText('Мол Галерия');
  await expect(page.locator('.parking-card')).toHaveCount(5);
  await expect(page.locator('#parking-count')).toHaveText('5');
  await expect(page.locator('#sheet-subtitle')).toContainText('SmartCity PostGIS база');
  await expect(page.locator('.parking-card').first()).toContainText('SoulFlame одобрен');
  await expect(page.locator('.parking-card').first()).toContainText('Одобрен');
  await expect(page.locator('[data-action="parkings"]')).toHaveAttribute('aria-current', 'page');

  await page.locator('.parking-card').first().locator('[data-route]').click();

  await expect(page.locator('#route-card')).toHaveClass(/active/);
  await expect(page.locator('#drive-distance')).toHaveText('3.5 км');
  await expect(page.locator('#drive-time')).toHaveText('7 мин');
  await expect(page.locator('#walk-distance')).toHaveText('180 м');
  await expect(page.locator('[data-action="navigate"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#external-route')).toHaveAttribute('href', /google\.com\/maps\/dir/);
  await expect(page.locator('#route-note')).toContainText('одобрения вход');
});

test('Stage 2 ranks a mall above its parking and persists saved/recent destinations', async ({ page }) => {
  await openV2(page, {
    geocodePayload: {
      results: [yambolParking, yambolMall],
      normalizedQuery: 'ямбол мол'
    }
  });

  await page.locator('#search-input').fill('qmbol mol');
  await expect(page.locator('.destination-result')).toHaveCount(2);
  await expect(page.locator('.destination-result').first()).toContainText('Мол Ямбол');
  await expect(page.locator('.destination-result').first()).not.toContainText('Паркинг към');
  await expect(page.locator('.destination-result').first()).toContainText('Най-подходящ');

  await page.locator('.destination-result').first().click();
  await expect(page.locator('#sheet-title')).toContainText('Мол Ямбол');
  await expect(page.locator('#save-destination')).toBeVisible();

  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('sf_v2_destination_history') || '[]'));
  expect(history).toHaveLength(1);
  expect(history[0].name).toContain('Мол Ямбол');

  await page.locator('#save-destination').click();
  await expect(page.locator('#save-destination')).toHaveAttribute('aria-pressed', 'true');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sf_v2_saved_destinations') || '[]'));
  expect(saved).toHaveLength(1);
  expect(saved[0].name).toContain('Мол Ямбол');

  await page.evaluate(() => {
    const existing = JSON.parse(localStorage.getItem('sf_v2_destination_history') || '[]');
    existing.push({
      id: '42.438124,25.631590', name: 'Мол Галерия Стара Загора, Стара Загора',
      lat: 42.4381235, lon: 25.6315901, type: 'mall', source: 'local', savedAt: new Date().toISOString()
    });
    localStorage.setItem('sf_v2_destination_history', JSON.stringify(existing));
  });

  await page.reload();
  await expect(page.locator('#search-input')).toBeEnabled();
  await page.locator('#search-input').fill('');
  await page.locator('#search-input').focus();

  await expect(page.locator('#search-results')).toHaveClass(/active/);
  await expect(page.locator('#search-results')).toContainText('Запазени места');
  await expect(page.locator('#search-results')).toContainText('Последни търсения');
  await expect(page.locator('#search-results')).toContainText('Мол Ямбол');
  await expect(page.locator('#search-results')).toContainText('Мол Галерия Стара Загора');
});

test('drawing mode locks unrelated actions and saves pending proposal', async ({ page }) => {
  await openV2(page);

  await page.locator('[data-action="add"]').click();
  await expect(page.locator('body')).toHaveClass(/drawing-mode/);
  await expect(page.locator('#draw-toolbar')).toHaveClass(/active/);
  await expect(page.locator('[data-action="search"]')).toBeDisabled();

  const mapBox = await page.locator('#map').boundingBox();
  if (!mapBox) throw new Error('Map has no bounding box');

  await page.mouse.click(mapBox.x + mapBox.width * 0.35, mapBox.y + mapBox.height * 0.38);
  await page.mouse.click(mapBox.x + mapBox.width * 0.55, mapBox.y + mapBox.height * 0.40);
  await page.mouse.click(mapBox.x + mapBox.width * 0.48, mapBox.y + mapBox.height * 0.58);

  await expect(page.locator('#draw-finish')).toBeEnabled();
  await page.locator('#draw-finish').click();
  await expect(page.locator('#proposal-modal')).toHaveClass(/open/);

  await page.locator('#proposal-name').fill('Тестова паркинг зона');
  await page.locator('#proposal-capacity').fill('12');
  await page.locator('#proposal-evidence').fill('Има постоянна маркировка и знак за паркиране.');
  await page.locator('#proposal-form button[type="submit"]').click();

  await expect(page.locator('#proposal-modal')).not.toHaveClass(/open/);
  await expect(page.locator('#status')).toContainText('Чака SoulFlame одобрение');

  const proposals = await page.evaluate(() => JSON.parse(localStorage.getItem('sf_v2_proposals') || '[]'));
  expect(proposals).toHaveLength(1);
  expect(proposals[0].status).toBe('pending_soulflame');
  expect(proposals[0].geometry.length).toBeGreaterThanOrEqual(3);

  await page.locator('[data-action="profile"]').click();
  await page.locator('#show-proposals').click();
  await expect(page.locator('.proposal-item')).toContainText('Тестова паркинг зона');
  await expect(page.locator('.proposal-item')).toContainText('Чака SoulFlame одобрение');
});

test('drawing cancel and offline recovery leave the interface usable', async ({ page, context }) => {
  await openV2(page);

  await page.locator('[data-action="add"]').click();
  const mapBox = await page.locator('#map').boundingBox();
  if (!mapBox) throw new Error('Map has no bounding box');
  await page.mouse.click(mapBox.x + mapBox.width * 0.40, mapBox.y + mapBox.height * 0.40);
  await page.locator('#draw-cancel').click();

  await expect(page.locator('body')).not.toHaveClass(/drawing-mode/);
  await expect(page.locator('#draw-toolbar')).not.toHaveClass(/active/);
  await expect(page.locator('[data-action="search"]')).toBeEnabled();

  await context.setOffline(true);
  await expect(page.locator('#network-state')).toHaveClass(/active/);
  await expect(page.locator('#network-state')).toContainText('Няма интернет');

  await context.setOffline(false);
  await expect(page.locator('#network-state')).not.toHaveClass(/active/);
  await expect(page.locator('#status')).toContainText('възстановена');

  await page.locator('[data-action="search"]').click();
  await expect(page.locator('#search-input')).toBeFocused();
});
