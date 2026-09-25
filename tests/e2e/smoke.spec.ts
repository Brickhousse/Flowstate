import { expect, test } from '@playwright/test';

test('app loads and the API is reachable through the proxy', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Flowstate');
  const health = await request.get('/api/health');
  expect(await health.json()).toEqual({ ok: true });
});

test('the live API refuses requests addressed to a foreign host', async ({ request }) => {
  const api = 'http://127.0.0.1:8788/api/health';
  expect((await request.get(api)).status()).toBe(200);
  expect((await request.get(api, { headers: { host: 'attacker.example' } })).status()).toBe(403);
  expect((await request.get(api, { headers: { origin: 'http://attacker.example' } })).status()).toBe(403);
});
