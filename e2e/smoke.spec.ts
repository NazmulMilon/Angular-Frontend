import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/');
    /** Route `title` is "Home"; index.html title is overwritten after navigation. */
    await expect(page).toHaveTitle(/Home/i);
    await expect(page.locator('app-root')).toBeVisible();
  });
});
