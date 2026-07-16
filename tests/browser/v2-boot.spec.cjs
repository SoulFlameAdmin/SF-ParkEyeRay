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

test('boot screen releases the map after the initial GPS result', async ({ page }) => {
  await mockMapApis(page);
  await page.goto('/v2.html');

  const boot = page.locator('#boot-screen');
  await expect(boot).toHaveClass(/is-leaving/, { timeout: 5_000 });
  await expect(boot).toBeHidden({ timeout: 6_000 });
  await expect(page.locator('body')).not.toHaveClass(/booting/);
  await expect(page.locator('body')).toHaveClass(/boot-ready/);
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#menu-btn')).toBeEnabled();
});

test('boot screen has a bounded fallback when GPS never answers', async ({ browser }) => {
  const context = await browser.newContext({ permissions: [] });
  const page = await context.newPage();
  await mockMapApis(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition() {},
        watchPosition() { return 1; },
        clearWatch() {}
      }
    });
  });

  await page.goto('/v2.html');
  await expect(page.locator('#boot-screen')).toBeHidden({ timeout: 11_000 });
  await expect(page.locator('body')).not.toHaveClass(/booting/);
  await expect(page.locator('#search-input')).toBeEnabled();
  await context.close();
});
