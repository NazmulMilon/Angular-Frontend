import { defineConfig, devices } from '@playwright/test';

/**
 * Browser E2E tests for Admin Portal V2.
 * Starts `ng serve` automatically unless `CI` is set or you pass `--reuseExistingServer`.
 *
 * Assign Vendor routes require a JWT in `?token=` for local dev (`environment.production === false`
 * accepts any token without referrer checks).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 240_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npx ng serve --port 4200 --host 127.0.0.1 --configuration=development',
    url: 'http://127.0.0.1:4200',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
