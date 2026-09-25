import { expect, test } from '@playwright/test';
import { ACTORS, SHAPES } from '../../src/model/types';
import { connect } from '../../src/ops/edges';
import { addFlag } from '../../src/ops/flags';
import { groupSteps } from '../../src/ops/groups';
import { setLanes } from '../../src/ops/lanes';
import { addStep } from '../../src/ops/steps';
import { addText } from '../../src/ops/text';
import { open, seed } from './fixtures';

test('renders every shape, arrow style, lane, group, text and flag', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  const project = await seed(request, (b) => {
    setLanes(b, ['Intake']);
    const ids = SHAPES.map((shape, i) => addStep(b, { shape, title: shape, x: i * 240, y: 400, actor: ACTORS[i % 3] }));
    connect(b, { source: ids[0], target: ids[1] });
    connect(b, { source: ids[1], target: ids[2], type: 'dependency' });
    connect(b, { source: ids[2], target: ids[3], type: 'handoff', label: 'docs' });
    addFlag(b, ids[0], 'blocker', 'No access');
    groupSteps(b, [ids[4], ids[5]], 'Phase one');
    addText(b, { text: 'Hello note', x: 0, y: 250 });
  });
  await open(page, project);
  await expect(page.locator('.react-flow__node-step')).toHaveCount(9);
  await expect(page.locator('.fs-edge.type-flow')).toHaveCount(1);
  await expect(page.locator('.fs-edge.type-dependency')).toHaveCount(1);
  await expect(page.locator('.fs-edge.type-handoff')).toHaveCount(1);
  await expect(page.locator('.fs-edge-label', { hasText: 'docs' })).toBeVisible();
  await expect(page.locator('.flag-blocker')).toBeVisible();
  await expect(page.locator('.fs-lane-label', { hasText: 'Intake' })).toBeVisible();
  await expect(page.getByText('Phase one')).toBeVisible();
  await expect(page.getByText('Hello note')).toBeVisible();
  await expect(page.locator('.actor-agent .fs-actor-chip').first()).toBeVisible();
  await test.info().attach('light', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('follows the system dark theme', async ({ page, request }) => {
  const project = await seed(request, (b) => {
    addStep(b, { title: 'A' });
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page, project);
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(dark).not.toBe(light);
  await test.info().attach('dark', { body: await page.screenshot(), contentType: 'image/png' });
});
