import { expect, test, type Locator, type Page } from '@playwright/test';
import { addStep } from '../../src/ops/steps';
import { board, node, open, seed } from './fixtures';

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function resetZoom(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
}

async function drag(page: Page, id: string, dx: number, dy: number, opts: { keys?: string[]; during?: () => Promise<void> } = {}): Promise<void> {
  const c = await centerOf(node(page, id));
  await page.mouse.move(c.x, c.y);
  for (const k of opts.keys ?? []) await page.keyboard.down(k);
  await page.mouse.down();
  await page.mouse.move(c.x + dx, c.y + dy, { steps: 10 });
  if (opts.during) await opts.during();
  await page.mouse.up();
  for (const k of [...(opts.keys ?? [])].reverse()) await page.keyboard.up(k);
}

async function node0(page: Page, id: string) {
  const b = await board(page);
  const n = b.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
}

test('a plain drag from one dot to another connects those sides', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Collect the signed approval from finance', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 400, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  await node(page, 's1').hover();
  const dot = await centerOf(node(page, 's1').locator('.react-flow__handle-right'));
  // The inner half of the dot: a wide title's step body used to paint over it.
  const from = { x: dot.x - 3, y: dot.y };
  const to = await centerOf(node(page, 's2').locator('.react-flow__handle-left'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, to.y, { steps: 6 });
  await expect(node(page, 's2').locator('.react-flow__handle-left')).toHaveCSS('opacity', '1');
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  expect(await node0(page, 's1')).toMatchObject({ x: 0, y: 0 });
  const b = await board(page);
  expect(b.edges).toHaveLength(1);
  expect(b.edges[0]).toMatchObject({ source: 's1', target: 's2', sourceSide: 'right', targetSide: 'left' });
});
