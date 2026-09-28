import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Board, XY } from '../../src/model/types';
import { connect } from '../../src/ops/edges';
import { addStep } from '../../src/ops/steps';
import { board, node, open, seed } from './fixtures';

test.use({ viewport: { width: 1600, height: 900 } });

async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return box;
}

async function centerOf(locator: Locator): Promise<XY> {
  const box = await boxOf(locator);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function resetZoom(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
}

async function drag(page: Page, target: Locator, dx: number, dy: number): Promise<void> {
  const c = await centerOf(target);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  // React Flow starts the drag on the first move past its 1px threshold and measures from there.
  await page.mouse.move(c.x + 2, c.y);
  await page.mouse.move(c.x + 2 + dx, c.y + dy, { steps: 10 });
  await page.mouse.up();
}

const pathOf = (page: Page, edgeId: string) => page.locator(`[data-testid="rf__edge-${edgeId}"] .react-flow__edge-path`);

function toScreen(page: Page, edgeId: string, p: XY): Promise<XY> {
  return pathOf(page, edgeId).evaluate((el: SVGPathElement, pt) => {
    const m = el.getScreenCTM();
    if (!m) throw new Error('arrow is not rendered');
    return { x: pt.x * m.a + m.e, y: pt.y * m.d + m.f };
  }, p);
}

function pathStart(page: Page, edgeId: string): Promise<XY> {
  return pathOf(page, edgeId).evaluate((el: SVGPathElement) => {
    const m = el.getScreenCTM();
    if (!m) throw new Error('arrow is not rendered');
    const p = el.getPointAtLength(0);
    return { x: p.x * m.a + m.e, y: p.y * m.d + m.f };
  });
}

const BENDS = [{ x: 300, y: 36 }, { x: 300, y: 336 }];

function shapedPair(label = '') {
  return (b: Board) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: 400, y: 300 });
    connect(b, { source: a, target: c, label });
    b.edges[0].bends = BENDS.map((p) => ({ ...p }));
  };
}

test('an arrow starts at the outer edge of its side dot', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: 400, y: 0 });
    connect(b, { source: a, target: c });
  });
  await open(page, p);
  await resetZoom(page);
  const start = await pathStart(page, 'e3');
  const dot = await boxOf(node(page, 's1').locator('.react-flow__handle-right'));
  expect(Math.abs(start.x - (dot.x + dot.width))).toBeLessThan(0.6);
  expect(Math.abs(start.y - (dot.y + dot.height / 2))).toBeLessThan(0.6);
});

test('a hand-shaped arrow runs through its bends with its label halfway along', async ({ page, request }) => {
  const p = await seed(request, shapedPair('go'));
  await open(page, p);
  await resetZoom(page);
  await expect(pathOf(page, 'e3')).toHaveAttribute('d', 'M185.5 36L 286,36Q 300,36 300,50L 300,322Q 300,336 314,336L394.5 336');
  const label = await centerOf(page.locator('.fs-edge-label'));
  const expected = await toScreen(page, 'e3', { x: 300, y: 176 });
  expect(Math.abs(label.x - expected.x)).toBeLessThan(1);
  expect(Math.abs(label.y - expected.y)).toBeLessThan(1);
});

test('dragging both ends together carries the bends, dragging one end leaves them', async ({ page, request }) => {
  const p = await seed(request, shapedPair());
  await open(page, p);
  await resetZoom(page);
  await node(page, 's1').click();
  await node(page, 's2').click({ modifiers: ['Shift'] });
  await drag(page, node(page, 's1'), 100, 40);
  let b = await board(page);
  const moved = b.nodes.find((n) => n.id === 's1')!;
  expect(moved.x).not.toBe(0);
  expect(b.edges[0].bends).toEqual(BENDS.map((q) => ({ x: q.x + moved.x, y: q.y + moved.y })));
  const carried = b.edges[0].bends;
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await drag(page, node(page, 's2'), 80, 0);
  b = await board(page);
  expect(b.edges[0].bends).toEqual(carried);
  expect(await page.evaluate(() => window.__flowstate!.getState().past.length)).toBe(2);
});

test('Tidy clears the bends and one undo brings them back', async ({ page, request }) => {
  const p = await seed(request, shapedPair());
  await open(page, p);
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('l');
  await expect.poll(async () => (await board(page)).edges[0].bends).toEqual([]);
  await page.keyboard.press('Control+z');
  expect((await board(page)).edges[0].bends).toEqual(BENDS);
});
