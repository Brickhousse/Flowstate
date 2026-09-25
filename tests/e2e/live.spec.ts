import { expect, test } from '@playwright/test';
import { addStep } from '../../src/ops/steps';
import { links, open, seed } from './fixtures';

test('a real Claude turn inserts a step between two others', async ({ page, request }) => {
  test.skip(!process.env.LIVE_API, 'Set LIVE_API=1 (and ANTHROPIC_API_KEY in .env) to run against the real API');
  test.setTimeout(120_000);
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'Intake', x: 0, y: 0 });
    addStep(b, { title: 'Approve', after: a });
  });
  await open(page, p);
  await page.getByLabel('Message').fill('Put a step called Review between Intake and Approve');
  await page.getByLabel('Message').press('Enter');
  await expect(page.locator('.chat-chip')).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => links(page), { timeout: 30_000 }).toEqual(['Intake>Review', 'Review>Approve']);
});
