import { expect, test, type Page } from '@playwright/test';
import { addStep } from '../../src/ops/steps';
import { board, links, node, open, seed } from './fixtures';

test('double-click edits a title inline', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Draft', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Review claim');
  await page.keyboard.press('Enter');
  await expect(node(page, 's1')).toContainText('Review claim');
  expect((await board(page)).nodes[0].title).toBe('Review claim');
});

test('Tab while typing commits and chains the next step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').dblclick();
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  await page.keyboard.type('B');
  await page.keyboard.press('Enter');
  expect(await links(page)).toEqual(['A>B']);
});

test('hover plus adds a connected step and starts editing', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Start', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').hover();
  await node(page, 's1').getByRole('button', { name: 'Add step right' }).click();
  await page.keyboard.type('Next');
  await page.keyboard.press('Enter');
  expect(await links(page)).toEqual(['Start>Next']);
});

test('dragging a step is one undo entry', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  const box = (await node(page, 's1').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 150, { steps: 12 });
  await page.mouse.up();
  const moved = (await board(page)).nodes[0];
  expect(moved.x).not.toBe(0);
  expect(await page.evaluate(() => window.__flowstate!.getState().past.length)).toBe(1);
  await page.evaluate(() => window.__flowstate!.getState().undo());
  expect((await board(page)).nodes[0]).toMatchObject({ x: 0, y: 0 });
});

test('dragging from a handle connects two steps, or creates one on empty canvas', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 400, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').hover();
  const handle = (await node(page, 's1').locator('.react-flow__handle-right').boundingBox())!;
  const target = (await node(page, 's2').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
  await page.mouse.up();
  expect(await links(page)).toEqual(['A>B']);

  await node(page, 's2').hover();
  const h2 = (await node(page, 's2').locator('.react-flow__handle-bottom').boundingBox())!;
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
  await page.mouse.down();
  await page.mouse.move(h2.x, h2.y + 220, { steps: 15 });
  await page.mouse.up();
  await page.keyboard.type('C');
  await page.keyboard.press('Enter');
  expect(await links(page)).toEqual(['A>B', 'B>C']);
});

test('the floating toolbar sets actor, duration, owner and flags', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Triage', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  const bar = page.locator('.fs-toolbar');
  await bar.getByRole('button', { name: 'AI agent (A)' }).click();
  await bar.getByLabel('Duration').fill('2h 30m');
  await bar.getByLabel('Duration').press('Enter');
  await bar.getByLabel('Owner').fill('Intake Agent');
  await bar.getByLabel('Owner').press('Enter');
  await bar.getByRole('button', { name: 'Add blocker (B)' }).click();
  await page.keyboard.type('No API access');
  await page.keyboard.press('Enter');
  const n = (await board(page)).nodes[0];
  expect(n).toMatchObject({ actor: 'agent', durationMin: 150, owner: 'Intake Agent' });
  expect(n.flags).toMatchObject([{ kind: 'blocker', text: 'No API access', resolved: false }]);
  await expect(node(page, 's1')).toContainText('2h 30m');
});

test('an invalid duration shows a message and changes nothing', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Triage', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await page.locator('.fs-toolbar').getByLabel('Duration').fill('soon');
  await page.locator('.fs-toolbar').getByLabel('Duration').press('Enter');
  await expect(page.locator('.toast')).toContainText('Cannot read duration');
  expect((await board(page)).nodes[0].durationMin).toBeNull();
});

test('selecting an arrow shows its toolbar for type and label', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', after: a });
  });
  await open(page, p);
  const edge = page.locator('.react-flow__edge').first();
  await edge.click({ force: true });
  const bar = page.locator('.fs-edge-toolbar');
  await bar.getByRole('button', { name: 'Dependency' }).click();
  await bar.getByLabel('Arrow label').fill('when approved');
  await bar.getByLabel('Arrow label').press('Enter');
  expect((await board(page)).edges[0]).toMatchObject({ type: 'dependency', label: 'when approved' });
});

const pastLength = (page: Page) => page.evaluate(() => window.__flowstate!.getState().past.length);

async function dragFrom(page: Page, box: { x: number; y: number; width: number; height: number }, dx: number, dy: number): Promise<void> {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 12 });
  await page.mouse.up();
}

test('dragging a shift-selected pair is one undo entry', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 300, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await node(page, 's2').click({ modifiers: ['Shift'] });
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await dragFrom(page, (await node(page, 's1').boundingBox())!, 120, 90);
  const [a, b] = (await board(page)).nodes;
  expect(a.x).not.toBe(0);
  expect(b.x).not.toBe(300);
  expect(await pastLength(page)).toBe(1);
  expect(await page.evaluate(() => window.__flowstate!.getState().tx)).toBeNull();
  await page.evaluate(() => window.__flowstate!.getState().undo());
  expect((await board(page)).nodes).toMatchObject([
    { x: 0, y: 0 },
    { x: 300, y: 0 },
  ]);
});

test('dragging a marquee selection by its rectangle is one undo entry', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 300, y: 0 });
  });
  await open(page, p);
  const a = (await node(page, 's1').boundingBox())!;
  const b = (await node(page, 's2').boundingBox())!;
  await page.mouse.move(a.x - 40, a.y - 40);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width + 40, b.y + b.height + 40, { steps: 12 });
  await page.mouse.up();
  const rect = page.locator('.react-flow__nodesselection-rect');
  await expect(rect).toBeVisible();
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await dragFrom(page, (await rect.boundingBox())!, 120, 90);
  const nodes = (await board(page)).nodes;
  expect(nodes[0].x).not.toBe(0);
  expect(nodes[1].x).not.toBe(300);
  expect(await pastLength(page)).toBe(1);
  expect(await page.evaluate(() => window.__flowstate!.getState().tx)).toBeNull();
  await page.evaluate(() => window.__flowstate!.getState().undo());
  expect((await board(page)).nodes).toMatchObject([
    { x: 0, y: 0 },
    { x: 300, y: 0 },
  ]);
});
