import { expect, test } from '@playwright/test';
import { addStep } from '../../src/ops/steps';
import { board, links, node, open, seed } from './fixtures';

test('builds a flow with the keyboard alone', async ({ page, request }) => {
  const p = await seed(request);
  await open(page, p);
  await page.locator('.react-flow__pane').click({ position: { x: 400, y: 300 } });
  await page.keyboard.press('Tab');
  await page.keyboard.type('Intake');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Review');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Approve');
  await page.keyboard.press('Enter');
  expect(await links(page)).toEqual(['Intake>Review', 'Review>Approve']);

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Legal check');
  await page.keyboard.press('Enter');
  expect(await links(page)).toEqual(['Intake>Legal check', 'Intake>Review', 'Review>Approve']);
});

test('single-key shortcuts change shape, actor and flags; typing starts an edit', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Triage', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await page.keyboard.press('2');
  await page.keyboard.press('a');
  await page.keyboard.press('a');
  await page.keyboard.press('b');
  await page.keyboard.type('Waiting on vendor');
  await page.keyboard.press('Enter');
  await node(page, 's1').click();
  await page.keyboard.press('x');
  await page.keyboard.type('yz');
  await page.keyboard.press('Enter');
  const n = (await board(page)).nodes[0];
  expect(n).toMatchObject({ shape: 'decision', actor: 'system', title: 'xyz' });
  expect(n.flags).toMatchObject([{ kind: 'blocker', text: 'Waiting on vendor' }]);
});

test('delete with reconnect, undo, duplicate and select all', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const m = addStep(b, { title: 'B', after: a });
    addStep(b, { title: 'C', after: m });
  });
  await open(page, p);
  await node(page, 's2').click();
  await page.keyboard.press('Shift+Delete');
  expect(await links(page)).toEqual(['A>C']);
  await page.keyboard.press('Control+z');
  expect(await links(page)).toEqual(['A>B', 'B>C']);
  await page.keyboard.press('Control+Shift+z');
  expect(await links(page)).toEqual(['A>C']);
  await page.keyboard.press('Control+z');
  await node(page, 's1').click();
  await page.keyboard.press('Control+d');
  expect((await board(page)).nodes.filter((n) => n.title === 'A')).toHaveLength(2);
  await page.keyboard.press('Control+a');
  expect(await page.evaluate(() => window.__flowstate!.getState().selection.length)).toBe(4);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__flowstate!.getState().selection.length)).toBe(0);
});

test('C toggles the critical path and L tidies', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 500, y: 300 });
    addStep(b, { title: 'B', x: 0, y: 0 });
    b.edges.push({ id: 'e9', source: a, target: 's2', sourceSide: null, targetSide: null, type: 'flow', label: '', flags: [], separate: false, bends: [] });
    b.nextId = 10;
  });
  await open(page, p);
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('c');
  expect(await page.evaluate(() => window.__flowstate!.getState().criticalPath)).toBe(true);
  await page.keyboard.press('l');
  await expect.poll(async () => {
    const b = await board(page);
    return b.nodes[0].x < b.nodes[1].x;
  }).toBe(true);
});

test('Enter and Space on a focused toolbar button press the button without adding a step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Triage', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  const agent = page.locator('.fs-toolbar').getByRole('button', { name: 'AI agent (A)' });
  await agent.focus();
  await page.keyboard.press('Enter');
  let b = await board(page);
  expect(b.nodes).toHaveLength(1);
  expect(b.nodes[0].actor).toBe('agent');
  await agent.focus();
  await page.keyboard.press(' ');
  b = await board(page);
  expect(b.nodes).toHaveLength(1);
  expect(b.nodes[0].actor).toBeNull();
});

test('Ctrl+Y redoes and W adds a warning', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Triage', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await page.keyboard.press('2');
  await page.keyboard.press('Control+z');
  expect((await board(page)).nodes[0].shape).toBe('process');
  await page.keyboard.press('Control+y');
  expect((await board(page)).nodes[0].shape).toBe('decision');
  await node(page, 's1').click();
  await page.keyboard.press('w');
  await page.keyboard.type('Slow vendor');
  await page.keyboard.press('Enter');
  expect((await board(page)).nodes[0].flags).toMatchObject([{ kind: 'warning', text: 'Slow vendor' }]);
});

test('Shift+1 fits the board back into view', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', after: a });
  });
  await open(page, p);
  const viewport = page.locator('.react-flow__viewport');
  const transform = () => viewport.evaluate((el) => getComputedStyle(el).transform);
  const fitted = await transform();
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await page.mouse.move(300, 300);
  await page.mouse.wheel(0, -600);
  await expect.poll(transform).not.toBe(fitted);
  await page.keyboard.press('Shift+1');
  await expect.poll(transform).toBe(fitted);
});
