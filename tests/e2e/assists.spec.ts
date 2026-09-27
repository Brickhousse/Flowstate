import { expect, test, type Locator, type Page } from '@playwright/test';
import { connect } from '../../src/ops/edges';
import { addStep } from '../../src/ops/steps';
import { addText } from '../../src/ops/text';
import { board, node, open, seed } from './fixtures';

test.use({ viewport: { width: 1600, height: 900 } });

async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return box;
}

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await boxOf(locator);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const selection = (page: Page) => page.evaluate(() => [...window.__flowstate!.getState().selection].sort());

async function marquee(page: Page, from: Locator, to: Locator): Promise<Locator> {
  const a = await boxOf(from);
  const b = await boxOf(to);
  await page.mouse.move(a.x - 40, a.y - 40);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width + 40, b.y + b.height + 40, { steps: 12 });
  await page.mouse.up();
  const rect = page.locator('.react-flow__nodesselection-rect');
  await expect(rect).toBeVisible();
  return rect;
}

async function resetZoom(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
}

async function drag(page: Page, target: string | Locator, dx: number, dy: number, opts: { keys?: string[]; during?: () => Promise<void> } = {}): Promise<void> {
  const c = await centerOf(typeof target === 'string' ? node(page, target) : target);
  await page.mouse.move(c.x, c.y);
  for (const k of opts.keys ?? []) await page.keyboard.down(k);
  await page.mouse.down();
  // React Flow starts the drag on the first move past its 1px threshold and measures from there, not from the press.
  await page.mouse.move(c.x + 2, c.y);
  await page.mouse.move(c.x + 2 + dx, c.y + dy, { steps: 10 });
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

// The step's shape paints over its 1px edge resize lines, so resize from the corner and move only sideways.
const cornerOf = (page: Page, id: string) => centerOf(node(page, id).locator('.react-flow__resize-control.handle.bottom.right'));

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

test('layout switches persist across a reload', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await page.getByRole('button', { name: 'Layout assists' }).click();
  const grid = page.getByRole('menuitemcheckbox', { name: 'Snap to grid' });
  await expect(grid).toHaveAttribute('aria-checked', 'true');
  await grid.click();
  await expect(grid).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await page.locator('.react-flow__pane').waitFor();
  await page.getByRole('button', { name: 'Layout assists' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Snap to grid' })).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+Quote');
  await page.getByRole('button', { name: 'Layout assists' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Snap to grid' })).toHaveAttribute('aria-checked', 'true');
});

test('dragging snaps to the grid', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  await drag(page, 's1', 113, 47);
  expect(await node0(page, 's1')).toMatchObject({ x: 120, y: 40 });
});

test('a smart guide beats the grid and shows only while dragging', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 400, y: 203 });
  });
  await open(page, p);
  await resetZoom(page);
  await drag(page, 's2', 0, -200, {
    during: async () => {
      // Playwright calls a horizontal SVG line hidden (0px bounding height), so check the overlay and attachment.
      await expect(page.locator('.fs-guides')).toBeVisible();
      await expect(page.locator('.fs-guide').first()).toBeAttached();
    },
  });
  expect(await node0(page, 's2')).toMatchObject({ x: 400, y: 0 });
  await expect(page.locator('.fs-guide')).toHaveCount(0);
});

test('an equal gap snaps and shows a spacing mark', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 200, y: 0 });
    addStep(b, { title: 'C', x: 503, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  await drag(page, 's3', -100, 0, {
    during: async () => {
      await expect(page.locator('.fs-gap').first()).toBeVisible();
    },
  });
  expect(await node0(page, 's3')).toMatchObject({ x: 400, y: 0 });
});

test('Alt suspends snapping and Shift locks the axis', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 405, y: 203 });
  });
  await open(page, p);
  await resetZoom(page);
  await drag(page, 's2', 0, -200, { keys: ['Alt'] });
  expect(await node0(page, 's2')).toMatchObject({ x: 405, y: 3 });
  await drag(page, 's2', 150, 12, { keys: ['Shift'] });
  expect(await node0(page, 's2')).toMatchObject({ x: 560, y: 3 });
});

test('turning grid snap off lands the drag where it was dropped', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  await page.getByRole('button', { name: 'Layout assists' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Snap to grid' }).click();
  await page.keyboard.press('Escape');
  await drag(page, 's1', 113, 47);
  expect(await node0(page, 's1')).toMatchObject({ x: 113, y: 47 });
});

test('a Shift+drag keeps the pressed node selected', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 400, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  await node(page, 's1').click();
  await drag(page, 's1', 100, 0, { keys: ['Shift'] });
  expect(await selection(page)).toEqual(['s1']);
  await node(page, 's2').click({ modifiers: ['Shift'] });
  await drag(page, 's1', 0, 100, { keys: ['Shift'] });
  expect(await selection(page)).toEqual(['s1', 's2']);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  expect(await node0(page, 's1')).toMatchObject({ x: 100, y: 100 });
  expect(await node0(page, 's2')).toMatchObject({ x: 400, y: 100 });
});

test('a Shift+drag that ends before moving still lets the next drag replace the selection', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 400, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  await node(page, 's1').click();
  const c = await centerOf(node(page, 's1'));
  await page.keyboard.down('Shift');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 2, c.y);
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect(await selection(page)).toEqual(['s1']);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await drag(page, 's2', 100, 0);
  expect(await selection(page)).toEqual(['s2']);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  expect(await node0(page, 's1')).toMatchObject({ x: 0, y: 0 });
  expect(await node0(page, 's2')).toMatchObject({ x: 500, y: 0 });
});

test('dragging a marquee selection by its rectangle snaps and is one undo entry', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 300, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  const rect = await marquee(page, node(page, 's1'), node(page, 's2'));
  await drag(page, rect, 113, 47);
  expect(await node0(page, 's1')).toMatchObject({ x: 120, y: 40 });
  expect(await node0(page, 's2')).toMatchObject({ x: 420, y: 40 });
  expect(await page.evaluate(() => window.__flowstate!.getState().past.length)).toBe(1);
});

test('resizing snaps the dragged edge unless resize snap is off', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  await node(page, 's1').click();
  const edge = await cornerOf(page, 's1');
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 27, edge.y, { steps: 8 });
  await page.mouse.up();
  expect(await node0(page, 's1')).toMatchObject({ x: 0, w: 200 });
  expect(await page.evaluate(() => window.__flowstate!.getState().past.length)).toBe(1);

  await page.getByRole('button', { name: 'Layout assists' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Snap while resizing' }).click();
  await page.keyboard.press('Escape');
  await node(page, 's1').click();
  const edge2 = await cornerOf(page, 's1');
  await page.mouse.move(edge2.x, edge2.y);
  await page.mouse.down();
  await page.mouse.move(edge2.x + 7, edge2.y, { steps: 4 });
  await page.mouse.up();
  expect(await node0(page, 's1')).toMatchObject({ x: 0, w: 207 });
});

async function resizeBy(page: Page, control: Locator, dx: number, dy: number): Promise<void> {
  const c = await centerOf(control);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + dx, c.y + dy, { steps: 8 });
  await page.mouse.up();
}

test('widening text that overflows its height leaves the height alone', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const id = addText(b, { text: 'A long note that wraps over several lines of text', x: 0, y: 0 });
    const t = b.nodes.find((n) => n.id === id);
    if (t) t.w = 100;
  });
  await open(page, p);
  await resetZoom(page);
  const before = await node0(page, 't1');
  expect((await boxOf(node(page, 't1'))).height).toBeGreaterThan(before.h + 20);
  await node(page, 't1').click();
  await resizeBy(page, node(page, 't1').locator('.react-flow__resize-control.line.right'), 27, 0);
  expect(await node0(page, 't1')).toMatchObject({ x: 0, y: 0, w: 120, h: before.h });
});

test('a left-edge resize snaps the left edge and keeps the right edge fixed', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  await node(page, 's1').click();
  await resizeBy(page, node(page, 's1').locator('.react-flow__resize-control.handle.bottom.left'), -27, 0);
  expect(await node0(page, 's1')).toMatchObject({ x: -20, y: 0, w: 200, h: 72 });
  expect(await page.evaluate(() => window.__flowstate!.getState().past.length)).toBe(1);
});

test('Ctrl+drag leaves the original and drops a copy, undone in one step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: 400, y: 0 });
    connect(b, { source: a, target: c });
  });
  await open(page, p);
  await resetZoom(page);
  await drag(page, 's1', 0, 200, {
    keys: ['Control'],
    during: async () => {
      await expect(page.locator('.fs-ghost')).toBeVisible();
    },
  });
  const b = await board(page);
  expect(b.nodes.map((n) => [n.title, n.x, n.y])).toEqual([
    ['A', 0, 0],
    ['B', 400, 0],
    ['A', 0, 200],
  ]);
  expect(b.edges).toHaveLength(1);
  const copyId = b.nodes[2].id;
  expect(await page.evaluate(() => window.__flowstate!.getState().selection)).toEqual([copyId]);
  expect(await page.evaluate(() => window.__flowstate!.getState().past.length)).toBe(1);
  await page.keyboard.press('Control+Z');
  expect((await board(page)).nodes.map((n) => [n.title, n.x, n.y])).toEqual([
    ['A', 0, 0],
    ['B', 400, 0],
  ]);
});

test('Ctrl+Shift+drag drops the copy in line with the original', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  await drag(page, 's1', 300, 15, { keys: ['Control', 'Shift'] });
  expect((await board(page)).nodes.map((n) => [n.x, n.y])).toEqual([
    [0, 0],
    [300, 0],
  ]);
});

test('a copy snaps to its own original', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  await page.getByRole('button', { name: 'Layout assists' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Snap to grid' }).click();
  await page.keyboard.press('Escape');
  await drag(page, 's1', 4, 150, { keys: ['Control'] });
  expect((await board(page)).nodes.map((n) => [n.x, n.y])).toEqual([
    [0, 0],
    [0, 150],
  ]);
});

test('releasing Ctrl before the drop makes it a plain move', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  const c = await centerOf(node(page, 's1'));
  await page.mouse.move(c.x, c.y);
  await page.keyboard.down('Control');
  await page.mouse.down();
  await page.mouse.move(c.x + 2, c.y);
  await page.mouse.move(c.x + 2, c.y + 200, { steps: 10 });
  await page.keyboard.up('Control');
  await page.mouse.up();
  const b = await board(page);
  expect(b.nodes).toHaveLength(1);
  expect(b.nodes[0]).toMatchObject({ x: 0, y: 200 });
});

test('Ctrl+drag of a pair copies both nodes and the arrow between them', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: 300, y: 0 });
    connect(b, { source: a, target: c });
  });
  await open(page, p);
  await resetZoom(page);
  await node(page, 's1').click();
  await node(page, 's2').click({ modifiers: ['Shift'] });
  await drag(page, 's1', 0, 200, { keys: ['Control'] });
  const b = await board(page);
  expect(b.nodes.map((n) => [n.title, n.x, n.y])).toEqual([
    ['A', 0, 0],
    ['B', 300, 0],
    ['A', 0, 200],
    ['B', 300, 200],
  ]);
  const copies = b.nodes.slice(2).map((n) => n.id);
  expect(b.edges.map((e) => [e.source, e.target])).toEqual([['s1', 's2'], copies]);
  expect(await selection(page)).toEqual([...copies].sort());
  expect(await page.evaluate(() => window.__flowstate!.getState().past.length)).toBe(1);
});

test('a Ctrl+drag that snaps back to its start creates nothing', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  await drag(page, 's1', 3, 0, { keys: ['Control'] });
  expect((await board(page)).nodes.map((n) => [n.x, n.y])).toEqual([[0, 0]]);
  expect(await page.evaluate(() => window.__flowstate!.getState().past.length)).toBe(0);
});

test('a custom colour from the toolbar fills the shape in one undo step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await page.getByTitle('Colour', { exact: true }).click();
  await page.getByLabel('Custom colour').fill('#ff8800');
  expect((await node0(page, 's1')).color).toBe('#ff8800');
  await expect(node(page, 's1').locator('.fs-shape-body')).toHaveCSS('fill', 'rgb(255, 136, 0)');
  await expect(node(page, 's1')).toHaveClass(/ink-dark/);
  expect(await page.evaluate(() => window.__flowstate!.getState().past.length)).toBe(1);
});

test('a project carrying an unknown colour still opens with the default fill', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    b.nodes[0].color = 'red';
  });
  await open(page, p);
  await expect(node(page, 's1')).toBeVisible();
  await expect(node(page, 's1')).not.toHaveClass(/tint-|ink-/);
  expect(await node(page, 's1').locator('.fs-shape-body').getAttribute('style')).toBeNull();
});
