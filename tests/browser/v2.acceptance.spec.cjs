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
    id: 'soulflame:approved-zone', source: 'soulflame', externalId: 'approved-zone', name: 'Одобрен паркинг', kind: 'community_zone',
    point: { lat: 42.6819, lon: 26.3227 }, entrance: { lat: 42.68185, lon: 26.32275 }, distance: 35,
    access: 'public', capacity: 80, fee: 'no', covered: false, lit: true, surveillance: true,
    verificationStatus: 'approved', dataOrigin: 'postgis', sourceUpdatedAt: '2026-07-15T20:00:00Z', sourceRefs: ['soulflame:approved-zone'], tags: {}
  },
  {
    id: 'osm:way/103', source: 'osm', externalId: 'way/103', name: 'Северен паркинг', kind: 'surface',
    point: { lat: 42.6824, lon: 26.3231 }, entrance: { lat: 42.6824, lon: 26.3231 }, distance: 95,
    access: null, capacity: null, fee: null, covered: false, lit: null, surveillance: null,
    verificationStatus: 'mapped', dataOrigin: 'postgis', sourceUpdatedAt: '2026-07-15T19:00:00Z', sourceRevision: 'bg-2026-07-15', sourceRefs: ['osm:way/103'], tags: {}
  },
  {
    id: 'osm:way/104', source: 'osm', externalId: 'way/104', name: 'Подземен паркинг', kind: 'underground',
    point: { lat: 42.6808, lon: 26.3235 }, entrance: { lat: 42.6808, lon: 26.3235 }, distance: 140,
    access: null, capacity: 120, fee: 'yes', covered: true, lit: null, surveillance: null,
    verificationStatus: 'mapped', dataOrigin: 'postgis', sourceUpdatedAt: '2026-07-15T19:00:00Z', sourceRevision: 'bg-2026-07-15', sourceRefs: ['osm:way/104'], tags: {}
  },
  {
    id: 'osm:node/105', source: 'osm', externalId: 'node/105', name: 'Достъпни места', kind: 'parking_space',
    point: { lat: 42.6811, lon: 26.3215 }, entrance: { lat: 42.6811, lon: 26.3215 }, distance: 165,
    access: null, capacity: 4, fee: null, covered: false, lit: null, surveillance: null,
    verificationStatus: 'mapped', dataOrigin: 'postgis', sourceUpdatedAt: '2026-07-15T19:00:00Z', sourceRevision: 'bg-2026-07-15', sourceRefs: ['osm:node/105'], tags: {}
  },
  {
    id: 'osm:way/106', source: 'osm', externalId: 'way/106', name: 'Западен паркинг', kind: 'surface',
    point: { lat: 42.6830, lon: 26.3217 }, entrance: { lat: 42.6830, lon: 26.3217 }, distance: 220,
    access: null, capacity: null, fee: null, covered: false, lit: null, surveillance: null,
    verificationStatus: 'mapped', dataOrigin: 'postgis', sourceUpdatedAt: '2026-07-15T19:00:00Z', sourceRevision: 'bg-2026-07-15', sourceRefs: ['osm:way/106'], tags: {}
  }
];

const fuelStations = [
  { id: 'osm:node/501', source: 'osm', type: 'fuel', name: 'OMV Сливен', brand: 'OMV', point: { lat: 42.684, lon: 26.326 }, distance: 420, openingHours: '24/7', selfService: false, fuelTypes: ['diesel'], tags: {} },
  { id: 'osm:node/502', source: 'osm', type: 'fuel', name: 'Shell Сливен', brand: 'Shell', point: { lat: 42.676, lon: 26.318 }, distance: 780, openingHours: null, selfService: false, fuelTypes: ['octane_95'], tags: {} }
];

function routePayload(profile) {
  const walking = profile === 'walking';
  return {
    code: 'Ok', profile,
    routes: [{
      distance: walking ? 180 : 3500,
      duration: walking ? 150 : 420,
      geometry: { type: 'LineString', coordinates: walking ? [[26.3227, 42.6819], [25.63159, 42.43812]] : [[26.3229, 42.6817], [26.32275, 42.68185]] }
    }]
  };
}

async function mockApplicationApis(page, options = {}) {
  const geocodePayload = options.geocodePayload || { results: [destination], normalizedQuery: 'стара загора мол' };
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.route('**/api/geocode?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(geocodePayload) }));
  await page.route('**/api/v2/parkings?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ parkings: parkingRecords, meta: { dataSource: 'postgis', fallbackUsed: false, resultCount: parkingRecords.length, rawCount: 5, liveOccupancy: false } })
  }));
  await page.route('**/api/v2/nearby?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ places: fuelStations, meta: { type: 'fuel', resultCount: fuelStations.length, source: 'osm', liveStatus: false } })
  }));
  await page.route('**/api/routing?**', route => {
    const profile = new URL(route.request().url()).searchParams.get('profile') || 'driving';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(routePayload(profile)) });
  });
}

async function openV2(page, options = {}) {
  await mockApplicationApis(page, options);
  await page.goto('/v2.html');
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('.nav-action')).toHaveCount(5);
  await expect(page.locator('#menu-btn')).toBeVisible();
  await expect(page.locator('#search-input')).toBeEnabled();
}

async function openMenu(page) {
  if (!(await page.locator('#map-menu').evaluate(node => node.classList.contains('open')))) {
    await page.locator('#menu-btn').click();
  }
  await expect(page.locator('#map-menu')).toHaveClass(/open/);
}

async function tapMapPoint(page, testInfo, x, y) {
  await expect(page.locator('#draw-surface')).toBeVisible();
  if (testInfo.project.name === 'android-phone') {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.click(x, y);
  }
}

test('GPS automatically shows nearby parking and burger toggles fuel without blocking the map', async ({ page }) => {
  await openV2(page);

  await expect(page.locator('.parking-pin')).toHaveCount(5);
  await expect(page.locator('#parking-count')).toHaveText('5');
  await expect(page.locator('#parking-sheet')).toHaveClass(/collapsed/);
  await expect(page.locator('#map')).toBeVisible();

  await openMenu(page);
  await expect(page.locator('#parking-layer-btn')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#fuel-layer-btn').click();

  await expect(page.locator('#map-menu')).not.toHaveClass(/open/);
  await expect(page.locator('.fuel-pin')).toHaveCount(2);
  await expect(page.locator('#fuel-layer-count')).toHaveText('2');
  await expect(page.locator('#map')).toBeVisible();

  await openMenu(page);
  await page.locator('#parking-layer-btn').click();
  await expect(page.locator('#parking-sheet')).toHaveClass(/layer-disabled/);
  await expect(page.locator('.parking-pin')).toHaveCount(0);

  await openMenu(page);
  await page.locator('#parking-layer-btn').click();
  await expect(page.locator('.parking-pin')).toHaveCount(5);
  await expect(page.locator('#parking-sheet')).toHaveClass(/collapsed/);
});

test('destination search keeps map-first sheet collapsed and builds drive plus walk route', async ({ page }) => {
  await openV2(page);
  await page.locator('#search-input').fill('stara zagora mol');
  await page.locator('#search-submit').click();

  await expect(page.locator('#sheet-title')).toContainText('Мол Галерия');
  await expect(page.locator('#parking-sheet')).toHaveClass(/collapsed/);
  await expect(page.locator('#parking-count')).toHaveText('5');
  await expect(page.locator('[data-action="parkings"]')).toHaveAttribute('aria-current', 'page');

  await page.locator('#sheet-handle').click();
  await expect(page.locator('#parking-sheet')).not.toHaveClass(/collapsed/);
  await expect(page.locator('.parking-card')).toHaveCount(5);
  await expect(page.locator('.parking-card').first()).toContainText('SoulFlame одобрен');
  await page.locator('.parking-card').first().locator('[data-route]').click();

  await expect(page.locator('#route-card')).toHaveClass(/active/);
  await expect(page.locator('#drive-distance')).toHaveText('3.5 км');
  await expect(page.locator('#drive-time')).toHaveText('7 мин');
  await expect(page.locator('#walk-distance')).toHaveText('180 м');
  await expect(page.locator('#external-route')).toHaveAttribute('href', /google\.com\/maps\/dir/);
});

test('search ranking and saved destination persistence remain available', async ({ page }) => {
  await openV2(page, { geocodePayload: { results: [yambolParking, yambolMall], normalizedQuery: 'ямбол мол' } });
  await page.locator('#search-input').fill('qmbol mol');
  await expect(page.locator('.destination-result')).toHaveCount(2);
  await expect(page.locator('.destination-result').first()).toContainText('Мол Ямбол');
  await expect(page.locator('.destination-result').first()).not.toContainText('Паркинг към');
  await page.locator('.destination-result').first().click();

  await expect(page.locator('#parking-sheet')).toHaveClass(/collapsed/);
  await page.locator('#sheet-handle').click();
  await expect(page.locator('#parking-sheet')).not.toHaveClass(/collapsed/);
  await expect(page.locator('#save-destination')).toBeVisible();
  await page.locator('#save-destination').click();
  await expect(page.locator('#save-destination')).toHaveAttribute('aria-pressed', 'true');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sf_v2_saved_destinations') || '[]'));
  expect(saved).toHaveLength(1);
  expect(saved[0].name).toContain('Мол Ямбол');

  await page.reload();
  await page.locator('#search-input').fill('');
  await page.locator('#search-input').focus();
  await expect(page.locator('#search-results')).toContainText('Запазени места');
  await expect(page.locator('#search-results')).toContainText('Мол Ямбол');
});

test('burger actions support proposal drawing, profile and offline recovery', async ({ page, context }, testInfo) => {
  await openV2(page);
  await openMenu(page);
  await page.locator('[data-action="add"]').click();
  await expect(page.locator('body')).toHaveClass(/drawing-mode/);
  await expect(page.locator('#draw-toolbar')).toHaveClass(/active/);

  const mapBox = await page.locator('#map').boundingBox();
  if (!mapBox) throw new Error('Map has no bounding box');
  await tapMapPoint(page, testInfo, mapBox.x + mapBox.width * 0.35, mapBox.y + mapBox.height * 0.36);
  await tapMapPoint(page, testInfo, mapBox.x + mapBox.width * 0.55, mapBox.y + mapBox.height * 0.39);
  await tapMapPoint(page, testInfo, mapBox.x + mapBox.width * 0.48, mapBox.y + mapBox.height * 0.57);
  await expect(page.locator('#draw-help')).toContainText('Добавени точки: 3');
  await expect(page.locator('#draw-finish')).toBeEnabled();
  await page.locator('#draw-finish').click();
  await page.locator('#proposal-name').fill('Тестова паркинг зона');
  await page.locator('#proposal-capacity').fill('12');
  await page.locator('#proposal-evidence').fill('Има постоянна маркировка и знак за паркиране.');
  await page.locator('#proposal-form button[type="submit"]').click();
  await expect(page.locator('#status')).toContainText('Чака SoulFlame одобрение');

  await openMenu(page);
  await page.locator('[data-action="profile"]').click();
  await page.locator('#show-proposals').click();
  await expect(page.locator('.proposal-item')).toContainText('Тестова паркинг зона');
  await page.locator('[data-close="proposals-modal"]').click();

  await context.setOffline(true);
  await expect(page.locator('#network-state')).toHaveClass(/active/);
  await context.setOffline(false);
  await expect(page.locator('#network-state')).not.toHaveClass(/active/);
  await expect(page.locator('#status')).toContainText('възстановена');
});
