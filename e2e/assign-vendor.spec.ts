import { test, expect } from '@playwright/test';

/** Dev-only: `AuthTokenService` accepts any non-empty `?token=` when `environment.production` is false. */
const E2E_JOB_KEY = '00000000-0000-0000-0000-0000000000e2';
const E2E_TOKEN = 'e2e-smoke-token';

test.describe('Assign Vendor (embedded tab)', () => {
  test('loads shell with token — page frame, Job Details, AI Sourcing accordion closed by default', async ({
    page,
  }) => {
    await page.goto(`/job/${E2E_JOB_KEY}/assign-vendor?token=${encodeURIComponent(E2E_TOKEN)}`);

    await expect(page).toHaveURL(`http://127.0.0.1:4200/job/${E2E_JOB_KEY}/assign-vendor`);
    await expect(page.locator('.page-container')).toBeVisible({ timeout: 90_000 });

    await expect(page.getByRole('button', { name: /^Job Details$/ })).toBeVisible();

    const aiAccordion = page.getByRole('button', {
      name: /AI Sourcing Agent.*External Vendors/i,
    });
    await expect(aiAccordion).toBeVisible();
    await expect(aiAccordion).toHaveAttribute('aria-expanded', 'false');
  });

  test('assign-vendor without token stays on route (no bounce to Home)', async ({ page }) => {
    await page.goto(`/job/${E2E_JOB_KEY}/assign-vendor`);
    await expect(page).toHaveURL(new RegExp(`/job/${E2E_JOB_KEY}/assign-vendor/?$`));
    await expect(page).not.toHaveTitle(/Home/i);
  });
});
