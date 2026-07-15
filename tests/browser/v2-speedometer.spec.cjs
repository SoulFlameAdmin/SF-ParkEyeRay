const { test, expect } = require('@playwright/test');

async function mockMapApis(page) {
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.route('**/api/v2/parkings?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ parkings: [], meta: { dataSource: 'postgis', resultCount: 0, liveOccupancy: false } })
  }));
  await page.route('**/api/v2/nearby?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ places: [], meta: { source: 'osm', liveStatus: false } })
  }));
}

test('GPS replaces the collapsed nearby card with a compact speedometer and location marker', async ({ page }) => {
  await mockMapApis(page);
  await page.goto('/v2.html');

  const speedometer = page.locator('#speedometer');
  await expect(speedometer).toHaveClass(/ready/);
  await expect(speedometer).toBeVisible();
  await expect(page.locator('#speedometer-value')).toHaveText('0');
  await expect(page.locator('.user-position-marker')).toHaveCount(1);

  const sheet = page.locator('#parking-sheet');
  await expect(sheet).toHaveClass(/collapsed/);
  await expect(sheet.locator('.sheet-head')).toBeHidden();
  const box = await sheet.boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeLessThanOrEqual(70);
  expect(box.height).toBeLessThanOrEqual(36);
});
