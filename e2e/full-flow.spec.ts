import { test, expect } from '@playwright/test';

/**
 * Live Assign Vendor smoke journey against a real job + JWT.
 *
 * **Security:** Do not commit tokens. Set the env var only when running locally:
 *
 * PowerShell:
 *   $env:E2E_ASSIGN_VENDOR_URL="http://localhost:4200/job/<jobKey>/assign-vendor?token=<jwt>"
 *   npm run e2e:full
 *
 * Bash:
 *   E2E_ASSIGN_VENDOR_URL="http://localhost:4200/job/.../assign-vendor?token=..." npm run e2e:full
 *
 * Requires `ng serve` on port 4200 (or Playwright `webServer` / reuseExistingServer).
 */
test.describe('Assign Vendor — full UI flow (authenticated)', () => {
  test.describe.configure({ timeout: 240_000 });

  test('loads job, expands Job Details & AI sourcing, AI panel shows expected content', async ({
    page,
  }) => {
    const url = process.env.E2E_ASSIGN_VENDOR_URL?.trim();
    test.skip(!url, 'Set E2E_ASSIGN_VENDOR_URL to the full assign-vendor URL including ?token=...');

    await page.goto(url!, { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/assign-vendor(\?.*)?$/);

    await expect(page.locator('.page-container')).toBeVisible({ timeout: 120_000 });

    await expect(page.locator('.loading-overlay')).toBeHidden({ timeout: 180_000 });

    const danger = page.locator('.alert--danger');
    if ((await danger.count()) > 0 && (await danger.isVisible())) {
      const msg = await danger.textContent();
      throw new Error(
        `Assign Vendor reported an error (API or validation). Fix data/token then retry.\n${msg}`,
      );
    }

    const jobDetailsBtn = page.getByRole('button', { name: /^Job Details$/ });
    await expect(jobDetailsBtn).toBeVisible();
    await jobDetailsBtn.click();
    await expect(jobDetailsBtn).toHaveAttribute('aria-expanded', 'true');

    await expect(page.getByRole('button', { name: /^Selected Vendors For This Job$/ })).toBeVisible();

    const aiBtn = page.getByRole('button', {
      name: /AI Sourcing Agent.*External Vendors/i,
    });
    await expect(aiBtn).toHaveAttribute('aria-expanded', 'false');
    await aiBtn.click();
    await expect(aiBtn).toHaveAttribute('aria-expanded', 'true');

    const aiSec = page.locator('.ai-sourcing-section');

    await expect(
      aiSec.locator('.ai-sourcing-status, app-data-grid, .ai-sourcing-empty, .ai-sourcing-error').first(),
    ).toBeVisible({ timeout: 120_000 });

    const companyHeaders = aiSec.getByRole('columnheader', { name: 'Company Name' });
    if ((await companyHeaders.count()) > 0) {
      await expect(companyHeaders.first()).toBeVisible();
    } else {
      await expect(
        aiSec
          .getByText(/No external vendors loaded yet/i)
          .or(aiSec.getByText(/AI sourcing completed but found no external vendors/i))
          .or(aiSec.locator('.ai-sourcing-error'))
          .or(aiSec.getByText(/Loading AI sourcing data/i))
          .or(aiSec.getByText(/Checking AI sourcing status every 10 seconds/i)),
      ).toBeVisible();
    }

    const addVendorBtn = page.getByRole('button', { name: /^Add Vendor to Job$/ });
    await expect(addVendorBtn).toBeVisible();
    await expect(addVendorBtn).toHaveAttribute('aria-expanded', 'true');

    await page.screenshot({
      path: 'test-results/full-flow-assign-vendor.png',
      fullPage: true,
    });
  });
});
