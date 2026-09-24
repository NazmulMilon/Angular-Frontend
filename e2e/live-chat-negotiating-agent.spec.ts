import { expect, test } from '@playwright/test';

const HUB_URL = process.env.E2E_AUTOMATION_HUB_URL?.trim() || 'http://127.0.0.1:3847';
const JOB_OPS_URL = 'https://service-rfi-job-operation-api-dev.retailfixitapp.com';

test.describe('Live Chat negotiating agent — hosted dev E2E', () => {
  test.describe.configure({ timeout: 300_000, mode: 'serial' });

  test('shows readable bulb insight and persists accepted agent totals', async ({ page, request }) => {
    const createFreshJob = process.env.E2E_NEGOTIATION_CREATE_FRESH === '1';
    if (process.env.CI && !createFreshJob) {
      throw new Error(
        'CI negotiating-agent E2E runs must set E2E_NEGOTIATION_CREATE_FRESH=1; reusing an old PO is not allowed.',
      );
    }

    let jobKey = process.env.E2E_NEGOTIATION_JOB_KEY?.trim();
    if (createFreshJob) {
      const jobResponse = await request.post(`${HUB_URL}/api/jobs/full-run`, {
        data: { vendor: process.env.E2E_NEGOTIATION_VENDOR?.trim() || '415Builders' },
      });
      expect(jobResponse.ok()).toBeTruthy();
      const freshJob = (await jobResponse.json()) as { ok?: boolean; jobKey?: string };
      expect(freshJob.ok).toBe(true);
      expect(freshJob.jobKey).toBeTruthy();
      jobKey = freshJob.jobKey;
    }
    test.skip(!jobKey, 'Set E2E_NEGOTIATION_JOB_KEY to a fresh on-site estimate job.');

    const browserErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (
        response.status() >= 400 &&
        (response.url().includes('adminv2-dev.retailfixitapp.com') ||
          response.url().includes('service-rfi-job-operation-api-dev.retailfixitapp.com'))
      ) {
        failedResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
      }
    });

    const launchResponse = await request.post(`${HUB_URL}/api/v2-launch-url`, {
      data: { jobKey, route: 'estimates' },
    });
    expect(launchResponse.ok()).toBeTruthy();
    const launch = (await launchResponse.json()) as { url: string };
    const token = new URL(launch.url).searchParams.get('token');
    expect(token).toBeTruthy();
    const launchUrl = new URL(launch.url);
    const adminBaseUrl = process.env.E2E_ADMIN_BASE_URL?.trim();
    if (adminBaseUrl) {
      const localAdmin = new URL(adminBaseUrl);
      launchUrl.protocol = localAdmin.protocol;
      launchUrl.host = localAdmin.host;
    }

    const authHeaders = { Authorization: `Bearer ${token}` };
    const estimatesUrl = `${JOB_OPS_URL}/api/v1/admin/vendor-bills/job-estimates/${jobKey}?start=0&length=500`;

    await page.goto(launchUrl.toString(), { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Open job chat' })).toBeVisible({
      timeout: 120_000,
    });
    await page.getByRole('button', { name: 'Open job chat' }).click();
    await page.getByRole('button', { name: 'Open job by ID' }).click();
    await page.locator('#lc-new-job').fill(jobKey!);
    await page.locator('.live-chat__new-job-go').click();

    await expect(page.locator('.live-chat__thread-name')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('.live-chat__estimate-title')).toBeVisible({ timeout: 120_000 });

    const negotiateTab = page.locator('.live-chat__main-tabs').getByRole('button', {
      name: 'Negotiate',
    });
    await expect(negotiateTab).toBeVisible({ timeout: 120_000 });
    await negotiateTab.click();

    const agentPanel = page.locator('.live-chat__agent-panel');
    await expect(agentPanel.locator('.live-chat__agent-card').first()).toBeVisible({
      timeout: 180_000,
    });
    await expect(agentPanel.getByRole('alert')).toHaveCount(0);

    const bulbs = agentPanel.getByRole('button', { name: 'Show agent insight' });
    const bulbCount = await bulbs.count();
    expect(bulbCount).toBeGreaterThan(0);
    const firstBulb = bulbs.first();
    await expect(firstBulb).toHaveText('💡');
    await firstBulb.click();

    const insight = agentPanel.locator('.live-chat__agent-reasoning').first();
    await expect(insight).toBeVisible();
    await expect(insight).toContainText('Agent insight');
    const insightText = (await insight.locator('p').innerText()).trim();
    expect(insightText.length).toBeGreaterThan(10);

    const insightFontSize = await insight
      .locator('p')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(insightFontSize).toBeGreaterThanOrEqual(13);

    const cardBox = await agentPanel.locator('.live-chat__agent-card').first().boundingBox();
    const insightBox = await insight.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(insightBox).not.toBeNull();
    expect(insightBox!.x).toBeGreaterThanOrEqual(cardBox!.x - 1);
    expect(insightBox!.x + insightBox!.width).toBeLessThanOrEqual(
      cardBox!.x + cardBox!.width + 1,
    );

    if (process.env.E2E_NEGOTIATION_UI_ONLY === '1') {
      console.log(
        JSON.stringify(
          {
            jobKey,
            mode: 'ui-only',
            bulbCount,
            insightText,
            insightFontSize,
            insightContainedByCard: true,
            failedResponses,
            browserErrors,
          },
          null,
          2,
        ),
      );
      expect
        .soft(
          failedResponses,
          `Unexpected failed HTTP responses:\n${failedResponses.join('\n')}`,
        )
        .toEqual([]);
      expect.soft(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([]);
      return;
    }

    const negotiationResponse = await request.get(
      `${JOB_OPS_URL}/api/v1/admin/vendor-bills/estimates/${await currentEstimateKey(request, estimatesUrl, authHeaders)}/negotiation`,
      { headers: authHeaders },
    );
    expect(negotiationResponse.ok()).toBeTruthy();
    const negotiationBody = await negotiationResponse.json();
    const negotiationLines = negotiationBody?.data?.lines ?? [];
    const laborRecommendation = negotiationLines.find(
      (line: { itemCode?: string }) => line.itemCode === 'LABOR',
    );
    expect(laborRecommendation).toBeTruthy();

    const acceptAll = agentPanel.getByRole('button', { name: 'Accept All' });
    await expect(acceptAll).toBeEnabled();
    const [acceptResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/accept-all') && response.request().method() === 'POST',
        { timeout: 120_000 },
      ),
      acceptAll.click(),
    ]);
    expect(acceptResponse.status()).toBe(200);
    const acceptBody = await acceptResponse.json();
    expect(acceptBody?.status).toBe(true);
    expect(acceptBody?.data?.estimateUpdated).toBe(true);
    if (acceptBody?.data?.partialFailure) {
      expect(acceptBody?.data?.agentUpdated).toBe(false);
      expect(String(acceptBody?.data?.infoMessage || '')).toMatch(/agent/i);
    } else {
      expect(acceptBody?.data?.agentUpdated).toBe(true);
      expect(acceptBody?.data?.status).not.toBe('awaiting_admin');
      expect(Number(acceptBody?.data?.roundsCount)).toBeGreaterThanOrEqual(1);
    }

    const expectedLaborTotal = roundMoney(Number(laborRecommendation.suggestedValue));
    let persistedLaborTotal = Number.NaN;
    let persistedLaborRate = Number.NaN;
    let persistedLaborQty = Number.NaN;

    await expect
      .poll(
        async () => {
          const estimatePage = await request.get(estimatesUrl, { headers: authHeaders });
          if (!estimatePage.ok()) return Number.NaN;
          const body = await estimatePage.json();
          const estimates = body?.data?.estimates?.data ?? [];
          const laborLine = estimates
            .flatMap((estimate: { lineItems?: unknown[] }) => estimate.lineItems ?? [])
            .find((line: { itemCategory?: string }) => line.itemCategory === 'Labor');
          persistedLaborTotal = roundMoney(Number(laborLine?.rowTotal));
          persistedLaborRate = Number(laborLine?.rate);
          persistedLaborQty = Number(laborLine?.quantity);
          return persistedLaborTotal;
        },
        { timeout: 60_000, intervals: [1_000, 2_000, 3_000] },
      )
      .toBe(expectedLaborTotal);

    expect(persistedLaborTotal).toBe(expectedLaborTotal);
    expect(roundMoney(persistedLaborRate * persistedLaborQty)).toBe(expectedLaborTotal);

    expect(
      failedResponses.filter((entry) => !entry.includes('/negotiation/vendor-response')),
      `Unexpected failed HTTP responses:\n${failedResponses.join('\n')}`,
    ).toEqual([]);
    expect(browserErrors, `Browser errors:\n${browserErrors.join('\n')}`).toEqual([]);

    console.log(
      JSON.stringify(
        {
          jobKey,
          estimateKey: await currentEstimateKey(request, estimatesUrl, authHeaders),
          bulbCount,
          insightText,
          insightFontSize,
          expectedLaborTotal,
          persistedLaborTotal,
          persistedLaborRate,
          persistedLaborQty,
          failedResponses,
          browserErrors,
        },
        null,
        2,
      ),
    );
  });
});

async function currentEstimateKey(
  request: import('@playwright/test').APIRequestContext,
  estimatesUrl: string,
  headers: Record<string, string>,
): Promise<string> {
  const response = await request.get(estimatesUrl, { headers });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const estimateKey = body?.data?.estimates?.data?.[0]?.estimateKey;
  expect(estimateKey).toBeTruthy();
  return estimateKey;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
