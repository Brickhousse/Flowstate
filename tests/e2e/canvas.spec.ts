import { expect, test, type Page } from '@playwright/test';
import { createBoard } from '../../src/model/factory';
import { ACTORS, SHAPES } from '../../src/model/types';
import { connect } from '../../src/ops/edges';
import { addFlag } from '../../src/ops/flags';
import { groupSteps } from '../../src/ops/groups';
import { setLanes } from '../../src/ops/lanes';
import { addStep } from '../../src/ops/steps';
import { addText } from '../../src/ops/text';
import { node, open, seed } from './fixtures';

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
  await expect(page.locator('.fs-group-label')).toHaveCSS('text-align', 'left');
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

async function dragBy(page: Page, id: string, dx: number, dy: number, release = true): Promise<void> {
  const box = (await node(page, id).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 5 });
  if (release) await page.mouse.up();
}

test('opens the newest project with a notice when the URL project is missing', async ({ page, request }) => {
  await seed(request);
  await page.goto('/?project=nope');
  await page.locator('.react-flow__pane').waitFor();
  await expect(page.getByRole('status')).toContainText('Project not found');
  await expect(page).not.toHaveURL(/project=nope/);
});

test('warns before closing while saves are failing', async ({ page, request }) => {
  let a = '';
  const project = await seed(request, (b) => {
    a = addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, project);
  await page.route('**/api/projects/*', (route) =>
    route.request().method() === 'PUT' ? route.fulfill({ status: 500, json: { error: 'Disk full.' } }) : route.continue(),
  );
  await dragBy(page, a, 40, 80);
  await expect.poll(() => page.evaluate(() => window.__flowstate!.getState().saveStatus)).toBe('error');
  const dialog = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const shown = await dialog;
  expect(shown.type()).toBe('beforeunload');
  await shown.accept();
});

test('switching boards mid-drag still closes the undo entry', async ({ page, request }) => {
  let a = '';
  const project = await seed(request, (b, p) => {
    a = addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 300, y: 0 });
    p.boards.push(createBoard('Second'));
  });
  await open(page, project);
  await dragBy(page, a, 40, 80, false);
  await page.evaluate(() => {
    const s = window.__flowstate!.getState();
    s.setActiveBoard(s.project.boards[1].id);
  });
  await page.mouse.up();
  const state = await page.evaluate(() => {
    const s = window.__flowstate!.getState();
    return { tx: s.tx, past: s.past.length };
  });
  expect(state).toEqual({ tx: null, past: 1 });
});

test('a taller step shows more of a long title', async ({ page, request }) => {
  const title = 'Collect the signed intake form, check every field against the policy register, and escalate any gaps to the owner';
  const p = await seed(request, (b) => {
    addStep(b, { title, x: 0, y: 0 });
    addStep(b, { title, x: 300, y: 0 });
    addStep(b, { title, shape: 'decision', x: 600, y: 0 });
    b.nodes[1].h = 220;
    b.nodes[2].h = 300;
  });
  await open(page, p);
  const clipped = (id: string) => node(page, id).locator('.fs-title').evaluate((el) => el.scrollHeight > el.clientHeight + 1);
  expect(await clipped('s1')).toBe(true);
  expect(await clipped('s2')).toBe(false);
  const band = await node(page, 's3').evaluate((el) => {
    const box = el.getBoundingClientRect();
    const text = el.querySelector('.fs-title')!.getBoundingClientRect();
    return { top: text.top - box.top, bottom: box.bottom - text.bottom, h: box.height };
  });
  expect(band.top).toBeGreaterThanOrEqual(band.h / 4 - 1);
  expect(band.bottom).toBeGreaterThanOrEqual(band.h / 4 - 1);
});
