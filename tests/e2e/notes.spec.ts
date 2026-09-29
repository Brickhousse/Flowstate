import { expect, test, type Page } from '@playwright/test';
import { createBoard } from '../../src/model/factory';
import type { Board } from '../../src/model/types';
import { addStep } from '../../src/ops/steps';
import { board, node, open, seed } from './fixtures';

const history = (page: Page) => page.evaluate(() => window.__flowstate!.getState().past.length);
const noteInput = (page: Page) => page.getByRole('textbox', { name: 'Note' });
const panel = (page: Page) => page.locator('.fs-note-panel');
const noteButton = (page: Page) => page.getByRole('button', { name: 'Note (Shift+F2)' });

function boardNamed(page: Page, name: string): Promise<Board> {
  return page.evaluate((n) => JSON.parse(JSON.stringify(window.__flowstate!.getState().project.boards.find((b) => b.name === n))), name);
}

test('a note written from the toolbar keeps its paragraphs and is one undo step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Review', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  const before = await history(page);
  await noteButton(page).click();
  await expect(noteInput(page)).toBeFocused();
  await page.keyboard.type('Explain the check.');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Then hand it on.');
  expect(await history(page)).toBe(before);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  expect((await board(page)).nodes[0].note).toBe('Explain the check.\n\nThen hand it on.');
  expect(await history(page)).toBe(before + 1);
  await page.keyboard.press('Control+z');
  expect((await board(page)).nodes[0].note).toBe('');
});

test('Shift+F2 opens the note of the selected step and Ctrl+Enter saves it', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Triage', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await page.keyboard.press('Shift+F2');
  await expect(noteInput(page)).toBeFocused();
  await page.keyboard.type('Line one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('line two');
  await page.keyboard.press('Control+Enter');
  await expect(panel(page)).toHaveCount(0);
  expect((await board(page)).nodes[0].note).toBe('Line one\nline two');
  expect(await page.evaluate(() => window.__flowstate!.getState().editingId)).toBeNull();
});

test('closing the note without a change adds no undo step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Ship', note: 'Keep me', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  const before = await history(page);
  await noteButton(page).click();
  await expect(noteInput(page)).toHaveValue('Keep me');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await noteButton(page).click();
  await page.keyboard.type('  ');
  await page.keyboard.press('Enter');
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await expect(panel(page)).toHaveCount(0);
  expect(await history(page)).toBe(before);
  expect((await board(page)).nodes[0].note).toBe('Keep me');
});

test('a note being written is saved to its own board when the tab changes', async ({ page, request }) => {
  const p = await seed(request, (b, project) => {
    addStep(b, { title: 'Here', x: 0, y: 0 });
    project.boards.push(createBoard('Other'));
  });
  await open(page, p);
  await node(page, 's1').click();
  await page.keyboard.press('Shift+F2');
  await page.keyboard.type('Pinned to board one');
  await page.getByRole('button', { name: 'Other', exact: true }).click();
  await expect(page.locator('.board-tab.is-active')).toHaveText('Other');
  await expect(panel(page)).toHaveCount(0);
  expect((await boardNamed(page, 'Board 1')).nodes[0].note).toBe('Pinned to board one');
  expect((await boardNamed(page, 'Other')).nodes).toHaveLength(0);
});

test('a board switch with no click outside still saves the note to its own board', async ({ page, request }) => {
  const p = await seed(request, (b, project) => {
    addStep(b, { title: 'Here', x: 0, y: 0 });
    project.boards.push(createBoard('Other'));
  });
  await open(page, p);
  await node(page, 's1').click();
  await page.keyboard.press('Shift+F2');
  await page.keyboard.type('Saved on unmount');
  await page.evaluate(() => {
    const st = window.__flowstate!.getState();
    st.setActiveBoard(st.project.boards[1].id);
  });
  await expect(panel(page)).toHaveCount(0);
  expect((await boardNamed(page, 'Board 1')).nodes[0].note).toBe('Saved on unmount');
  expect((await boardNamed(page, 'Other')).nodes).toHaveLength(0);
});

test('deleting the step closes its open note without saving', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Doomed', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await noteButton(page).click();
  await page.keyboard.type('Never saved');
  const before = await history(page);
  await page.evaluate(() =>
    window.__flowstate!.getState().changeBoard((b) => {
      b.nodes = b.nodes.filter((n) => n.id !== 's1');
    }),
  );
  await expect(panel(page)).toHaveCount(0);
  expect(await history(page)).toBe(before + 1);
  expect((await board(page)).nodes).toHaveLength(0);
});

test('dragging another step saves the open note and the drag as two undo steps', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Write', x: 0, y: 0 });
    addStep(b, { title: 'Move', x: 400, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  const before = await history(page);
  await noteButton(page).click();
  await page.keyboard.type('Saved before the drag');
  const box = (await node(page, 's2').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 8 });
  await page.mouse.up();
  await expect(panel(page)).toHaveCount(0);
  const moved = (await board(page)).nodes[1];
  expect(moved.x).not.toBe(400);
  expect((await board(page)).nodes[0].note).toBe('Saved before the drag');
  expect(await history(page)).toBe(before + 2);
  await page.keyboard.press('Control+z');
  expect((await board(page)).nodes[1].x).toBe(400);
  expect((await board(page)).nodes[0].note).toBe('Saved before the drag');
  await page.keyboard.press('Control+z');
  expect((await board(page)).nodes[0].note).toBe('');
});

test('a click on the panel around the text box keeps the typing in the note', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Focus', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await noteButton(page).click();
  await page.keyboard.type('abc');
  await panel(page).click({ position: { x: 3, y: 3 } });
  await expect(noteInput(page)).toBeFocused();
  await page.keyboard.press('Backspace');
  await expect(noteInput(page)).toHaveValue('ab');
  expect((await board(page)).nodes).toHaveLength(1);
});

test('leaving the page with a note open saves it and asks before unloading', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Unload', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await noteButton(page).click();
  await page.keyboard.type('Not lost');
  const asked = page.waitForEvent('dialog', { timeout: 5000 });
  await page.close({ runBeforeUnload: true });
  const dialog = await asked;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  expect((await board(page)).nodes[0].note).toBe('Not lost');
});
