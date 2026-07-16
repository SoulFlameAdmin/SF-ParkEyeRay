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

test('boot screen centers the GPS fix before revealing the compact Waze map HUD', async ({ page }) => {
  await mockMapApis(page);
  await page.goto('/v2.html');

  const boot = page.locator('#boot-screen');
  await expect(boot).toContainText('Licensed by SoulFlame');
  await expect(page.locator('body')).toHaveClass(/boot-ready/);
  await expect(boot).toBeHidden();

  const mapState = await page.evaluate(() => {
    const center = window.SFV2.state.map.getCenter();
    return { lat: center.lat, lon: center.lng, zoom: window.SFV2.state.map.getZoom() };
  });
  expect(Math.abs(mapState.lat - 42.6817)).toBeLessThan(0.002);
  expect(Math.abs(mapState.lon - 26.3229)).toBeLessThan(0.002);
  expect(mapState.zoom).toBeGreaterThanOrEqual(16);

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
