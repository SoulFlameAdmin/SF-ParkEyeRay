const { test, expect } = require('@playwright/test');

test('intro appears before the Waze-style app and completes through CarTag demo', async ({ page }) => {
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
  await page.route('**/api/v2/parkings?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ parkings: [], meta: { dataSource: 'postgis', fallbackUsed: false, resultCount: 0, liveOccupancy: false } })
  }));
  await page.route('**/api/v2/nearby?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ places: [], meta: { type: 'fuel', source: 'osm', resultCount: 0, liveStatus: false } })
  }));

  await page.goto('/intro.html?next=/v2');
  await expect(page.locator('#s1')).toHaveClass(/active/);
  await expect(page.locator('#counter')).toHaveText('Стъпка 1 от 4');
  await expect(page.locator('body')).not.toContainText('Към картата');

  await page.locator('#next1').click();
  await expect(page.locator('#s2')).toHaveClass(/active/);
  await page.locator('#guest').click();

  await expect(page.locator('#s3')).toHaveClass(/active/);
  await expect(page.locator('#secure-check .check-state')).not.toHaveText('Проверка…');
  await expect(page.locator('#gps-check .check-state')).not.toHaveText('Проверка…');
  await expect(page.locator('#nfc-check .check-state')).not.toHaveText('Проверка…');
  await expect(page.locator('#open-app')).toBeDisabled();

  await page.locator('#demo-detect').click();
  await expect(page.locator('#detected')).toHaveClass(/show/);
  await expect(page.locator('#detected')).toContainText('демо режим');
  await expect(page.locator('#open-app')).toBeEnabled();

  await page.locator('#open-app').click();
  await expect(page.locator('#s4')).toHaveClass(/active/);
  await expect(page.locator('#loader-status')).toContainText('Зареждам');

  await expect(page).toHaveURL(/\/v2$/,{ timeout: 5000 });
  await expect(page.locator('#menu-btn')).toBeVisible();
  await expect(page.locator('#map-menu')).toBeAttached();

  const onboardingVersion = await page.evaluate(() => localStorage.getItem('smartcity_onboarding_version'));
  expect(onboardingVersion).toBe('3');
});
