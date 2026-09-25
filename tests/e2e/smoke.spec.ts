import { expect, test } from '@playwright/test';

test('app loads and the API is reachable through the proxy', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Flowstate');
  const health = await request.get('/api/health');
  expect(await health.json()).toEqual({ ok: true });
});
