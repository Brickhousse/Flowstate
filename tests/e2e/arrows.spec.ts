import { expect, test, type Locator, type Page } from '@playwright/test';
import { createBoard } from '../../src/model/factory';
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

function threeBoxes(b: Board): void {
  const a = addStep(b, { title: 'A', x: 0, y: 0 });
  const c = addStep(b, { title: 'B', x: 400, y: 0 });
  addStep(b, { title: 'C', x: 400, y: 300 });
  connect(b, { source: a, target: c });
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

const selectArrow = (page: Page, edgeId: string) => page.evaluate((id) => window.__flowstate!.getState().select([], [id]), edgeId);
const history = (page: Page) => page.evaluate(() => window.__flowstate!.getState().past.length);
const openTx = (page: Page) => page.evaluate(() => window.__flowstate!.getState().tx !== null);

async function dragTo(page: Page, from: Locator, to: XY, opts: { alt?: boolean } = {}): Promise<void> {
  const c = await centerOf(from);
  await page.mouse.move(c.x, c.y);
  if (opts.alt) await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  if (opts.alt) await page.keyboard.up('Alt');
}

test('dragging a segment slides it on the grid, Alt drags it freely, each one undo step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: 400, y: 300 });
    connect(b, { source: a, target: c });
  });
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e3');
  const bar = page.locator('.fs-arrow-bar[data-segment="1"]');
  const c = await centerOf(bar);
  await dragTo(page, bar, { x: c.x + 100, y: c.y });
  expect((await board(page)).edges[0].bends).toEqual([{ x: 400, y: 36 }, { x: 400, y: 336 }]);
  expect(await history(page)).toBe(1);
  await page.keyboard.press('Control+z');
  expect((await board(page)).edges[0].bends).toEqual([]);
  await dragTo(page, bar, { x: c.x + 100, y: c.y }, { alt: true });
  expect((await board(page)).edges[0].bends).toEqual([{ x: 390, y: 36 }, { x: 390, y: 336 }]);
});

test('dragging a bend square moves the bend on the grid in one undo step', async ({ page, request }) => {
  const p = await seed(request, shapedPair());
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e3');
  const square = page.locator('.fs-arrow-bend[data-bend="0"]');
  const c = await centerOf(square);
  await dragTo(page, square, { x: c.x + 47, y: c.y - 23 });
  expect((await board(page)).edges[0].bends).toEqual([{ x: 340, y: 20 }, { x: 300, y: 336 }]);
  expect(await history(page)).toBe(1);
});

test('the reference view shows no arrow handles', async ({ page, request }) => {
  const p = await seed(request, (b, project) => {
    shapedPair()(b);
    const other = createBoard('Reference');
    shapedPair()(other);
    project.boards.push(other);
  });
  await open(page, p);
  await page.getByRole('button', { name: 'Reference', exact: true }).click({ modifiers: ['Shift'] });
  await selectArrow(page, 'e3');
  await expect(page.locator('.fs-canvas-main .fs-arrow-handles')).toHaveCount(1);
  await expect(page.locator('.canvas-pane.is-reference .fs-arrow-handles')).toHaveCount(0);
});

test('a segment dragged onto its neighbour line keeps dragging and ends as one undo step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    shapedPair()(b);
    b.edges[0].bends = [{ x: 300, y: 36 }, { x: 300, y: 150 }, { x: 350, y: 150 }, { x: 350, y: 336 }];
  });
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e3');
  const c = await centerOf(page.locator('.fs-arrow-bar[data-segment="2"]'));
  await page.mouse.move(c.x, c.y);
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(c.x, c.y - 114, { steps: 6 });
  await page.mouse.move(c.x, c.y - 50, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect(await openTx(page)).toBe(false);
  expect(await history(page)).toBe(1);
  expect((await board(page)).edges[0].bends).toEqual([{ x: 300, y: 36 }, { x: 300, y: 100 }, { x: 350, y: 100 }, { x: 350, y: 336 }]);
});

test('deleting the arrow in the middle of a bend drag closes the drag, and one undo brings it back', async ({ page, request }) => {
  const p = await seed(request, shapedPair());
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e3');
  const c = await centerOf(page.locator('.fs-arrow-bend[data-bend="0"]'));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 60, c.y + 40, { steps: 5 });
  await page.keyboard.press('Delete');
  await page.mouse.move(c.x + 90, c.y + 40, { steps: 3 });
  await page.mouse.up();
  expect((await board(page)).edges).toEqual([]);
  expect(await openTx(page)).toBe(false);
  await page.keyboard.press('Control+z');
  expect((await board(page)).edges[0].bends).toEqual(BENDS);
});

test('zoomed out, handles stay grabbable and a segment moves by the pointer distance in board units', async ({ page, request }) => {
  const p = await seed(request, shapedPair());
  await open(page, p);
  await resetZoom(page);
  const pct = page.getByRole('button', { name: 'Reset zoom to 100%' });
  await expect(pct).toHaveText('100%');
  for (const step of ['83%', '69%', '58%', '48%']) {
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect(pct).toHaveText(step);
  }
  const zoom = await page.locator('.react-flow__viewport').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  await selectArrow(page, 'e3');
  expect((await boxOf(page.locator('.fs-arrow-bend[data-bend="0"]'))).width).toBeGreaterThanOrEqual(7.5);
  const bar = page.locator('.fs-arrow-bar[data-segment="1"]');
  const c = await centerOf(bar);
  await dragTo(page, bar, { x: c.x + 50, y: c.y }, { alt: true });
  const [first] = (await board(page)).edges[0].bends;
  expect(first.x).toBeCloseTo(300 + 50 / zoom, 0);
});

const historyShape = (page: Page) =>
  page.evaluate(() => {
    const s = window.__flowstate!.getState();
    return { past: s.past.length, future: s.future.length, tx: s.tx !== null };
  });

test('a few pixels of jitter on an on-grid bend records no undo step and keeps the redo stack', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    shapedPair()(b);
    b.edges[0].bends = [{ x: 300, y: 40 }, { x: 300, y: 340 }];
  });
  await open(page, p);
  await resetZoom(page);
  await page.evaluate(() => {
    const s = window.__flowstate!.getState();
    s.changeBoard((b) => {
      b.nodes[0].title = 'Renamed';
    });
    s.undo();
  });
  expect(await historyShape(page)).toEqual({ past: 0, future: 1, tx: false });
  await selectArrow(page, 'e3');
  const square = page.locator('.fs-arrow-bend[data-bend="0"]');
  const c = await centerOf(square);
  await dragTo(page, square, { x: c.x + 3, y: c.y + 3 });
  expect(await historyShape(page)).toEqual({ past: 0, future: 1, tx: false });
  expect((await board(page)).edges[0].bends).toEqual([{ x: 300, y: 40 }, { x: 300, y: 340 }]);
});

test('double-clicking a bend square opens no label editor and a Shift release keeps the arrow selected', async ({ page, request }) => {
  const p = await seed(request, shapedPair());
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e3');
  const square = page.locator('.fs-arrow-bend[data-bend="0"]');
  await square.dblclick();
  const label = page.locator('.fs-edge-toolbar').getByLabel('Arrow label');
  await expect(label).toBeVisible();
  await expect(label).not.toBeFocused();
  await square.click({ modifiers: ['Shift'] });
  await expect(page.locator('.fs-arrow-handles')).toHaveCount(1);
});

test("a board switch mid-drag leaves the other board's same-id arrow alone", async ({ page, request }) => {
  const p = await seed(request, (b, project) => {
    shapedPair()(b);
    const other = createBoard('Other');
    shapedPair()(other);
    project.boards.push(other);
  });
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e3');
  const c = await centerOf(page.locator('.fs-arrow-bend[data-bend="0"]'));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 60, c.y + 40, { steps: 5 });
  // The move lands in the same task as the switch, before React can unmount the handles.
  await page.evaluate(
    (at) => {
      const s = window.__flowstate!.getState();
      s.setActiveBoard(s.project.boards[1].id);
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: at.x, clientY: at.y, bubbles: true }));
    },
    { x: c.x + 100, y: c.y + 80 },
  );
  await page.mouse.up();
  const boards = await page.evaluate(() => JSON.parse(JSON.stringify(window.__flowstate!.getState().project.boards)) as Board[]);
  expect(boards[1].edges[0].bends).toEqual(BENDS);
  expect(boards[0].edges[0].bends).toEqual([{ x: 400, y: 120 }, { x: 300, y: 336 }]);
  expect(await openTx(page)).toBe(false);
});

test('dragging an arrow end onto a side dot reattaches it, and nowhere else changes nothing', async ({ page, request }) => {
  const p = await seed(request, threeBoxes);
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e4');
  const end = page.locator('.fs-arrow-end[data-end="target"]');
  const top = node(page, 's2').locator('.react-flow__handle-top');
  const c = await centerOf(end);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 30, c.y - 60, { steps: 6 });
  await expect(top).toHaveCSS('opacity', '1');
  const dot = await centerOf(top);
  await page.mouse.move(dot.x, dot.y, { steps: 6 });
  await page.mouse.up();
  expect((await board(page)).edges[0]).toMatchObject({ target: 's2', targetSide: 'top' });
  await dragTo(page, end, await centerOf(node(page, 's3').locator('.react-flow__handle-left')));
  expect((await board(page)).edges[0]).toMatchObject({ target: 's3', targetSide: 'left', bends: [] });
  const before = await history(page);
  await dragTo(page, end, { x: c.x + 200, y: c.y + 400 });
  expect(await history(page)).toBe(before);
  await dragTo(page, end, await centerOf(node(page, 's1').locator('.react-flow__handle-bottom')));
  await expect(page.locator('.toast')).toContainText('Cannot connect s1 to itself.');
  expect((await board(page)).edges[0].target).toBe('s3');
});

test('dropping an end on its own dot records nothing, and deleting the arrow mid-drag hides the dots', async ({ page, request }) => {
  const p = await seed(request, threeBoxes);
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e4');
  const end = page.locator('.fs-arrow-end[data-end="target"]');
  await dragTo(page, end, await centerOf(node(page, 's2').locator('.react-flow__handle-left')));
  expect(await historyShape(page)).toEqual({ past: 0, future: 0, tx: false });
  const c = await centerOf(end);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 40, c.y + 40, { steps: 4 });
  await expect(page.locator('.fs-flow.is-connecting')).toHaveCount(1);
  await page.keyboard.press('Delete');
  await expect(page.locator('.fs-flow.is-connecting')).toHaveCount(0);
  await page.mouse.up();
  expect((await board(page)).edges).toEqual([]);
  expect(await history(page)).toBe(1);
});
