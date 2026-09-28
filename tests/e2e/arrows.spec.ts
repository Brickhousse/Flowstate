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
  const bar = page.locator('.fs-arrow-bar[data-segment="2"]');
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
  const c = await centerOf(page.locator('.fs-arrow-bar[data-segment="3"]'));
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

async function zoomOutTo48(page: Page): Promise<number> {
  await resetZoom(page);
  const pct = page.getByRole('button', { name: 'Reset zoom to 100%' });
  await expect(pct).toHaveText('100%');
  for (const step of ['83%', '69%', '58%', '48%']) {
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect(pct).toHaveText(step);
  }
  return page.locator('.react-flow__viewport').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
}

test('zoomed out, handles stay grabbable and a segment moves by the pointer distance in board units', async ({ page, request }) => {
  const p = await seed(request, shapedPair());
  await open(page, p);
  const zoom = await zoomOutTo48(page);
  await selectArrow(page, 'e3');
  expect((await boxOf(page.locator('.fs-arrow-bend[data-bend="0"]'))).width).toBeGreaterThanOrEqual(7.5);
  const bar = page.locator('.fs-arrow-bar[data-segment="2"]');
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

test('Reset path in the toolbar returns a hand-shaped arrow to its automatic route', async ({ page, request }) => {
  const p = await seed(request, shapedPair());
  await open(page, p);
  await selectArrow(page, 'e3');
  await page.getByRole('button', { name: 'Reset path' }).click();
  expect((await board(page)).edges[0].bends).toEqual([]);
  expect(await history(page)).toBe(1);
  await expect(page.getByRole('button', { name: 'Reset path' })).toHaveCount(0);
});

async function press(page: Page, target: Locator, dx: number, dy: number): Promise<void> {
  const c = await centerOf(target);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + dx, c.y + dy, { steps: 2 });
  await page.mouse.up();
}

test('a press on a bar of an automatic arrow that moves 2px changes nothing and records no undo step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: 400, y: 300 });
    connect(b, { source: a, target: c });
  });
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e3');
  await press(page, page.locator('.fs-arrow-bar.is-vertical'), 2, 0);
  expect((await board(page)).edges[0].bends).toEqual([]);
  expect(await historyShape(page)).toEqual({ past: 0, future: 0, tx: false });
});

test('a press on a bend square that moves 2px leaves an off-grid bend where it was', async ({ page, request }) => {
  const p = await seed(request, shapedPair());
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e3');
  await press(page, page.locator('.fs-arrow-bend[data-bend="0"]'), 0, 2);
  expect((await board(page)).edges[0].bends).toEqual(BENDS);
  expect(await historyShape(page)).toEqual({ past: 0, future: 0, tx: false });
});

test('a straight arrow shows one bar, and dragging it keeps the ports and records one undo step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: 400, y: 0 });
    connect(b, { source: a, target: c });
  });
  await open(page, p);
  await resetZoom(page);
  await expect(pathOf(page, 'e3')).toHaveAttribute('d', /^M185\.5 36(L[\d.]+ 36)+$/);
  await selectArrow(page, 'e3');
  const bar = page.locator('.fs-arrow-bar');
  await expect(bar).toHaveCount(1);
  const c = await centerOf(bar);
  await dragTo(page, bar, { x: c.x, y: c.y + 60 });
  expect((await board(page)).edges[0]).toMatchObject({ bends: [{ x: 207.5, y: 100 }, { x: 372.5, y: 100 }], source: 's1', target: 's2' });
  const d = await pathOf(page, 'e3').getAttribute('d');
  expect(d?.startsWith('M185.5 36')).toBe(true);
  expect(d?.endsWith('394.5 36')).toBe(true);
  expect(await historyShape(page)).toEqual({ past: 1, future: 0, tx: false });
  await page.keyboard.press('Control+z');
  expect((await board(page)).edges[0].bends).toEqual([]);
});

test('an L-shaped arrow shows two bars', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: 400, y: 300 });
    connect(b, { source: a, target: c });
    b.edges[0].targetSide = 'top';
  });
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e3');
  await expect(page.locator('.fs-arrow-bar.is-horizontal')).toHaveCount(1);
  await expect(page.locator('.fs-arrow-bar.is-vertical')).toHaveCount(1);
});

test("a hand-shaped arrow's end runs get bars, and dragging one keeps its stub at the box", async ({ page, request }) => {
  const p = await seed(request, shapedPair());
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e3');
  await expect(page.locator('.fs-arrow-bar')).toHaveCount(3);
  const bar = page.locator('.fs-arrow-bar[data-segment="1"]');
  const c = await centerOf(bar);
  await dragTo(page, bar, { x: c.x, y: c.y + 60 });
  expect((await board(page)).edges[0].bends).toEqual([{ x: 207.5, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 336 }]);
  await expect(pathOf(page, 'e3')).toHaveAttribute('d', /^M185\.5 36L [\d.]+,36Q 207\.5,36 207\.5,/);
  expect(await historyShape(page)).toEqual({ past: 1, future: 0, tx: false });
});

test('double-clicking a segment bar opens the label editor', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: 400, y: 0 });
    connect(b, { source: a, target: c });
  });
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e3');
  await page.locator('.fs-arrow-bar').dblclick();
  await expect(page.locator('.fs-edge-toolbar').getByLabel('Arrow label')).toBeFocused();
});

function autoPair(targetX: number) {
  return (b: Board) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: targetX, y: 300 });
    connect(b, { source: a, target: c });
  };
}

test('a bar drag that snaps back to where it started leaves an automatic arrow automatic', async ({ page, request }) => {
  const p = await seed(request, autoPair(420));
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e3');
  const bar = page.locator('.fs-arrow-bar.is-vertical');
  const c = await centerOf(bar);
  await dragTo(page, bar, { x: c.x + 5, y: c.y });
  expect((await board(page)).edges[0].bends).toEqual([]);
  expect(await historyShape(page)).toEqual({ past: 0, future: 0, tx: false });
});

test('an undo during a press held below the threshold stands when the pointer then moves on', async ({ page, request }) => {
  const p = await seed(request, autoPair(400));
  await open(page, p);
  await resetZoom(page);
  await page.evaluate((bends) => {
    window.__flowstate!.getState().changeBoard((b) => {
      b.edges[0].bends = bends;
    });
  }, BENDS);
  await selectArrow(page, 'e3');
  const c = await centerOf(page.locator('.fs-arrow-bar[data-segment="2"]'));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await board(page)).edges[0].bends).toEqual([]);
  await page.mouse.move(c.x + 40, c.y - 60, { steps: 5 });
  await page.mouse.up();
  expect((await board(page)).edges[0].bends).toEqual([]);
  expect(await historyShape(page)).toEqual({ past: 0, future: 1, tx: false });
});

test('zoomed out, a 2px press on a bar still changes nothing', async ({ page, request }) => {
  const p = await seed(request, autoPair(400));
  await open(page, p);
  await zoomOutTo48(page);
  await selectArrow(page, 'e3');
  await press(page, page.locator('.fs-arrow-bar.is-vertical'), 2, 0);
  expect((await board(page)).edges[0].bends).toEqual([]);
  expect(await historyShape(page)).toEqual({ past: 0, future: 0, tx: false });
});

function fork(b: Board): void {
  const a = addStep(b, { title: 'A', x: 0, y: 0 });
  const c = addStep(b, { title: 'B', x: 400, y: 0 });
  const d = addStep(b, { title: 'C', x: 400, y: 300 });
  connect(b, { source: a, target: c });
  connect(b, { source: a, target: d, label: 'overflow' });
}

const edgeSelection = (page: Page) => page.evaluate(() => window.__flowstate!.getState().edgeSelection);
const nodeSelection = (page: Page) => page.evaluate(() => window.__flowstate!.getState().selection);
// Negative checks wait two frames so a list that is about to mount has mounted.
async function menusAfterSettling(page: Page): Promise<number> {
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  return page.getByRole('menu').count();
}
const pickList = (page: Page) => page.getByRole('menu', { name: 'Arrows here' });
// A click during the reset zoom animation would close the list as a zoom.
async function zoomSettled(page: Page): Promise<void> {
  await expect.poll(() => page.locator('.react-flow__viewport').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)).toBe(1);
}

async function clickBoard(page: Page, edgeId: string, p: XY, shift = false): Promise<void> {
  const at = await toScreen(page, edgeId, p);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  if (shift) await page.keyboard.up('Shift');
}

test('clicking where two arrows share a line selects the top one and lists both to pick from', async ({ page, request }) => {
  const p = await seed(request, fork);
  await open(page, p);
  await resetZoom(page);
  await clickBoard(page, 'e4', { x: 230, y: 36 });
  expect(await edgeSelection(page)).toEqual(['e5']);
  const rows = pickList(page).getByRole('menuitemradio');
  await expect(rows).toHaveText(['overflow', 'A → B']);
  await expect(rows.first()).toHaveAttribute('aria-checked', 'true');
  await expect(rows.last()).toHaveAttribute('aria-checked', 'false');
  await rows.last().hover();
  await expect(page.locator('.fs-pick-glow path')).toHaveAttribute('d', (await pathOf(page, 'e4').getAttribute('d'))!);
  await rows.last().click();
  expect(await edgeSelection(page)).toEqual(['e4']);
  await expect(pickList(page)).toBeVisible();

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  expect(await edgeSelection(page)).toEqual(['e5']);
  await expect(pickList(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(pickList(page)).toHaveCount(0);
  expect(await edgeSelection(page)).toEqual(['e5']);

  await clickBoard(page, 'e4', { x: 230, y: 36 }, true);
  expect(await edgeSelection(page)).toEqual([]);
  expect(await menusAfterSettling(page)).toBe(0);
  expect(await historyShape(page)).toEqual({ past: 0, future: 0, tx: false });
});

test('the arrow list closes on a click elsewhere, a wheel, a board switch and a toolbar zoom, but not on an edit', async ({ page, request }) => {
  const p = await seed(request, fork);
  await open(page, p);
  await resetZoom(page);
  const reopen = async () => {
    await clickBoard(page, 'e4', { x: 230, y: 36 });
    await expect(pickList(page)).toBeVisible();
  };
  await reopen();
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await expect(pickList(page)).toHaveCount(0);
  await reopen();
  const at = await toScreen(page, 'e4', { x: 230, y: 36 });
  await page.mouse.move(at.x - 40, at.y - 20);
  await page.mouse.wheel(0, 100);
  await expect(pickList(page)).toHaveCount(0);
  await resetZoom(page);
  await zoomSettled(page);
  await reopen();
  await page.evaluate(() => window.__flowstate!.getState().changeBoard((b) => b.nodes[0].x = 20));
  await expect(pickList(page)).toBeVisible();
  await page.evaluate(() => window.__flowstate!.getState().addBoard('Other'));
  await expect(pickList(page)).toHaveCount(0);
  await page.evaluate(() => {
    const s = window.__flowstate!.getState();
    s.setActiveBoard(s.project.boards[0].id);
    s.changeBoard((b) => b.nodes[0].x = 0);
  });
  await resetZoom(page);
  await reopen();
  await page.getByRole('button', { name: 'Zoom out' }).focus();
  await page.keyboard.press('Enter');
  await expect(pickList(page)).toHaveCount(0);
});

test('a click on a lone arrow selects it and opens no list', async ({ page, request }) => {
  const p = await seed(request, threeBoxes);
  await open(page, p);
  await resetZoom(page);
  await clickBoard(page, 'e4', { x: 290, y: 36 });
  expect(await edgeSelection(page)).toEqual(['e4']);
  expect(await menusAfterSettling(page)).toBe(0);
});

test("a click at an arrow's end over the side dot selects the arrow and starts no connection", async ({ page, request }) => {
  const p = await seed(request, threeBoxes);
  await open(page, p);
  await resetZoom(page);
  const at = await toScreen(page, 'e4', { x: 397, y: 36 });
  const onDot = await page.evaluate((q) => !!document.elementFromPoint(q.x, q.y)?.closest('[data-id="s2"] .react-flow__handle-left'), at);
  expect(onDot).toBe(true);
  await page.mouse.click(at.x, at.y);
  expect(await edgeSelection(page)).toEqual(['e4']);
  expect(await nodeSelection(page)).toEqual([]);
  expect(await menusAfterSettling(page)).toBe(0);
  await expect(page.locator('.react-flow__handle.clickconnecting')).toHaveCount(0);

  // The second click of a double-click must not hand the selection to the step either. It goes to the dot
  // directly because the selected arrow's end handle now covers this point.
  await page.evaluate((q) => {
    const el = document.querySelector('[data-id="s2"] .react-flow__handle-left')!;
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: q.x, clientY: q.y, button: 0, bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { clientX: q.x, clientY: q.y, button: 0, detail: 2, bubbles: true }));
  }, at);
  expect(await edgeSelection(page)).toEqual(['e4']);
  expect(await nodeSelection(page)).toEqual([]);

  await node(page, 's3').hover();
  await node(page, 's3').locator('.react-flow__handle-top').click();
  expect(await nodeSelection(page)).toEqual(['s3']);
  expect(await edgeSelection(page)).toEqual([]);
  await expect(page.locator('.react-flow__handle.clickconnecting')).toHaveCount(0);
  await node(page, 's1').hover();
  await node(page, 's1').locator('.react-flow__handle-bottom').click();
  expect((await board(page)).edges).toHaveLength(1);
  expect(await historyShape(page)).toEqual({ past: 0, future: 0, tx: false });
});

test('a click on a dot where two arrows start selects the top one and lists both', async ({ page, request }) => {
  const p = await seed(request, fork);
  await open(page, p);
  await resetZoom(page);
  await node(page, 's1').hover();
  await node(page, 's1').locator('.react-flow__handle-right').click();
  expect(await edgeSelection(page)).toEqual(['e5']);
  expect(await nodeSelection(page)).toEqual([]);
  await expect(pickList(page).getByRole('menuitemradio')).toHaveText(['overflow', 'A → B']);
});

test('keys the arrow list does not handle close it and reach the canvas', async ({ page, request }) => {
  const p = await seed(request, fork);
  await open(page, p);
  await resetZoom(page);
  await clickBoard(page, 'e4', { x: 230, y: 36 });
  await expect(pickList(page)).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(pickList(page)).toHaveCount(0);
  expect((await board(page)).edges.map((e) => e.id)).toEqual(['e4']);
  await page.keyboard.press('Control+z');
  expect((await board(page)).edges.map((e) => e.id)).toEqual(['e4', 'e5']);
});

const pickPanel = (page: Page) => page.locator('.fs-context-menu').filter({ has: pickList(page) });
const pickOptions = (page: Page) => pickPanel(page).getByRole('group', { name: 'Arrow options' });

test('clicking a shared line opens one panel with the arrow list and the options, and no midpoint toolbar', async ({ page, request }) => {
  const p = await seed(request, fork);
  await open(page, p);
  await resetZoom(page);
  await clickBoard(page, 'e4', { x: 230, y: 36 });
  await expect(pickPanel(page)).toHaveCount(1);
  await expect(pickList(page).getByRole('menuitemradio')).toHaveText(['overflow', 'A → B']);
  await expect(pickOptions(page).getByLabel('Arrow label')).toHaveValue('overflow');
  await expect(pickOptions(page).getByTitle('Delete arrow (Del)')).toBeVisible();
  expect(await menusAfterSettling(page)).toBe(1);
  await expect(page.locator('.fs-edge-toolbar')).toHaveCount(0);
});

test('picking the second row keeps the panel open, and a colour picked there goes to that arrow alone in one undo step', async ({ page, request }) => {
  const p = await seed(request, fork);
  await open(page, p);
  await resetZoom(page);
  await clickBoard(page, 'e4', { x: 230, y: 36 });
  const rows = pickList(page).getByRole('menuitemradio');
  await rows.last().click();
  expect(await edgeSelection(page)).toEqual(['e4']);
  await expect(pickPanel(page)).toHaveCount(1);
  await expect(rows.last()).toHaveAttribute('aria-checked', 'true');
  await expect(pickOptions(page).getByLabel('Arrow label')).toHaveValue('');
  await expect(page.locator('.fs-edge-toolbar')).toHaveCount(0);
  await pickOptions(page).getByTitle('Colour', { exact: true }).click();
  await pickOptions(page).getByTitle('violet', { exact: true }).click();
  expect((await board(page)).edges.map((e) => [e.id, e.color])).toEqual([['e4', 'violet'], ['e5', null]]);
  expect(await historyShape(page)).toEqual({ past: 1, future: 0, tx: false });
  await expect(pickPanel(page)).toHaveCount(1);
});

test("typing in the panel's label field keeps the panel open and names the arrow and its row", async ({ page, request }) => {
  const p = await seed(request, fork);
  await open(page, p);
  await resetZoom(page);
  await clickBoard(page, 'e4', { x: 230, y: 36 });
  await pickList(page).getByRole('menuitemradio').last().click();
  const label = pickOptions(page).getByLabel('Arrow label');
  await label.click();
  // b, w and q add flags and z undoes on the canvas, so each must stay in the field.
  await page.keyboard.type('backup queue wz');
  await expect(pickPanel(page)).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(pickList(page).getByRole('menuitemradio')).toHaveText(['overflow', 'backup queue wz']);
  await expect(page.locator('.fs-edge-label', { hasText: 'backup queue wz' })).toBeVisible();
  const edges = (await board(page)).edges;
  expect(edges.map((e) => [e.label, e.flags.length])).toEqual([['backup queue wz', 0], ['overflow', 0]]);
  expect(await historyShape(page)).toEqual({ past: 1, future: 0, tx: false });
  await expect(pickPanel(page)).toHaveCount(1);
});

test('Escape closes the panel from either part and the midpoint toolbar returns, and Tab moves between the parts', async ({ page, request }) => {
  const p = await seed(request, fork);
  await open(page, p);
  await resetZoom(page);
  await clickBoard(page, 'e4', { x: 230, y: 36 });
  await expect(pickList(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pickPanel(page)).toHaveCount(0);
  expect(await edgeSelection(page)).toEqual(['e5']);
  await expect(page.locator('.fs-edge-toolbar').getByLabel('Arrow label')).toHaveValue('overflow');

  await clickBoard(page, 'e4', { x: 230, y: 36 });
  await expect(pickPanel(page)).toHaveCount(1);
  const options = pickOptions(page).getByRole('button');
  await page.keyboard.press('Tab');
  await expect(options.first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(pickList(page)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(options.last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(pickList(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(options.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pickPanel(page)).toHaveCount(0);
  expect(await edgeSelection(page)).toEqual(['e5']);
  await expect(page.locator('.fs-edge-toolbar')).toBeVisible();
  expect(await historyShape(page)).toEqual({ past: 0, future: 0, tx: false });
});

test("the panel's Delete button deletes the selected arrow and closes the panel, and one undo restores it", async ({ page, request }) => {
  const p = await seed(request, fork);
  await open(page, p);
  await resetZoom(page);
  await clickBoard(page, 'e4', { x: 230, y: 36 });
  await pickOptions(page).getByTitle('Delete arrow (Del)').click();
  expect((await board(page)).edges.map((e) => e.id)).toEqual(['e4']);
  await expect(pickPanel(page)).toHaveCount(0);
  expect(await historyShape(page)).toEqual({ past: 1, future: 0, tx: false });
  await page.keyboard.press('Control+z');
  expect((await board(page)).edges.map((e) => e.id)).toEqual(['e4', 'e5']);
});

test('moving from a picked row down to the options leaves no glow on a row the pointer crossed', async ({ page, request }) => {
  const p = await seed(request, fork);
  await open(page, p);
  await resetZoom(page);
  await clickBoard(page, 'e4', { x: 230, y: 36 });
  const rows = pickList(page).getByRole('menuitemradio');
  await rows.first().click();
  const from = await centerOf(rows.first());
  const to = await centerOf(pickOptions(page).getByLabel('Arrow label'));
  await page.mouse.move(to.x, to.y, { steps: 12 });
  expect(from.y).toBeLessThan((await centerOf(rows.last())).y);
  expect((await centerOf(rows.last())).y).toBeLessThan(to.y);
  const glow = page.locator('.fs-pick-glow path');
  const drawn = (await glow.count()) ? await glow.getAttribute('d') : null;
  expect([null, await pathOf(page, 'e5').getAttribute('d')]).toContain(drawn);
});

test('a pointer passing over the list while a label is typed leaves the typing in the field', async ({ page, request }) => {
  const p = await seed(request, fork);
  await open(page, p);
  await resetZoom(page);
  await clickBoard(page, 'e4', { x: 230, y: 36 });
  const rows = pickList(page).getByRole('menuitemradio');
  await rows.last().click();
  const label = pickOptions(page).getByLabel('Arrow label');
  await label.click();
  await page.keyboard.type('x');
  await rows.first().hover();
  await page.keyboard.type('b');
  await expect(label).toBeFocused();
  await expect(label).toHaveValue('xb');
  await expect(pickPanel(page)).toHaveCount(1);
  expect((await board(page)).edges.map((e) => e.flags.length)).toEqual([0, 0]);
});

test('a long arrow list scrolls inside the panel and keeps the options on screen', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 500 });
    for (let i = 0; i < 16; i++) connect(b, { source: a, target: addStep(b, { title: `T${i}`, x: 400, y: i * 100 }), sourceSide: 'right' });
  });
  await open(page, p);
  await resetZoom(page);
  await zoomSettled(page);
  const last = (await board(page)).edges.at(-1)!.id;
  await clickBoard(page, last, { x: 230, y: 536 });
  await expect(pickList(page).getByRole('menuitemradio')).toHaveCount(16);
  const list = pickList(page);
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const del = await boxOf(pickOptions(page).getByTitle('Delete arrow (Del)'));
  expect(del.y + del.height).toBeLessThanOrEqual(900);
  await list.hover();
  await page.mouse.wheel(0, 200);
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(pickPanel(page)).toHaveCount(1);
});

test('a click on the inside of a rounded corner keeps the clicked arrow first in the list', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: 400, y: 300 });
    const d = addStep(b, { title: 'C', x: -400, y: 18 });
    const f = addStep(b, { title: 'D', x: 400, y: 18 });
    connect(b, { source: d, target: f });
    connect(b, { source: a, target: c });
    b.edges[1].bends = BENDS.map((q) => ({ ...q }));
  });
  await open(page, p);
  await resetZoom(page);
  // 8.4 inside the corner curve at (300, 36): within the hit stroke, 9.44 from the straight corner, 8.56 from the arrow below.
  const inside = { x: 296.5 - 8.4 / Math.SQRT2, y: 39.5 + 8.4 / Math.SQRT2 };
  // Clicks land on whole pixels; at 400% that rounding is a quarter of a board unit, inside those margins.
  const before = await toScreen(page, 'e6', inside);
  await page.mouse.move(before.x, before.y);
  await page.mouse.wheel(0, -1000);
  await expect(page.getByRole('button', { name: 'Reset zoom to 100%' })).toHaveText('400%');
  const at = await toScreen(page, 'e6', inside);
  const hit = await page.evaluate((q) => document.elementFromPoint(q.x, q.y)?.closest('.react-flow__edge')?.getAttribute('data-id'), at);
  expect(hit).toBe('e6');
  await page.mouse.click(at.x, at.y);
  expect(await edgeSelection(page)).toEqual(['e6']);
  await expect(pickList(page).getByRole('menuitemradio')).toHaveText(['A → B', 'C → D']);
});

test('a click in the arrow toolbar never opens the arrow list', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: 400, y: 0 });
    const d = addStep(b, { title: 'C', x: 185, y: -300 });
    const f = addStep(b, { title: 'D', x: 185, y: 150 });
    connect(b, { source: a, target: c });
    connect(b, { source: d, target: f, sourceSide: 'bottom', targetSide: 'top' });
  });
  await open(page, p);
  await resetZoom(page);
  await selectArrow(page, 'e5');
  // C to D runs down x = 275, under the label field of A to B's toolbar.
  const label = page.locator('.fs-edge-toolbar').getByLabel('Arrow label');
  await label.click();
  expect(await menusAfterSettling(page)).toBe(0);
  await expect(label).toBeFocused();
  expect(await edgeSelection(page)).toEqual(['e5']);
});

test('a new arrow toolbar never slides in, so a click at once where it would have swept reaches the step under it', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: 400, y: 300 });
    const d = addStep(b, { title: 'C', x: 800, y: 300 });
    connect(b, { source: c, target: d });
  });
  await open(page, p);
  await resetZoom(page);
  // Holding the entry animation on its first frame stands in for a click that lands before it ends.
  await page.addStyleTag({ content: '.fs-toolbar { animation-play-state: paused !important; }' });
  await selectArrow(page, 'e4');
  await expect(page.locator('.fs-edge-toolbar')).toBeAttached();
  const a = await centerOf(node(page, 's1'));
  expect(await page.evaluate((q) => document.elementFromPoint(q.x, q.y)?.closest('.fs-edge-toolbar') ?? null, a)).toBeNull();
  await page.mouse.click(a.x, a.y);
  expect(await nodeSelection(page)).toEqual(['s1']);
  expect(await historyShape(page)).toEqual({ past: 0, future: 0, tx: false });
});

const strokeOf = (page: Page, edgeId: string) => pathOf(page, edgeId).evaluate((el) => getComputedStyle(el).stroke);
const headOf = (page: Page, edgeId: string) =>
  pathOf(page, edgeId).evaluate((el) => {
    const id = /url\('?#(.+?)'?\)/.exec(el.getAttribute('marker-end') ?? '')?.[1];
    const head = id ? document.getElementById(id)?.querySelector('polyline') : null;
    if (!head) throw new Error('arrow has no head');
    return getComputedStyle(head).stroke;
  });
const cssColor = (page: Page, value: string) =>
  page.evaluate((v) => {
    const probe = document.createElement('div');
    probe.style.color = v;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, value);

test('a tint from the arrow toolbar colours the line, head and label in one undo step, under the selected and critical colours', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0, durationMin: 30 });
    const c = addStep(b, { title: 'B', x: 400, y: 0, durationMin: 30 });
    connect(b, { source: a, target: c, label: 'next' });
  });
  await open(page, p);
  await resetZoom(page);
  const [violet, accent, plain, critical] = await Promise.all(['--tint-violet-line', '--accent', '--edge', '--critical'].map((v) => cssColor(page, `var(${v})`)));
  const looks = async () => [await strokeOf(page, 'e3'), await headOf(page, 'e3')];
  const label = page.locator('.fs-edge-label');

  await selectArrow(page, 'e3');
  const bar = page.locator('.fs-edge-toolbar');
  await bar.getByTitle('Colour', { exact: true }).click();
  await bar.getByTitle('violet', { exact: true }).click();
  expect((await board(page)).edges[0].color).toBe('violet');
  expect(await historyShape(page)).toEqual({ past: 1, future: 0, tx: false });
  await expect.poll(looks).toEqual([accent, accent]);
  await expect(label).toHaveCSS('color', violet);

  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await expect.poll(looks).toEqual([violet, violet]);

  await page.keyboard.press('Control+z');
  expect((await board(page)).edges[0].color).toBeNull();
  await expect.poll(looks).toEqual([plain, plain]);
  await page.keyboard.press('Control+Shift+z');
  expect((await board(page)).edges[0].color).toBe('violet');
  await expect.poll(looks).toEqual([violet, violet]);

  await selectArrow(page, 'e3');
  await bar.getByTitle('Colour', { exact: true }).click();
  await bar.getByLabel('Custom colour').fill('#12ab34');
  expect((await board(page)).edges[0].color).toBe('#12ab34');
  expect(await historyShape(page)).toEqual({ past: 2, future: 0, tx: false });
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  const custom = 'rgb(18, 171, 52)';
  await expect.poll(looks).toEqual([custom, custom]);
  await expect(label).toHaveCSS('color', custom);

  await page.getByRole('button', { name: /Critical path/ }).click();
  await expect.poll(looks).toEqual([critical, critical]);
  await expect(label).toHaveCSS('color', custom);
});
