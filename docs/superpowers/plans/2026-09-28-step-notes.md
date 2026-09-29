# Step Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a step carry a multi-paragraph note that the box shows as one quiet line plus a marker, that anyone can open in one click (editor and reference view), and that the assistant writes explanations into without ever truncating it.

**Architecture:**
- **Pure note rules** live in `src/model/note.ts`: first line, whether there is more, paragraphs, what to save on close, and the summary excerpt.
- **The note panel** is split three ways under `src/canvas/note/`: `noteSession.ts` (plain TypeScript: which note is open, the draft, and the single save on close, pinned to its board), `useNotePanel.tsx` (React glue mounted once per canvas: anchors the panel, closes it when the step or canvas goes away), and `NotePanel.tsx` (rendering only: textarea when editable, paragraphs when read-only). A `NoteOpener` context carries the canvas's `open` function to the marker and the toolbar, the same way `PickPanelOpen` carries the arrow picker state.
- **The box** (`StepNode.tsx`) draws the first line and a `NoteMarker`, and measures note overflow in its existing layout effect. **The assistant** gets note descriptions, a prompt line, a 300 character summary excerpt with a `note-truncated` marker, and a `read_notes` tool.

**Tech Stack:** React 19.3, TypeScript 7, @xyflow/react 12.12, zustand 5, immer 11, zod 4, lucide-react 1.48, vitest 5, Playwright 1.63.

**Spec:** docs/superpowers/specs/2026-09-28-step-notes-design.md

## Deviations from the spec

1. **`useNotePanel` is split into `noteSession.ts` and `useNotePanel.tsx`, plus a `noteOpener.ts` context.** The spec gives one unit "which step's note is open, opening and closing, the single save on close". Vitest runs in a node environment with no DOM, so the save rule (one undo step, none when unchanged, save before switching, pinned board, deleted step) is only testable if it lives outside React. `noteSession.ts` holds it and is unit-tested; `useNotePanel.tsx` is React glue (`.tsx` because it returns JSX, like `useCanvasMenu.tsx`). The marker and the toolbar are rendered by React Flow inside nodes, and step ids repeat across boards (both boards can have an `s1`), so they reach their own canvas's panel through a context, as `PickPanelOpen` does.
2. **Overflow is measured by a separate `noteOverflows(body)` called in the same layout effect, before `fitTitle`, not inside `fitTitle`.** Same single layout read (both only read until `fitTitle`'s final write), and `fitTitle` keeps one job. The spec's performance rule ("inside the existing fitTitle layout effect") holds.
3. **The export test checks the SVG file, not PNG pixels.** PNG and SVG share one `filter` in `src/io/exportImage.ts`, and only the SVG text can show that the marker's element is absent.
4. **"Closes when the board changes" means the panel's canvas switches board or unmounts** (tab switch, reference closed, board deleted), and such a close saves to the board the note was opened on. It does not close on every edit to the board, which would close it whenever the assistant touched anything.
5. **"Closes on wheel":** a wheel outside the panel closes it; a wheel inside scrolls it (`wheelInside="scroll"`), because the textarea scrolls past 12 lines.
6. **The marker is a plain button inside `StepNode`, not a `NoteMarker.tsx` component.** A noted board draws a marker on most steps, and a component with a context read, four handlers and a nine-element lucide icon cost the open budget. The icon is a CSS mask on the button's `::before`; overflow is marked by a `data-overflow` attribute on the note line, so the marker shows by CSS without a re-render; and one capture listener per canvas (`src/canvas/note/useNoteMarkerClicks.ts`) toggles the note, keeps focus where it is, and stops the selection and title edit. For the same reason the marker's `aria-expanded` is written on the DOM by one subscription per canvas (`useNoteMarkerExpanded.ts`).

## Global Constraints

- **Data:** no schema change. `BoardNode.note` stays a `string`. Paragraphs are separated by a blank line (`\n\n`); single line breaks are kept. Saving trims leading and trailing whitespace only.
- **Icon:** lucide `notebook-text`, exported as `NotebookText` from `lucide-react` (verified in `node_modules/lucide-react/dist/lucide-react.d.ts`).
- **Panel:** textarea 320px wide, grows with content up to 12 lines, then scrolls. Enter adds a line break. Escape, Ctrl+Enter (Cmd+Enter), a click outside, wheel outside, window resize or blur, or opening another step's note all close it and save. One open-edit-close session is one undo step; a close with no change adds none. *(Superseded in part by ADR-0019: window blur no longer closes the panel.)*
- **Keys:** Shift+F2 opens the note of a single selected step. F2 alone still edits the title.
- **Summary excerpt:** first 300 characters (code points), a cut note ends with `…` (U+2026) and the step line gains ` note-truncated`.
- **Tool text, verbatim from the spec:** note fields in `add_steps` and `update_steps` are described as "Longer explanation of the step, such as what a presenter would say about it. Separate paragraphs with a blank line. update_steps replaces the whole note."
- **New tool:** `read_notes`, input `{ board?: string; ids: string[] }`. The server tool count goes from 18 to 19.
- **Undo:** every user action is exactly one undo step. Note saves go through one `changeBoard` call. (Checked: `store.change` adds no entry when immer returns the same project, and immer returns the same project when a field is assigned its current value; the session still guards with `noteToSave` so the rule does not depend on that.)
- **Reference view:** read-only. The marker works there and shows the note as paragraphs; nothing is editable.
- **Performance:** no new work on drag or pan paths. The only new per-box work is one overflow read inside the existing layout effect, whose dependencies do not include position. The budget must still pass.
- **Comments:** only for a non-obvious why, at most 3 lines, never restating code or duplicating an ADR (point at it: `// why: ADR-0019`).
- **Punctuation:** no em dashes anywhere, in code, strings, test names, commit messages or docs.
- **Commits:** present tense subject, no `Co-Authored-By` or any other trailer lines. Stage by path, never `git add -A`.
- **Dependencies:** none new. **Type checker:** no casts or ignores to quiet it; `noUnusedLocals` and `noUnusedParameters` are on, so an unused import or helper is an error.
- **Branch:** the controller creates `feat/step-notes` from the tip of `feat/arrow-routing` before Task 1 (notes build on schema 2, which is not merged yet).
- **Playwright on this machine:** `--workers=2` at most, one suite at a time; ports 5174/8788 from `playwright.config.ts`; never kill other dev servers; never run `npm run dev` in this checkout; never set `LIVE_API`. If a worker crashes with 0xC0000409, rerun once.
- **Commands:**
  - Typecheck: `npm run typecheck`
  - Unit tests: `npx vitest run <file>`
  - Browser tests: `npx playwright test <file> --workers=2`
  - Budget (PowerShell): `$env:PERF_BUDGET='1'; npx playwright test tests/e2e/perf.spec.ts --workers=1; Remove-Item Env:PERF_BUDGET`

## Review Focus

1. **Opening another step's note while one has unsaved text** (clicking the other step's marker): the first note must be saved as one undo step and the second must open. Pinned in Task 2 by "saves the open note before opening another" and in Task 4 by "opening another step's note saves the one being written".
2. **Switching the board tab while a note is being written:** the text must land on the step of the board it was opened on, not the newly active board. Pinned in Task 2 by "saves to its own board after another board becomes active" and in Task 3 by "a note being written is saved to its own board when the tab changes".
3. **The step deleted (by the assistant or another shortcut) while its note is open:** the panel must close, nothing must throw, and no undo entry beyond the deletion may appear. Pinned in Task 2 by "drops the draft quietly when the step is gone" and in Task 3 by "deleting the step closes its open note without saving".
4. **A single-line note too long for the box:** the marker must show even though the note has no line break, and a short note must show none. Pinned in Task 4 by "the box shows the first line, and a marker only when there is more to read".
5. **Closing after an edit that only adds whitespace:** no undo step and no change. Pinned in Task 1 by the `noteToSave` whitespace case, in Task 2 by "adds no undo step when closed without an edit or with only whitespace added", and in Task 3 by "closing the note without a change adds no undo step".

## File Map

| File | Responsibility |
|---|---|
| `src/model/note.ts` (new) | Pure note text rules: first line, more-to-read, paragraphs, save-on-close value, summary excerpt |
| `src/canvas/note/noteSession.ts` (new) | Which note is open on one board, its draft, and the single save on close |
| `src/canvas/note/useNotePanel.tsx` (new) | Per-canvas glue: session lifetime, anchor under the step, closing when the step goes |
| `src/canvas/note/NotePanel.tsx` (new) | The popover: textarea when editable, paragraphs when read-only |
| `src/canvas/note/noteOpener.ts` (new) | Context that hands the canvas's `open` to the marker and toolbar |
| `src/canvas/note/NoteMarker.tsx` (new) | The marker button on the box |
| `src/canvas/StepNode.tsx` | Draws the note line and marker; measures overflow in the layout effect |
| `src/canvas/FloatingToolbar.tsx` | The Note button; the note field leaves "More details" |
| `src/canvas/useKeyboard.ts` | Shift+F2 |
| `src/canvas/Canvas.tsx` | Mounts the panel and provides `NoteOpener` |
| `src/canvas/canvas.css` | Note line, marker, panel styles |
| `src/io/exportImage.ts` | Hides the marker in PNG and SVG exports |
| `src/analysis/summary.ts` | Excerpt and `note-truncated` |
| `src/ai/schemas.ts`, `toolDefs.ts`, `executor.ts`, `systemPrompt.ts`, `server/chat.test.ts` | Note descriptions, `read_notes`, prompt line, tool count |
| `tests/e2e/notes.spec.ts` (new) | Browser tests |
| `docs/adr/0019-the-note-panel-saves-on-every-close.md` (new), `docs/adr/README.md`, `README.md`, `PROJECT_STATUS.md` | Decision and docs |

---

## Slice 1: the note panel, marker, toolbar button and Shift+F2

### Task 1: Note text rules

**Files:**
- Create: `src/model/note.ts`
- Test: `src/model/note.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 2, 3, 4):
  - `firstLine(note: string): string`
  - `hasMoreLines(note: string): boolean`
  - `noteParagraphs(note: string): string[]`
  - `noteToSave(current: string, draft: string): string | null` (null means "nothing to save")

- [ ] **Step 1: Write the failing test**

Create `src/model/note.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { firstLine, hasMoreLines, noteParagraphs, noteToSave } from './note';

describe('note rules', () => {
  it('takes the text before the first line break as the first line', () => {
    expect(firstLine('One\nTwo')).toBe('One');
    expect(firstLine('Only')).toBe('Only');
    expect(firstLine('')).toBe('');
  });

  it('has more to read only when a line break follows the first line', () => {
    expect(hasMoreLines('One\n\nTwo')).toBe(true);
    expect(hasMoreLines('Only')).toBe(false);
    expect(hasMoreLines('Only\n')).toBe(false);
  });

  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    expect(noteParagraphs('A\nstill A\n\nB\n\n\nC')).toEqual(['A\nstill A', 'B', 'C']);
    expect(noteParagraphs('')).toEqual([]);
  });

  it('saves the trimmed draft only when it differs from the note', () => {
    expect(noteToSave('Old', ' New \n')).toBe('New');
    expect(noteToSave('Old', 'Old  \n\n')).toBeNull();
    expect(noteToSave('', '   ')).toBeNull();
    expect(noteToSave('Old', '')).toBe('');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/model/note.test.ts`
Expected: FAIL, the import of `./note` cannot be resolved.

- [ ] **Step 3: Write the rules**

Create `src/model/note.ts`:

```ts
export function firstLine(note: string): string {
  return note.trim().split('\n', 1)[0];
}

export function hasMoreLines(note: string): boolean {
  return note.trim().includes('\n');
}

export function noteParagraphs(note: string): string[] {
  return note
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.length > 0);
}

export function noteToSave(current: string, draft: string): string | null {
  const next = draft.trim();
  return next === current.trim() ? null : next;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run src/model/note.test.ts`
Expected: PASS, 4 tests.
Run: `npm run typecheck`
Expected: exits 0 with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/model/note.ts src/model/note.test.ts
git commit -m "Add note text rules for first line, paragraphs and saving"
```

---

### Task 2: Note session

**Files:**
- Create: `src/canvas/note/noteSession.ts`
- Test: `src/canvas/note/noteSession.test.ts`

**Interfaces:**
- Consumes: `noteToSave(current: string, draft: string): string | null` from `src/model/note.ts` (Task 1); `updateSteps(b: Board, updates: StepUpdate[]): string[]` from `src/ops/steps.ts`; `FlowStore` and `createFlowStore(initial?: Project)` from `src/store/store.ts`.
- Produces (used by Task 3):
  - `interface NoteSession { state: StoreApi<{ nodeId: string | null }>; open(nodeId: string): void; edit(text: string): void; close(): void }`
  - `createNoteSession(flow: StoreApi<FlowStore>, boardId: string): NoteSession`
  - `open` on the note already open keeps its draft; `open` on another first closes (and saves) the current one. `edit` is ignored while nothing is open. `close` saves through one `changeBoard(fn, boardId)` only when `noteToSave` returns a value and the step still exists. `open`, `edit` and `close` are plain closures, safe to pass as callbacks.

- [ ] **Step 1: Write the failing test**

Create `src/canvas/note/noteSession.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createProject } from '../../model/factory';
import { addStep, deleteSteps } from '../../ops/steps';
import { createFlowStore } from '../../store/store';
import { createNoteSession } from './noteSession';

function setup() {
  const project = createProject('P');
  const board = project.boards[0];
  const a = addStep(board, { title: 'A', note: 'Old' });
  const b = addStep(board, { title: 'B' });
  const flow = createFlowStore(project);
  const session = createNoteSession(flow, board.id);
  const noteOf = (id: string) => flow.getState().project.boards.find((x) => x.id === board.id)?.nodes.find((n) => n.id === id)?.note;
  const history = () => flow.getState().past.length;
  const openId = () => session.state.getState().nodeId;
  return { flow, session, a, b, boardId: board.id, noteOf, history, openId };
}

describe('note session', () => {
  it('saves an edited note as one undo step when it closes', () => {
    const { flow, session, a, noteOf, history, openId } = setup();
    session.open(a);
    session.edit('First\n\nSecond');
    session.edit('First\n\nSecond part ');
    expect(history()).toBe(0);
    session.close();
    expect(noteOf(a)).toBe('First\n\nSecond part');
    expect(history()).toBe(1);
    expect(openId()).toBeNull();
    flow.getState().undo();
    expect(noteOf(a)).toBe('Old');
  });

  it('adds no undo step when closed without an edit or with only whitespace added', () => {
    const { session, a, noteOf, history } = setup();
    session.open(a);
    session.close();
    session.open(a);
    session.edit('Old \n\n');
    session.close();
    expect(history()).toBe(0);
    expect(noteOf(a)).toBe('Old');
  });

  it('saves the open note before opening another', () => {
    const { session, a, b, noteOf, history, openId } = setup();
    session.open(a);
    session.edit('Changed');
    session.open(b);
    expect(noteOf(a)).toBe('Changed');
    expect(history()).toBe(1);
    expect(openId()).toBe(b);
    session.close();
    expect(history()).toBe(1);
  });

  it('keeps the draft when the open note is opened again', () => {
    const { session, a, noteOf } = setup();
    session.open(a);
    session.edit('Kept');
    session.open(a);
    session.close();
    expect(noteOf(a)).toBe('Kept');
  });

  it('ignores edits while no note is open', () => {
    const { session, a, noteOf, history } = setup();
    session.edit('Stray');
    session.open(a);
    session.close();
    expect(history()).toBe(0);
    expect(noteOf(a)).toBe('Old');
  });

  it('drops the draft quietly when the step is gone', () => {
    const { flow, session, a, history, openId } = setup();
    session.open(a);
    session.edit('Lost');
    flow.getState().changeBoard((x) => deleteSteps(x, [a]));
    const before = history();
    session.close();
    expect(history()).toBe(before);
    expect(openId()).toBeNull();
  });

  it('saves to its own board after another board becomes active', () => {
    const { flow, session, a, boardId, noteOf } = setup();
    session.open(a);
    session.edit('Pinned');
    flow.getState().addBoard('Other');
    expect(flow.getState().activeBoardId).not.toBe(boardId);
    session.close();
    expect(noteOf(a)).toBe('Pinned');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/canvas/note/noteSession.test.ts`
Expected: FAIL, the import of `./noteSession` cannot be resolved.

- [ ] **Step 3: Write the session**

Create `src/canvas/note/noteSession.ts`:

```ts
import { createStore, type StoreApi } from 'zustand/vanilla';
import { noteToSave } from '../../model/note';
import { updateSteps } from '../../ops/steps';
import type { FlowStore } from '../../store/store';

export interface NoteSession {
  state: StoreApi<{ nodeId: string | null }>;
  open(nodeId: string): void;
  edit(text: string): void;
  close(): void;
}

export function createNoteSession(flow: StoreApi<FlowStore>, boardId: string): NoteSession {
  const state = createStore<{ nodeId: string | null }>()(() => ({ nodeId: null }));
  let draft: string | null = null;

  const close = () => {
    const { nodeId } = state.getState();
    const text = draft;
    draft = null;
    if (!nodeId) return;
    state.setState({ nodeId: null });
    const node = flow.getState().project.boards.find((b) => b.id === boardId)?.nodes.find((n) => n.id === nodeId);
    const note = node && text !== null ? noteToSave(node.note, text) : null;
    if (note !== null) flow.getState().changeBoard((b) => updateSteps(b, [{ id: nodeId, note }]), boardId);
  };

  return {
    state,
    open(nodeId) {
      if (state.getState().nodeId === nodeId) return;
      close();
      state.setState({ nodeId });
    },
    edit(text) {
      if (state.getState().nodeId) draft = text;
    },
    close,
  };
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run src/canvas/note/noteSession.test.ts`
Expected: PASS, 7 tests.
Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/note/noteSession.ts src/canvas/note/noteSession.test.ts
git commit -m "Add the note session that saves once when the note closes"
```

---

### Task 3: The note panel, the toolbar Note button and Shift+F2

**Files:**
- Create: `src/canvas/note/noteOpener.ts`, `src/canvas/note/NotePanel.tsx`, `src/canvas/note/useNotePanel.tsx`
- Modify: `src/canvas/Canvas.tsx` (imports; the `useKeyboard(boardId, editable);` line; the `<PickPanelOpen>` block around `<ReactFlow>`)
- Modify: `src/canvas/useKeyboard.ts` (the `useKeyboard` signature, the `case 'F2':` branch, the effect dependency list)
- Modify: `src/canvas/FloatingToolbar.tsx` (imports, a Note `ToolButton`, remove the "Note" `FieldInput` from the `more` row)
- Modify: `src/canvas/canvas.css` (append panel styles)
- Test: `tests/e2e/notes.spec.ts` (new)

**Interfaces:**
- Consumes: `createNoteSession`, `NoteSession` (Task 2); `noteParagraphs` (Task 1); `Popup` from `src/canvas/menu/Popup.tsx` (`{ at: XY; onClose: () => void; wheelInside: 'close' | 'scroll'; className?: string; children: ReactNode }`); `boardOf(boardId: string): Board | undefined` from `src/canvas/commands.ts`; `flowStore` from `src/store/store.ts`; `useReactFlow().flowToScreenPosition`.
- Produces (used by Task 4):
  - `NoteOpener: React.Context<(nodeId: string) => void>` in `src/canvas/note/noteOpener.ts`
  - `useNotePanel(boardId: string, editable: boolean, board: Board | undefined): { open: (nodeId: string) => void; panel: ReactNode }`
  - `NotePanel` renders inside `.fs-context-menu.fs-note-panel`; the editable textarea has accessible name `Note`; read-only paragraphs are `<p>` elements inside `.fs-note-read`.
  - `useKeyboard(boardId: string, enabled: boolean, openNote: (nodeId: string) => void): void`
  - Toolbar button with accessible name `Note (Shift+F2)`.
  - `tests/e2e/notes.spec.ts` with helpers `history`, `noteInput`, `panel`, `noteButton`, `boardNamed`.

- [ ] **Step 1: Write the failing browser tests**

Create `tests/e2e/notes.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx playwright test tests/e2e/notes.spec.ts --workers=2`
Expected: FAIL, 5 failed. The toolbar tests time out waiting for the `Note (Shift+F2)` button; the Shift+F2 tests time out waiting for the `Note` textbox.

- [ ] **Step 3: Add the opener context**

Create `src/canvas/note/noteOpener.ts`:

```ts
import { createContext } from 'react';

export const NoteOpener = createContext<(nodeId: string) => void>(() => {});
```

- [ ] **Step 4: Add the panel**

Create `src/canvas/note/NotePanel.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { noteParagraphs } from '../../model/note';
import type { XY } from '../../model/types';
import { Popup } from '../menu/Popup';

type Props = { at: XY; note: string; editable: boolean; onEdit: (text: string) => void; onClose: () => void };

export function NotePanel({ at, note, editable, onEdit, onClose }: Props) {
  return (
    <Popup at={at} onClose={onClose} wheelInside="scroll" className="fs-note-panel">
      {editable ? <NoteEditor note={note} onEdit={onEdit} onClose={onClose} /> : <NoteReader note={note} onClose={onClose} />}
    </Popup>
  );
}

function fitHeight(el: HTMLTextAreaElement): void {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
}

function NoteEditor({ note, onEdit, onClose }: { note: string; onEdit: (text: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    fitHeight(el);
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <textarea
      ref={ref}
      className="fs-note-input"
      aria-label="Note"
      placeholder="What would you say about this step? A blank line starts a new paragraph."
      defaultValue={note}
      onChange={(e) => {
        fitHeight(e.currentTarget);
        onEdit(e.currentTarget.value);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          onClose();
        }
      }}
    />
  );
}

function NoteReader({ note, onClose }: { note: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div
      ref={ref}
      className="fs-note-read"
      role="region"
      aria-label="Note"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        onClose();
      }}
    >
      {noteParagraphs(note).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Add the per-canvas hook**

Create `src/canvas/note/useNotePanel.tsx`:

```tsx
import { useReactFlow } from '@xyflow/react';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { Board } from '../../model/types';
import { flowStore } from '../../store/store';
import { boardOf } from '../commands';
import { NotePanel } from './NotePanel';
import { createNoteSession } from './noteSession';

const PANEL_GAP = 8;

type NotePanelHandle = { open: (nodeId: string) => void; panel: ReactNode };

export function useNotePanel(boardId: string, editable: boolean, board: Board | undefined): NotePanelHandle {
  const rf = useReactFlow();
  const session = useMemo(() => createNoteSession(flowStore, boardId), [boardId]);
  const nodeId = useStore(session.state, (s) => s.nodeId);
  const node = nodeId ? board?.nodes.find((n) => n.id === nodeId) : undefined;

  useEffect(() => () => session.close(), [session]);
  useEffect(() => {
    if (nodeId && !node) session.close();
  }, [session, nodeId, node]);

  const at = useMemo(() => {
    const n = nodeId ? boardOf(boardId)?.nodes.find((x) => x.id === nodeId) : undefined;
    if (!n) return null;
    const p = rf.flowToScreenPosition({ x: n.x, y: n.y + n.h });
    return { x: p.x, y: p.y + PANEL_GAP };
  }, [rf, boardId, nodeId]);

  const panel = node && at ? <NotePanel key={node.id} at={at} note={node.note} editable={editable} onEdit={session.edit} onClose={session.close} /> : null;
  return { open: session.open, panel };
}
```

- [ ] **Step 6: Wire Shift+F2**

In `src/canvas/useKeyboard.ts`, change the signature line

```ts
export function useKeyboard(boardId: string, enabled: boolean): void {
```

to

```ts
export function useKeyboard(boardId: string, enabled: boolean, openNote: (nodeId: string) => void): void {
```

Replace the F2 case

```ts
        case 'F2':
          if (one) {
            e.preventDefault();
            st.setEditing(one);
          }
          return;
```

with

```ts
        case 'F2':
          if (e.shiftKey) {
            if (oneStep) {
              e.preventDefault();
              openNote(oneStep);
            }
          } else if (one) {
            e.preventDefault();
            st.setEditing(one);
          }
          return;
```

and change the effect's last line `}, [rf, boardId, enabled]);` to `}, [rf, boardId, enabled, openNote]);`.

- [ ] **Step 7: Mount the panel in the canvas**

In `src/canvas/Canvas.tsx`, add two imports beside the other `./` imports (keep alphabetical order by path):

```ts
import { NoteOpener } from './note/noteOpener';
import { useNotePanel } from './note/useNotePanel';
```

Replace

```ts
  useKeyboard(boardId, editable);
```

with

```ts
  const notes = useNotePanel(boardId, editable, board);
  useKeyboard(boardId, editable, notes.open);
```

Wrap the `<ReactFlow>` element in the opener, re-indenting the element one level. The opening becomes:

```tsx
    <PickPanelOpen value={picker.open}>
      <NoteOpener value={notes.open}>
        <ReactFlow<FlowNode, FlowEdgeType>
```

and the closing becomes:

```tsx
        </ReactFlow>
      </NoteOpener>
    </PickPanelOpen>
```

Inside `<ReactFlow>`, after `{picker.panel}`, add `{notes.panel}`.

- [ ] **Step 8: Replace the toolbar note field with a Note button**

In `src/canvas/FloatingToolbar.tsx`:

Change `import { Ellipsis } from 'lucide-react';` to `import { Ellipsis, NotebookText } from 'lucide-react';` and `import { useState } from 'react';` to `import { useContext, useState } from 'react';`. Add `import { NoteOpener } from './note/noteOpener';` after the `./labels` import.

After `const toggle = (p: Panel) => setPanel(panel === p ? null : p);` add:

```ts
  const openNote = useContext(NoteOpener);
```

Between the Colour button and the More details button, add:

```tsx
        <ToolButton title="Note (Shift+F2)" onClick={() => openNote(node.id)}>
          <NotebookText size={15} />
        </ToolButton>
```

Delete this line from the `panel === 'more'` row:

```tsx
          <FieldInput label="Note" width={220} placeholder="One-line note" value={node.note} onCommit={(note) => update({ note })} />
```

- [ ] **Step 9: Style the panel**

Append to `src/canvas/canvas.css`:

```css
.fs-context-menu.fs-note-panel {
  width: 320px;
  box-sizing: border-box;
  padding: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-md);
}
.fs-note-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-height: 68px;
  max-height: 230px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  line-height: 18px;
  resize: none;
  overflow-y: auto;
  outline: none;
}
.fs-note-input:focus {
  border-color: var(--accent);
  background: var(--surface);
}
.fs-note-read {
  max-height: 60vh;
  overflow-y: auto;
  padding: 2px 4px;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--text);
  outline: none;
}
.fs-note-read p {
  margin: 0 0 8px;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.fs-note-read p:last-child {
  margin-bottom: 0;
}
```

(`min-height` is 3 lines of 18px plus 14px of padding and border; `max-height` is 12 lines plus the same.)

- [ ] **Step 10: Run the tests and the typecheck**

Run: `npm run typecheck`
Expected: exits 0.
Run: `npx playwright test tests/e2e/notes.spec.ts --workers=2`
Expected: 5 passed.
Run: `npx playwright test tests/e2e/keyboard.spec.ts --workers=2`
Expected: all passed (F2 title editing unchanged).

- [ ] **Step 11: Commit**

```bash
git add src/canvas/note/noteOpener.ts src/canvas/note/NotePanel.tsx src/canvas/note/useNotePanel.tsx src/canvas/Canvas.tsx src/canvas/useKeyboard.ts src/canvas/FloatingToolbar.tsx src/canvas/canvas.css tests/e2e/notes.spec.ts
git commit -m "Open a step's note in a panel from the toolbar and Shift+F2"
```

---

### Task 4: The note line and marker on the box

**Files:**
- Create: `src/canvas/note/NoteMarker.tsx`
- Modify: `src/canvas/StepNode.tsx` (imports; add `noteOverflows` above `fitTitle`; the layout effect; the `.fs-note` line)
- Modify: `src/canvas/canvas.css` (replace the `.fs-note` rule, currently lines 123 to 131)
- Modify: `src/io/exportImage.ts` (the `HIDDEN` list)
- Test: `tests/e2e/notes.spec.ts` (imports; append tests)

**Interfaces:**
- Consumes: `NoteOpener` (Task 3); `firstLine`, `hasMoreLines` (Task 1); `history`, `noteInput`, `panel` helpers in `notes.spec.ts` (Task 3).
- Produces: `NoteMarker({ nodeId }: { nodeId: string })`, a button with accessible name `Open note` and class `fs-note-marker`; the box's note text in `.fs-note > .fs-note-text`.

- [ ] **Step 1: Write the failing browser tests**

In `tests/e2e/notes.spec.ts`, replace the first import line with:

```ts
import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
```

Add after the `boardNamed` function:

```ts
async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const marker = (scope: Locator) => scope.getByRole('button', { name: 'Open note' });
```

Append to the end of the file:

```ts
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
```

(`.toHaveText` on a `<p>` with `white-space: pre-line` compares against `textContent`, which keeps the `\n`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx playwright test tests/e2e/notes.spec.ts --workers=2`
Expected: the 5 Task 3 tests pass; the 5 new tests fail (no `.fs-note-text`, no `Open note` button).

- [ ] **Step 3: Add the marker**

Create `src/canvas/note/NoteMarker.tsx`:

```tsx
import { NotebookText } from 'lucide-react';
import { useContext } from 'react';
import { NoteOpener } from './noteOpener';

export function NoteMarker({ nodeId }: { nodeId: string }) {
  const open = useContext(NoteOpener);
  return (
    <button
      type="button"
      className="fs-note-marker nodrag nopan"
      title="Open note"
      aria-label="Open note"
      onClick={(e) => {
        e.stopPropagation();
        open(nodeId);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <NotebookText size={10} strokeWidth={2.2} />
    </button>
  );
}
```

`nodrag` keeps React Flow's pointerdown from selecting or dragging the node (its drag filter skips `.nodrag` targets, `@xyflow/system` `XYDrag`), and stopping the click keeps its click handler from selecting it.

- [ ] **Step 4: Draw the note line and measure overflow**

In `src/canvas/StepNode.tsx`:

Change `import { memo, useLayoutEffect, useRef } from 'react';` to `import { memo, useLayoutEffect, useRef, useState } from 'react';`. Add `import { firstLine, hasMoreLines } from '../model/note';` after the `../model/duration` import, and `import { NoteMarker } from './note/NoteMarker';` after the `./labels` import.

Add above `function fitTitle`:

```ts
function noteOverflows(body: HTMLElement): boolean {
  const text = body.querySelector(':scope > .fs-note > .fs-note-text');
  return !!text && text.scrollWidth > text.clientWidth;
}
```

Replace

```tsx
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (body.current) fitTitle(body.current);
  }, [node.w, node.h, node.shape, node.title, node.note, node.owner, node.durationMin, critical, editing]);
```

with

```tsx
  const body = useRef<HTMLDivElement>(null);
  const [noteCut, setNoteCut] = useState(false);
  useLayoutEffect(() => {
    if (!body.current) return;
    // Read before fitTitle writes, so both measurements share one layout.
    setNoteCut(noteOverflows(body.current));
    fitTitle(body.current);
  }, [node.w, node.h, node.shape, node.title, node.note, node.owner, node.durationMin, critical, editing]);
```

Replace

```tsx
        {node.note && <div className="fs-note">{node.note}</div>}
```

with

```tsx
        {node.note && (
          <div className="fs-note">
            <span className="fs-note-text">{firstLine(node.note)}</span>
            {(noteCut || hasMoreLines(node.note)) && <NoteMarker nodeId={id} />}
          </div>
        )}
```

The marker only ever narrows the text, so showing it cannot make an overflowing line fit and flip it back; the state settles in one pass.

- [ ] **Step 5: Style the note line and marker**

In `src/canvas/canvas.css`, replace the whole `.fs-note { ... }` rule with:

```css
.fs-note {
  display: flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  font-size: 11px;
  color: var(--text-2);
  font-style: italic;
}
.fs-note-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fs-note-marker {
  flex: none;
  display: grid;
  place-items: center;
  width: 14px;
  height: 12px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  /* React Flow turns pointer events off on nodes in the read-only reference view. */
  pointer-events: all;
}
.fs-note-marker:hover {
  color: var(--accent);
  background: var(--accent-soft);
}
```

- [ ] **Step 6: Hide the marker in exports**

In `src/io/exportImage.ts`, change

```ts
const HIDDEN = ['fs-toolbar', 'fs-add', 'fs-handle', 'react-flow__resize-control'];
```

to

```ts
const HIDDEN = ['fs-toolbar', 'fs-add', 'fs-handle', 'react-flow__resize-control', 'fs-note-marker'];
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npm run typecheck`
Expected: exits 0.
Run: `npx playwright test tests/e2e/notes.spec.ts --workers=2`
Expected: 10 passed.
Run: `npx playwright test tests/e2e/export.spec.ts --workers=2`
Expected: 2 passed.
Run: `npx playwright test tests/e2e/canvas.spec.ts --workers=2`
Expected: all passed (title fitting unchanged).

- [ ] **Step 8: Commit**

```bash
git add src/canvas/note/NoteMarker.tsx src/canvas/StepNode.tsx src/canvas/canvas.css src/io/exportImage.ts tests/e2e/notes.spec.ts
git commit -m "Show the note's first line and a marker on the box"
```

---

### Task 5: Verify slice 1, then STOP for a human playtest

**Files:** none changed unless the checks fail.

**Interfaces:**
- Consumes: everything from Tasks 1 to 4.
- Produces: a verified slice 1 and the playtest result that gates slice 2.

- [ ] **Step 1: Run the unit tests and the typecheck**

Run: `npm run typecheck`
Expected: exits 0.
Run: `npx vitest run`
Expected: all tests pass (the Task 1 and Task 2 files add 11).

- [ ] **Step 2: Run the touched browser suites, one at a time**

Run each, in turn:

```
npx playwright test tests/e2e/notes.spec.ts --workers=2
npx playwright test tests/e2e/keyboard.spec.ts --workers=2
npx playwright test tests/e2e/workspace.spec.ts --workers=2
npx playwright test tests/e2e/interactions.spec.ts --workers=2
npx playwright test tests/e2e/canvas.spec.ts --workers=2
npx playwright test tests/e2e/export.spec.ts --workers=2
```

Expected: every suite passes.

- [ ] **Step 3: Run the performance budget**

`StepNode.tsx` changed, so check the budget now rather than only at the end.

Run (PowerShell): `$env:PERF_BUDGET='1'; npx playwright test tests/e2e/perf.spec.ts --workers=1; Remove-Item Env:PERF_BUDGET`
Expected: all perf tests pass within the budget.

- [ ] **Step 4: STOP: human playtest**

The executor stops here and reports to the controller. The controller arranges the playtest build (a playtest copy on a spare port against a scratch copy of the workspace, as for arrow routing; never `npm run dev` in this checkout) and asks the user to try:

- Write a two-paragraph note from the toolbar Note button; close it with Escape; check the box shows the first line and the marker, and one Ctrl+Z removes the note.
- Select a step, press Shift+F2, write, press Ctrl+Enter.
- Click the marker on an unselected step: the note opens, the step is not selected, and a press-and-drag on the marker does not move the step.
- A long note: the textarea grows to about 12 lines, then scrolls; the wheel inside scrolls it; the wheel outside closes it.
- A single-line note too long for the box shows the marker; widening the box until it fits removes it.
- Shift+click a board tab and click a marker in the reference view: the note reads as paragraphs and cannot be edited.
- Export PNG: no marker in the image.
- Light and dark theme; a sticky note shape; a decision shape.

Do not start Task 6 until the controller relays the playtest result. Fixes from the playtest are separate commits, each with its own failing test first where one can be written.

---

## Slice 2: the assistant

### Task 6: Summary excerpt and `note-truncated`

**Files:**
- Modify: `src/model/note.ts` (append `NOTE_EXCERPT_CHARS` and `noteExcerpt`)
- Modify: `src/model/note.test.ts` (import; append a `describe`)
- Modify: `src/analysis/summary.ts` (import; the `note=` line in `describeStep`)
- Modify: `src/analysis/summary.test.ts` (append a test)

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Task 7's descriptions, which name the marker):
  - `NOTE_EXCERPT_CHARS = 300`
  - `noteExcerpt(note: string): { text: string; truncated: boolean }`
  - Summary step lines read `... note="<first 300 characters>…" note-truncated` for long notes.

- [ ] **Step 1: Write the failing tests**

In `src/model/note.test.ts`, change the import to:

```ts
import { firstLine, hasMoreLines, noteExcerpt, noteParagraphs, noteToSave } from './note';
```

Append:

```ts
describe('noteExcerpt', () => {
  it('keeps a note of 300 characters whole', () => {
    const note = 'x'.repeat(300);
    expect(noteExcerpt(note)).toEqual({ text: note, truncated: false });
  });

  it('cuts a longer note to 300 characters and an ellipsis', () => {
    expect(noteExcerpt(`${'x'.repeat(300)}yz`)).toEqual({ text: `${'x'.repeat(300)}…`, truncated: true });
  });

  it('never splits a character made of two code units', () => {
    expect(noteExcerpt(`${'a'.repeat(299)}😀😀`)).toEqual({ text: `${'a'.repeat(299)}😀…`, truncated: true });
  });
});
```

In `src/analysis/summary.test.ts`, append inside the `describe` block:

```ts
  it('cuts a long note to 300 characters and marks it note-truncated', () => {
    const project = createProject('P');
    const b = project.boards[0];
    addStep(b, { title: 'Long', note: `${'x'.repeat(300)}y` });
    addStep(b, { title: 'Short', note: 'One\n\nTwo' });
    const lines = summarizeBoard(project, b.id).split('\n');
    expect(lines).toContain(`s1 [process] "Long" note="${'x'.repeat(300)}…" note-truncated`);
    expect(lines).toContain('s2 [process] "Short" note="One\\n\\nTwo"');
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/model/note.test.ts src/analysis/summary.test.ts`
Expected: FAIL. `noteExcerpt` is not exported (the note tests fail on the import), and the summary line still carries the full 301 characters with no `note-truncated`.

- [ ] **Step 3: Add the excerpt rule**

Append to `src/model/note.ts`:

```ts
export const NOTE_EXCERPT_CHARS = 300;

export function noteExcerpt(note: string): { text: string; truncated: boolean } {
  if (note.length <= NOTE_EXCERPT_CHARS) return { text: note, truncated: false };
  const chars = Array.from(note);
  if (chars.length <= NOTE_EXCERPT_CHARS) return { text: note, truncated: false };
  return { text: `${chars.slice(0, NOTE_EXCERPT_CHARS).join('')}…`, truncated: true };
}
```

- [ ] **Step 4: Use it in the summary**

In `src/analysis/summary.ts`, add `import { noteExcerpt } from '../model/note';` after the `../model/duration` import, and replace

```ts
  if (n.note) parts.push(`note=${q(n.note)}`);
```

with

```ts
  if (n.note) {
    const { text, truncated } = noteExcerpt(n.note);
    parts.push(`note=${q(text)}`);
    if (truncated) parts.push('note-truncated');
  }
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run src/model/note.test.ts src/analysis/summary.test.ts`
Expected: PASS (note: 7 tests, summary: 4 tests).
Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/model/note.ts src/model/note.test.ts src/analysis/summary.ts src/analysis/summary.test.ts
git commit -m "Cut long notes in the board summary and mark them note-truncated"
```

---

### Task 7: `read_notes`, note descriptions and the prompt line

**Files:**
- Modify: `src/ai/schemas.ts` (a shared `note` field; `StepInput.note`; `update_steps` `note`; new `read_notes` schema)
- Modify: `src/ai/toolDefs.ts` (`update_steps` description; new `read_notes` description)
- Modify: `src/ai/executor.ts` (import `getNode`; new `read_notes` handler)
- Modify: `src/ai/systemPrompt.ts` (one line)
- Modify: `src/ai/toolDefs.test.ts`, `src/ai/executor.test.ts` (append tests)
- Modify: `server/chat.test.ts:91` (tool count 18 to 19)

**Interfaces:**
- Consumes: `resolveBoard(project: Project, ref: string | undefined, fallback: string): Board` and `Handler<N>` inside `executor.ts`; `getNode(b: Board, id: string): BoardNode` from `src/ops/query.ts` (throws `OpError('Unknown step "<id>".')`); the `note-truncated` marker from Task 6.
- Produces: tool `read_notes` with input `{ board?: string; ids: string[] }` returning `{"notes":[{"id":"s1","note":"..."}]}`, no touched ids, no stats.

No stats change is needed: a note edit goes through `update_steps`, which already counts it under `stepsUpdated` ("steps updated").

- [ ] **Step 1: Write the failing tests**

Append inside the `describe` in `src/ai/toolDefs.test.ts`:

```ts
  it('describes notes, read_notes and where explanations go', () => {
    const def = (name: string) => JSON.stringify(TOOL_DEFS.find((t) => t.name === name));
    const noteText = 'Longer explanation of the step, such as what a presenter would say about it. Separate paragraphs with a blank line. update_steps replaces the whole note.';
    expect(def('add_steps')).toContain(noteText);
    expect(def('update_steps')).toContain(noteText);
    expect(def('update_steps')).toContain('note-truncated');
    expect(def('update_steps')).toContain('read_notes');
    expect(def('read_notes')).toContain('note-truncated');
    expect(SYSTEM_PROMPT).toContain('about a step in its note');
  });
```

Append inside the `describe` in `src/ai/executor.test.ts`, after the "reads another board by name" test:

```ts
  it('reads the full notes of steps and refuses unknown ids', async () => {
    const long = 'x'.repeat(400);
    const { run } = setup((b) => {
      addStep(b, { title: 'A', note: long });
      addStep(b, { title: 'B' });
    });
    const out = await run('read_notes', { ids: ['s1', 's2'] });
    expect(out.ok).toBe(true);
    expect(JSON.parse(out.content)).toEqual({ notes: [{ id: 's1', note: long }, { id: 's2', note: '' }] });
    expect(out.touched).toEqual([]);
    expect(out.stats).toEqual({});
    const bad = await run('read_notes', { ids: ['s9'] });
    expect(bad.ok).toBe(false);
    expect(bad.content).toContain('Unknown step "s9"');
  });
```

In `server/chat.test.ts`, change `toHaveLength(18)` to `toHaveLength(19)`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/ai/toolDefs.test.ts src/ai/executor.test.ts server/chat.test.ts`
Expected: FAIL. The descriptions lack the note text; `read_notes` returns `Unknown tool "read_notes".`; the chat test sees 18 tools.

- [ ] **Step 3: Describe the note fields and add the schema**

In `src/ai/schemas.ts`, after the `const id = ...` line add:

```ts
const note = z
  .string()
  .optional()
  .describe('Longer explanation of the step, such as what a presenter would say about it. Separate paragraphs with a blank line. update_steps replaces the whole note.');
```

In `StepInput`, replace `note: z.string().optional(),` with `note,`. In `update_steps`, replace `note: z.string().optional(),` with `note,`. After the `read_board` entry in `TOOL_SCHEMAS`, add:

```ts
  read_notes: z.object({ board, ids: z.array(id).min(1) }),
```

- [ ] **Step 4: Describe the tool and the truncation rule**

In `src/ai/toolDefs.ts`, replace the `update_steps` entry with:

```ts
  update_steps:
    'Change properties of existing steps. Set duration, actor, status or lane to null to clear it. A note marked note-truncated in the board summary is cut short there: call read_notes first and send the whole note, or the hidden part is lost.',
```

After the `read_board` entry, add:

```ts
  read_notes: 'Read the full notes of steps. The board summary shows only the first 300 characters of a note and marks a cut note note-truncated.',
```

- [ ] **Step 5: Add the handler**

In `src/ai/executor.ts`, change `import { findEdge, getEdge } from '../ops/query';` to `import { findEdge, getEdge, getNode } from '../ops/query';`. After the `read_board` handler, add:

```ts
  read_notes: (ctx, input, boardId) => {
    const b = resolveBoard(ctx.getProject(), boardId, boardId);
    return { result: { notes: input.ids.map((id) => ({ id, note: getNode(b, id).note })) } };
  },
```

- [ ] **Step 6: Add the prompt line**

In `src/ai/systemPrompt.ts`, after the line `- Keep titles short, 2 to 6 words, in the user's vocabulary.` add:

```
- Put explanations, rationale and anything the user would say aloud about a step in its note, as short paragraphs separated by a blank line, and keep the title short.
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run src/ai/toolDefs.test.ts src/ai/executor.test.ts server/chat.test.ts`
Expected: PASS, including the existing "keeps the prompt free of em dashes" test.
Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/ai/schemas.ts src/ai/toolDefs.ts src/ai/executor.ts src/ai/systemPrompt.ts src/ai/toolDefs.test.ts src/ai/executor.test.ts server/chat.test.ts
git commit -m "Add read_notes and tell the assistant where explanations go"
```

---

### Task 8: Decision record, docs and full verification

**Files:**
- Create: `docs/adr/0019-the-note-panel-saves-on-every-close.md`
- Modify: `docs/adr/README.md` (index row), `src/canvas/note/NotePanel.tsx` (one pointer comment)
- Modify: `README.md` (Keys table, a line under it), `PROJECT_STATUS.md`

**Interfaces:**
- Consumes: the finished feature.
- Produces: ADR 0019 and updated docs.

Escape saves the note, while Escape cancels the title editor and toolbar fields. That reads like a mistake to the next maintainer, so it gets an ADR. The per-canvas session split and the 300 character excerpt are recorded in the spec and this plan and need none.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0019-the-note-panel-saves-on-every-close.md`:

```markdown
# 0019: The note panel saves whenever it closes, Escape included

Status: Accepted (2026-09-28)

## Context
Step notes grew from a one-line toolbar field into a multi-paragraph panel (spec `docs/superpowers/specs/2026-09-28-step-notes-design.md`). Elsewhere Escape cancels: the title editor and the toolbar fields throw the edit away. The panel also closes on things the user did not aim at it: a click outside, a wheel outside, a window resize or blur, a board tab switch, opening another step's note.

## Decision
- Every close saves the note when its trimmed text differs from the stored note, Escape included. There is no cancel key; Ctrl+Z undoes the whole open-edit-close session as one step.
- A close with no change adds no undo entry.
- The save is pinned to the board the panel was opened on, and dropped if the step no longer exists (`src/canvas/note/noteSession.ts`).

Rejected:
- Escape cancels, as in the title editor: a long note is lost to one stray key.
- A confirmation on close: friction on every close for a rare mistake.
- Saving on every keystroke: floods undo, or needs a transaction held open while the panel is open, which blocks undo everywhere else (ADR-0005).

## Consequences
- Escape means "done" in the note panel and "cancel" in the title editor and toolbar fields. The README says so.
- Switching to another window saves and closes the panel.
```

In `docs/adr/README.md`, add after the last row (0018 if the rendering ADR has landed, otherwise 0017):

```markdown
| [0019](0019-the-note-panel-saves-on-every-close.md) | The note panel saves whenever it closes, Escape included | Accepted |
```

- [ ] **Step 2: Point the code at the ADR**

In `src/canvas/note/NotePanel.tsx`, in `NoteEditor`'s `onKeyDown`, add a line directly above `if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {`:

```ts
        // why: ADR-0019
```

- [ ] **Step 3: Update the README**

In `README.md`, after the Keys row `| Typing, F2, double-click | Edit the title |`, add:

```markdown
| Shift+F2, the Note button, or the note marker on a box | Open the step's note. Enter adds a line; Escape, Ctrl+Enter or a click outside saves it (ADR 0019) |
```

After the line `Shift+click a board tab to view it read-only beside the active board.`, add a blank line and:

```markdown
A small notebook marker at the end of a step's note line means the note has more than the line shown. Click it to read the whole note, in the reference view too.
```

- [ ] **Step 4: Update the project status**

In `PROJECT_STATUS.md`:

Under `## Complete`, after the arrow routing bullet, add:

```markdown
- Step notes: a multi-paragraph note in a panel under the step (toolbar Note button, Shift+F2, or the marker on the box), readable in the reference view, saved on every close as one undo step (ADR 0019). The assistant puts explanations in the note, sees notes cut at 300 characters marked `note-truncated`, and reads the rest with `read_notes`. Built on `feat/step-notes`; awaiting the final playtest and merge after `feat/arrow-routing`.
```

Under `## In flight`, after the arrow routing playtest bullet, add:

```markdown
- Final playtest of step notes (ask the assistant to explain a step and check the note gets the explanation and the title stays short; ask it to edit a note longer than 300 characters and check nothing is lost), then merge `feat/step-notes`.
```

In `## Heading`, replace `Finish layout assists, then arrow routing, then multi-paragraph step notes (a multi-line note that keeps paragraphs, a marker on the box, and the assistant told to put spoken explanations there), then interactive HTML and PDF export` with `Finish layout assists, arrow routing and step notes, then interactive HTML and PDF export`.

Append to the `## Timeline` table:

```markdown
| 2026-09-28 | Step notes specced, planned and built; awaiting playtest and merge |
```

Update `**As of:**` to the current date if it has moved on.

- [ ] **Step 5: Full verification**

Run: `npm run typecheck`
Expected: exits 0.
Run: `npx vitest run`
Expected: all tests pass.
Run: `npx playwright test --workers=2`
Expected: all suites pass (`live.spec.ts` skips without `LIVE_API`).
Run (PowerShell): `$env:PERF_BUDGET='1'; npx playwright test tests/e2e/perf.spec.ts --workers=1; Remove-Item Env:PERF_BUDGET`
Expected: all perf tests pass within the budget.
Run (Bash): `git diff feat/arrow-routing...HEAD | grep -nP '^\+.*\x{2014}'`
Expected: no output (no em dash on any line this branch added).

- [ ] **Step 6: Commit**

```bash
git add docs/adr/0019-the-note-panel-saves-on-every-close.md docs/adr/README.md src/canvas/note/NotePanel.tsx
git commit -m "Record why the note panel saves on every close"
git add README.md PROJECT_STATUS.md
git commit -m "Document step notes in the README and project status"
```
