const { test, expect } = require('@playwright/test');

const destination = {
  name: 'Мол Галерия Стара Загора, улица Хан Аспарух, Стара Загора',
  lat: 42.4381235,
  lon: 25.6315901
};

const parkingElements = [
  {
    type: 'way', id: 101,
    center: { lat: 42.43855, lon: 25.63095 },
    tags: { amenity: 'parking', name: 'Паркинг Мол Галерия', parking: 'surface', fee: 'no', capacity: '120', lit: 'yes' }
  },
  {
    type: 'node', id: 102, lat: 42.43848, lon: 25.63102,
    tags: { amenity: 'parking_entrance', name: 'Главен вход' }
  },
  {
    type: 'way', id: 103,
    center: { lat: 42.43910, lon: 25.63210 },
    tags: { amenity: 'parking', name: 'Северен паркинг', parking: 'surface' }
  },
  {
    type: 'way', id: 104,
    center: { lat: 42.43750, lon: 25.63240 },
    tags: { amenity: 'parking', name: 'Подземен паркинг', parking: 'underground', fee: 'yes' }
  },
  {
    type: 'node', id: 105, lat: 42.43790, lon: 25.63040,
    tags: { amenity: 'parking_space', name: 'Достъпни места', wheelchair: 'yes' }
  },
  {
    type: 'way', id: 106,
    center: { lat: 42.43940, lon: 25.62990 },
    tags: { amenity: 'parking', name: 'Западен паркинг', parking: 'surface' }
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
          : [[26.3229, 42.6817], [25.95, 42.56], [25.63095, 42.43855]]
      }
    }]
  };
}

async function mockApplicationApis(page) {
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());

  await page.route('**/api/geocode?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ results: [destination] })
  }));

  await page.route('**/api/overpass', async route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ elements: parkingElements })
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

async function openV2(page) {
  await mockApplicationApis(page);
  await page.goto('/v2.html');
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('.nav-action')).toHaveCount(5);
  await expect(page.locator('#status')).toContainText('SmartCity V2');
}

test('search → parking selection → driving and walking route', async ({ page }) => {
  await openV2(page);

  await page.locator('#search-input').fill('stara zagora mol');
  await page.locator('#search-submit').click();

  await expect(page.locator('#sheet-title')).toContainText('Мол Галерия');
  await expect(page.locator('.parking-card')).toHaveCount(5);
  await expect(page.locator('#parking-count')).toHaveText('5');
  await expect(page.locator('[data-action="parkings"]')).toHaveAttribute('aria-current', 'page');

  await page.locator('.parking-card').first().locator('[data-route]').click();

  await expect(page.locator('#route-card')).toHaveClass(/active/);
  await expect(page.locator('#drive-distance')).toHaveText('3.5 км');
  await expect(page.locator('#drive-time')).toHaveText('7 мин');
  await expect(page.locator('#walk-distance')).toHaveText('180 м');
  await expect(page.locator('[data-action="navigate"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#external-route')).toHaveAttribute('href', /google\.com\/maps\/dir/);
  await expect(page.locator('#route-note')).toContainText('OSM вход');
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
