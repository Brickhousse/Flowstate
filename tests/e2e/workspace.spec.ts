import { expect, test, type Page } from '@playwright/test';
import { createBoard } from '../../src/model/factory';
import type { Board } from '../../src/model/types';
import { addFlag } from '../../src/ops/flags';
import { setLanes } from '../../src/ops/lanes';
import { addStep } from '../../src/ops/steps';
import { branchParallel } from '../../src/ops/structure';
import { board, links, node, open, seed, titles } from './fixtures';

function boardNamed(page: Page, name: string): Promise<Board> {
  return page.evaluate((n) => JSON.parse(JSON.stringify(window.__flowstate!.getState().project.boards.find((b) => b.name === n))), name);
}

test('boards: add and rename, reference view, delete and undo', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Old step' });
  });
  await open(page, p);
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await page.getByLabel('Board name').fill('Future v1');
  await page.getByLabel('Board name').press('Enter');
  await expect(page.locator('.board-tab.is-active')).toHaveText('Future v1');
  await expect(page.locator('.fs-canvas-main .react-flow__node-step')).toHaveCount(0);
  await page.getByRole('button', { name: 'Board 1', exact: true }).click({ modifiers: ['Shift'] });
  await expect(page.locator('.canvas-pane.is-reference .react-flow__node-step')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close reference' }).click();
  await expect(page.locator('.canvas-pane.is-reference')).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete Future v1' }).click({ force: true });
  await expect(page.locator('.board-tab')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.board-tab')).toHaveCount(2);
});

test('keyboard shortcuts act only on the active board while a reference is open', async ({ page, request }) => {
  const p = await seed(request, (b, project) => {
    addStep(b, { title: 'Active step' });
    const other = createBoard('Reference');
    addStep(other, { title: 'Reference step' });
    project.boards.push(other);
  });
  await open(page, p);
  await page.getByRole('button', { name: 'Reference', exact: true }).click({ modifiers: ['Shift'] });
  const reference = page.locator('.canvas-pane.is-reference');
  await expect(reference.locator('.react-flow__node-step')).toHaveCount(1);
  await page.locator('.fs-canvas-main').getByTestId('node-s1').click();
  await page.keyboard.press('2');
  await expect.poll(async () => (await board(page)).nodes[0].shape).toBe('decision');
  expect((await boardNamed(page, 'Reference')).nodes[0].shape).toBe('process');
  await page.keyboard.press('Delete');
  await expect(page.locator('.fs-canvas-main .react-flow__node-step')).toHaveCount(0);
  await expect(reference.locator('.react-flow__node-step')).toHaveCount(1);
  expect((await boardNamed(page, 'Reference')).nodes.map((n) => n.title)).toEqual(['Reference step']);
});

test('critical path shows the total and dims other steps', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const start = addStep(b, { title: 'Start', durationMin: 60 });
    const end = addStep(b, { title: 'End', after: start, durationMin: 60 });
    const [[fast], [slow]] = branchParallel(b, start, [[{ title: 'Fast' }], [{ title: 'Slow' }]], end);
    b.nodes.find((n) => n.id === fast)!.durationMin = 30;
    b.nodes.find((n) => n.id === slow)!.durationMin = 480;
  });
  await open(page, p);
  await page.getByRole('button', { name: /Critical path/ }).click();
  await expect(page.locator('.cp-total')).toHaveText('1d 2h');
  await expect(page.locator('.fs-step.is-dimmed')).toHaveCount(1);
  await expect(page.locator('.fs-step.is-critical')).toHaveCount(3);
});

test('flags list jumps to the flagged step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A' });
    const c = addStep(b, { title: 'C', after: a });
    addFlag(b, a, 'warning', 'Check SLA');
    addFlag(b, c, 'question', 'Who owns this?');
  });
  await open(page, p);
  await page.getByRole('button', { name: 'Open flags' }).click();
  await expect(page.getByRole('menuitem')).toHaveCount(2);
  await page.getByRole('menuitem', { name: /Who owns this/ }).click();
  expect(await page.evaluate(() => window.__flowstate!.getState().selection)).toEqual(['s2']);
});

test('palette adds connected steps by click and free steps by drag', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Submit', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await page.getByRole('button', { name: 'Decision' }).click();
  await page.keyboard.type('Approved?');
  await page.keyboard.press('Enter');
  expect(await links(page)).toEqual(['Submit>Approved?']);
  expect((await board(page)).nodes[1].shape).toBe('decision');
  await page.getByRole('button', { name: 'Database' }).dragTo(page.locator('.react-flow__pane'), { targetPosition: { x: 700, y: 500 } });
  await page.keyboard.type('CRM');
  await page.keyboard.press('Enter');
  expect((await board(page)).nodes.find((n) => n.title === 'CRM')?.shape).toBe('database');
  expect(await links(page)).toEqual(['Submit>Approved?']);
});

test('lanes can be toggled and renamed inline', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A' });
    setLanes(b, ['Customer']);
  });
  await open(page, p);
  await page.locator('.fs-lane-label', { hasText: 'Customer' }).dblclick();
  await page.getByLabel('Lane name').fill('Client');
  await page.getByLabel('Lane name').press('Enter');
  await expect(page.locator('.fs-lane-label', { hasText: 'Client' })).toBeVisible();
  expect(await titles(page)).toEqual(['A']);
});

test('projects: create, persist across reload, and switch back', async ({ page, request }) => {
  const first = await seed(request, (b) => {
    addStep(b, { title: 'First project step' });
  }, 'First');
  await open(page, first);
  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByRole('menuitem', { name: 'New project' }).click();
  await expect(page).not.toHaveURL(new RegExp(first.id));
  await page.locator('.react-flow__pane').click({ position: { x: 300, y: 300 } });
  await page.keyboard.press('Tab');
  await page.keyboard.type('Persist me');
  await page.keyboard.press('Enter');
  await expect(page.locator('.save-status')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByText('Persist me')).toBeVisible();
  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByRole('menuitem', { name: 'First' }).click();
  await expect(page.getByText('First project step')).toBeVisible();
});

test('zoom bar, direction toggle and theme toggle', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A' });
    addStep(b, { title: 'B', after: a });
  });
  await open(page, p);
  const pct = page.getByRole('button', { name: 'Reset zoom to 100%' });
  const before = await pct.textContent();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(pct).not.toHaveText(before!);
  await page.getByRole('button', { name: /Flow left to right/ }).click();
  await expect.poll(async () => (await board(page)).direction).toBe('TB');
  await expect.poll(async () => {
    const b = await board(page);
    return b.nodes[0].y < b.nodes[1].y;
  }).toBe(true);
  await page.getByRole('button', { name: /Theme/ }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
});
