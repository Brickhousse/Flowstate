import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
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

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const marker = (scope: Locator) => scope.getByRole('button', { name: 'Open note' });

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

test('focus leaving the note by Shift+Tab saves and closes it', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Tabbed', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  const before = await history(page);
  await noteButton(page).click();
  await page.keyboard.type('Kept');
  await page.keyboard.press('Shift+Tab');
  await expect(panel(page)).toHaveCount(0);
  expect((await board(page)).nodes[0].note).toBe('Kept');
  expect(await history(page)).toBe(before + 1);
});

test('focus taken by a toolbar button saves the note before a key can delete the step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Stolen', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  const before = await history(page);
  await noteButton(page).click();
  await page.keyboard.type('Kept');
  await page.getByRole('button', { name: 'Colour' }).focus();
  await expect(panel(page)).toHaveCount(0);
  expect(await history(page)).toBe(before + 1);
  await page.keyboard.press('Backspace');
  expect((await board(page)).nodes).toHaveLength(0);
  await page.keyboard.press('Control+z');
  expect((await board(page)).nodes[0].note).toBe('Kept');
});

test('the Note button toggles the note and shows whether it is open', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Toggle', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  const before = await history(page);
  await expect(noteButton(page)).toHaveAttribute('aria-pressed', 'false');
  await noteButton(page).click();
  await expect(noteButton(page)).toHaveAttribute('aria-pressed', 'true');
  await noteButton(page).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(noteButton(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await history(page)).toBe(before);
  await noteButton(page).click();
  await page.keyboard.type('Twice');
  await noteButton(page).click();
  await expect(panel(page)).toHaveCount(0);
  expect((await board(page)).nodes[0].note).toBe('Twice');
  expect(await history(page)).toBe(before + 1);
});

test('the note stays open when the window loses focus', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Alt tab', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await noteButton(page).click();
  await page.keyboard.type('Half written');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(panel(page)).toHaveCount(1);
  await expect(noteInput(page)).toHaveValue('Half written');
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

test('the box shows the first line, and a marker only when there is more to read', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Paragraphs', note: 'First line\n\nMore below', x: 0, y: 0 });
    addStep(b, { title: 'Short', note: 'Short', x: 400, y: 0 });
    addStep(b, { title: 'Long', note: 'This note runs on well past the width of its box without a single line break in it', x: 0, y: 200 });
  });
  await open(page, p);
  await expect(node(page, 's1').locator('.fs-note-text')).toHaveText('First line');
  await expect(marker(node(page, 's1'))).toBeVisible();
  await expect(node(page, 's2').locator('.fs-note-text')).toHaveText('Short');
  await expect(marker(node(page, 's2'))).toHaveCount(0);
  await expect(marker(node(page, 's3'))).toBeVisible();
});

test('the marker opens the note without selecting, dragging or editing the step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Check', note: 'First line\n\nSecond part', x: 0, y: 0 });
  });
  await open(page, p);
  const m = marker(node(page, 's1'));
  await m.click();
  await expect(noteInput(page)).toHaveValue('First line\n\nSecond part');
  expect(await page.evaluate(() => window.__flowstate!.getState().selection)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);

  const c = await centerOf(m);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 80, c.y + 40, { steps: 6 });
  await page.mouse.up();
  expect((await board(page)).nodes[0]).toMatchObject({ x: 0, y: 0 });

  await m.dblclick();
  expect(await page.evaluate(() => window.__flowstate!.getState().editingId)).toBeNull();
  await page.keyboard.press('Escape');
  expect(await history(page)).toBe(0);
});

test('a second click on the marker closes the note and saves it', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Twice', note: 'Start\n\nmore', x: 0, y: 0 });
  });
  await open(page, p);
  const m = marker(node(page, 's1'));
  await m.click();
  await expect(noteInput(page)).toBeFocused();
  await page.keyboard.type(' added');
  await m.click();
  await expect(panel(page)).toHaveCount(0);
  expect((await board(page)).nodes[0].note).toBe('Start\n\nmore added');
  expect(await history(page)).toBe(1);
});

test("opening another step's note saves the one being written", async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'One', x: 0, y: 0 });
    addStep(b, { title: 'Two', note: 'Second\n\nnote', x: 400, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await page.keyboard.press('Shift+F2');
  await page.keyboard.type('Draft one');
  const before = await history(page);
  await marker(node(page, 's2')).click();
  await expect(noteInput(page)).toHaveValue('Second\n\nnote');
  expect((await board(page)).nodes.find((n) => n.id === 's1')?.note).toBe('Draft one');
  expect(await history(page)).toBe(before + 1);
});

test('the reference view shows the note as paragraphs, read-only', async ({ page, request }) => {
  const p = await seed(request, (b, project) => {
    addStep(b, { title: 'Active' });
    const other = createBoard('Reference');
    addStep(other, { title: 'Explained', note: 'One\nstill one\n\nTwo', x: 0, y: 0 });
    project.boards.push(other);
  });
  await open(page, p);
  await page.getByRole('button', { name: 'Reference', exact: true }).click({ modifiers: ['Shift'] });
  const reference = page.locator('.canvas-pane.is-reference');
  await marker(reference.getByTestId('node-s1')).click();
  await expect(panel(page).locator('p')).toHaveText(['One\nstill one', 'Two']);
  await expect(panel(page).locator('textarea')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  expect((await boardNamed(page, 'Reference')).nodes[0].note).toBe('One\nstill one\n\nTwo');
});

test('image export leaves out the note marker', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Export me', note: 'Said aloud\n\nMore', x: 0, y: 0 });
  }, 'Notes export');
  await open(page, p);
  await expect(marker(node(page, 's1'))).toBeVisible();
  await page.getByRole('button', { name: 'Export' }).click();
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'SVG image' }).click()]);
  const text = await readFile((await svg.path())!, 'utf8');
  expect(text).toContain('fs-note-text');
  expect(text).not.toContain('fs-note-marker');
});

test('the marker opens the note from the keyboard, even on a selected step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Keys', note: 'Heard\n\nand read', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await marker(node(page, 's1')).focus();
  await page.keyboard.press('Enter');
  await expect(noteInput(page)).toBeFocused();
  await expect(noteInput(page)).toHaveValue('Heard\n\nand read');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  expect(await history(page)).toBe(0);
  expect((await board(page)).nodes).toHaveLength(1);
});

test('widening a box until its note fits takes the marker away', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Wide', note: 'A first line a little too long for the box', x: 0, y: 0 });
  });
  await open(page, p);
  await expect(marker(node(page, 's1'))).toBeVisible();
  await page.evaluate(() =>
    window.__flowstate!.getState().changeBoard((b) => {
      b.nodes[0].w = 600;
    }),
  );
  await expect(marker(node(page, 's1'))).toHaveCount(0);
});

test('a marker in the reference view opens only the reference note, never the active board one', async ({ page, request }) => {
  const p = await seed(request, (b, project) => {
    addStep(b, { title: 'Same id on the active board', x: 0, y: 0 });
    const other = createBoard('Reference');
    addStep(other, { title: 'Explained', note: 'One\n\nTwo', x: 0, y: 0 });
    project.boards.push(other);
  });
  await open(page, p);
  await page.getByRole('button', { name: 'Reference', exact: true }).click({ modifiers: ['Shift'] });
  await page.evaluate(() => {
    document.body.dataset.panelsOpened = '0';
    new MutationObserver((records) => {
      const opened = records.flatMap((r) => [...r.addedNodes]).filter((n) => n instanceof Element && n.classList.contains('fs-note-panel'));
      document.body.dataset.panelsOpened = String(Number(document.body.dataset.panelsOpened) + opened.length);
    }).observe(document.body, { childList: true });
  });
  await marker(page.locator('.canvas-pane.is-reference').getByTestId('node-s1')).click();
  await expect(panel(page).locator('p')).toHaveText(['One', 'Two']);
  expect(await page.evaluate(() => document.body.dataset.panelsOpened)).toBe('1');
});

async function openReferenceBeside(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Reference', exact: true }).click({ modifiers: ['Shift'] });
  return page.locator('.canvas-pane.is-reference');
}

test('keys while reading a reference note do nothing to the active board', async ({ page, request }) => {
  const p = await seed(request, (b, project) => {
    addStep(b, { title: 'Active', x: 0, y: 0 });
    const other = createBoard('Reference');
    addStep(other, { title: 'Explained', note: 'One\n\nTwo', x: 0, y: 0 });
    project.boards.push(other);
  });
  await open(page, p);
  await node(page, 's1').click();
  const before = await history(page);
  const reference = await openReferenceBeside(page);
  await marker(reference.getByTestId('node-s1')).click();
  await expect(panel(page).locator('p')).toHaveText(['One', 'Two']);
  await page.keyboard.press('Delete');
  await page.keyboard.press('ArrowRight');
  await expect(panel(page)).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(panel(page)).toHaveCount(0);
  expect((await board(page)).nodes).toHaveLength(1);
  expect(await history(page)).toBe(before);
});

test('Tab out of the note saves and closes it without adding a step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Tabbed on', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  const before = await history(page);
  await noteButton(page).click();
  await page.keyboard.type('Forward');
  await page.evaluate(() => {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') setTimeout(() => (document.body.dataset.tabKept = String(e.defaultPrevented)));
    }, true);
  });
  await page.keyboard.press('Tab');
  await expect(panel(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.dataset.tabKept)).toBe('true');
  expect((await board(page)).nodes).toHaveLength(1);
  expect((await board(page)).nodes[0].note).toBe('Forward');
  expect(await history(page)).toBe(before + 1);
});

test('Shift+F2 in the note saves and closes it', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Toggled by key', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  const before = await history(page);
  await page.keyboard.press('Shift+F2');
  await page.keyboard.type('Keyed');
  await page.keyboard.press('Shift+F2');
  await expect(panel(page)).toHaveCount(0);
  expect((await board(page)).nodes[0].note).toBe('Keyed');
  expect(await history(page)).toBe(before + 1);
});
