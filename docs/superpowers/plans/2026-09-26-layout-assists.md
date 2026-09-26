# Layout Assists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PowerPoint-style layout comfort on the Flowstate canvas: grid snap, smart and spacing guides, resize snap, Shift axis lock, Ctrl+drag copy, a right-click menu (edit, align, distribute, match size, arrange, colour), Ctrl+X / nudge / z-order shortcuts, reliable dot-to-dot connections, and AI parity for alignment and colour.

**Architecture:**
- **Snapping math** is a pure module (`src/canvas/assist/snap.ts`, `candidates.ts`). The canvas applies its offsets to React Flow position and dimension changes inside `onNodesChange` before they reach the board.
- **Board operations** (`src/ops/arrange.ts`) are shared by the UI and the AI tool.
- **Canvas commands** (`src/canvas/commands.ts`) are shared by the keyboard and the context menu.
- **Layout preferences** are a small localStorage-backed zustand store.

**Tech Stack:** React 19, TypeScript 7, @xyflow/react 12.12, zustand 5, immer 11, zod 4, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-26-layout-assists-design.md`

## Global Constraints

- **No new dependencies.** Any install would be prefixed with `sfw`, but none is needed.
- **Every user action is exactly one undo step.** Drags and resizes already open a transaction (`begin()`/`commit()`). Everything else is a single `changeBoard` call.
- **Constants:**

  | Name | Value |
  |---|---|
  | `GRID` | 20 |
  | `SNAP_PX` | 6 (screen px, divided by zoom) |
  | Candidate cap | 200 |
  | Right-click move threshold | 4px |
  | `connectionRadius` | 20 |
  | Nudge | 20px, or 1px with Shift |

- **Layout prefs** live under localStorage key `flowstate.layoutPrefs`. All five default to on: `gridSnap`, `smartGuides`, `spacingGuides`, `resizeSnap`, `arrowNudge`.
- **The reference view** (`editable: false`) gets no snapping, guides, menu or shortcuts.
- **Code comments:** only for a non-obvious why, at most 3 lines. Never restate the code.
- **Writing:** no em dashes in code, comments, commit messages or docs.
- **Commits:** commit after each task. No `Co-Authored-By` lines.
- **Dev servers:** before running Playwright, make sure ports 5173 and 8797 are free. A stopped `npm run dev` from a background shell leaves Vite and tsx running. If a Playwright worker crashes with 0xC0000409, rerun once before investigating.

**Commands:**
- Typecheck: `npm run typecheck`
- Unit tests: `npx vitest run <file>`
- Browser tests: `npx playwright test <file>`

## Review Focus

1. **Dragging while zoomed far out or in.** The snap distance must stay 6 screen pixels, not 6 flow units. Tested in Task 3 at zoom 0.5 and 2.
2. **Right-clicking inside a title or label editor.** It must show the browser's native menu (spellcheck, paste), not ours, and must not `preventDefault`. Tested in Task 12.
3. **Ctrl+Z straight after a Ctrl+drag copy.** It must remove the copy and leave the original untouched, as one undo step. Tested in Task 7.
4. **Dragging a step that sits inside a group.** It must not snap to its own group frame (which refits around it), but must snap to sibling steps. Tested in Task 4.
5. **A project file carrying an invalid colour string** (for example `"red"` from a hand-edited import). It must load and render with the default fill, not crash, while UI and AI writes reject it. Tested in Task 9.

## File Map

| File | Responsibility |
|---|---|
| `src/canvas/assist/snap.ts` (new) | Pure snapping math: move, resize, axis lock, guides |
| `src/canvas/assist/candidates.ts` (new) | Pure: which board nodes are snap targets, lane lines |
| `src/canvas/assist/overlay.ts` (new) | Tiny store of guides and ghost rects for rendering |
| `src/canvas/assist/modifiers.ts` (new) | Live Alt/Shift/Ctrl tracking and the Windows Alt-menu guard |
| `src/canvas/assist/useDragAssist.ts` (new) | Drag and resize session glue between React Flow and `snap` |
| `src/canvas/assist/GuidesOverlay.tsx` (new) | Draws guides and ghosts in a `ViewportPortal` |
| `src/store/layoutPrefs.ts` (new) | Persisted per-user layout prefs |
| `src/ui/LayoutMenu.tsx` (new) | Top bar dropdown of pref switches |
| `src/ops/arrange.ts` (new) | align, distribute, match size, reorder |
| `src/model/color.ts` (new) | Colour presets, validation, fill and ink resolution |
| `src/canvas/commands.ts` (new) | Copy, cut, paste, duplicate, delete, nudge, arrange on the selection |
| `src/canvas/menu/ContextMenu.tsx` (new) | Generic keyboard-navigable menu with submenus |
| `src/canvas/menu/entries.tsx` (new) | Node and pane menu contents |
| `src/canvas/menu/useCanvasMenu.tsx` (new) | Right-click vs right-drag trigger, Shift+F10 |
| `src/canvas/Canvas.tsx` | Wiring |
| `src/canvas/useKeyboard.ts` | New shortcuts via `commands.ts` |
| `src/canvas/StepNode.tsx`, `ShapeSvg.tsx`, `FloatingToolbar.tsx`, `labels.tsx`, `TextNode.tsx`, `GroupNode.tsx` | Colour and resize-end wiring |
| `src/ops/steps.ts` | Colour validation |
| `src/ui/controls.tsx`, `src/ui/TopBar.tsx`, `src/canvas/canvas.css` | Controls, top bar, styles |
| `src/ai/schemas.ts`, `toolDefs.ts`, `executor.ts`, `stats.ts`, `systemPrompt.ts` | AI parity |
| `tests/e2e/assists.spec.ts` (new) | All browser tests for this feature |
| `tests/e2e/perf.spec.ts` | Drag-with-guides frame budget |
| `docs/adr/0008`, `0009`, `0010` (new) | Decisions |

---

### Task 1: Connection dots connect on a plain drag (bug, test first)

**Files:**
- Create: `tests/e2e/assists.spec.ts`
- Modify: `src/canvas/Canvas.tsx` (ReactFlow props, `onConnectStart`, `onConnectEnd`)
- Modify: `src/canvas/canvas.css:211-222` (`.fs-handle` rules)

**Interfaces:**
- Produces: test helpers `centerOf(locator)`, `resetZoom(page)`, `drag(page, id, dx, dy, opts?)` in `tests/e2e/assists.spec.ts`. Later tasks append tests to this file and reuse them.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/assists.spec.ts`:

```ts
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
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 400, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  await node(page, 's1').hover();
  const from = await centerOf(node(page, 's1').locator('.react-flow__handle-right'));
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
```

`node0` is used by later tasks. Keep it.

- [ ] **Step 2: Run it and confirm it fails for the expected reason**

Run: `npx playwright test tests/e2e/assists.spec.ts`

Expected: FAIL. Either `s1` moved (x or y not 0), or there are no edges, or the opacity assertion fails.

- If it **passes**, stop. Do not apply the fix. Report back that the plain-drag bug did not reproduce at 100% zoom, so the user's report needs more evidence (zoom level, which part of the dot).
- If it fails, find out why Ctrl+drag connects today. Open DevTools on a dev server (`npm run dev`) and run `document.elementFromPoint(x, y)` at a dot's centre. Record in the commit message which element takes the press and why Ctrl changes it.

- [ ] **Step 3: Fix the hit area, layering and connection radius**

In `src/canvas/canvas.css`, replace the `.fs-handle` block and its hover rule with:

```css
.fs-handle {
  width: 9px;
  height: 9px;
  background: var(--surface);
  border: 1.5px solid var(--accent);
  opacity: 0;
  transition: opacity 0.12s;
  z-index: 3;
}
.fs-handle::before {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 50%;
}
.fs-step:hover .fs-handle,
.fs-step.is-selected .fs-handle,
.fs-flow.is-connecting .fs-handle {
  opacity: 1;
}
```

In `src/canvas/Canvas.tsx`:
- Add `const [connecting, setConnecting] = useState(false);` next to `measureTick`.
- At the top of the existing `onConnectEnd` callback body, add `setConnecting(false);` as its first line.
- Add these props to `<ReactFlow>`:

```tsx
      onConnectStart={() => setConnecting(true)}
      connectionRadius={20}
```

- Change `className` to:

```tsx
      className={['fs-flow', !editable && 'is-reference', connecting && 'is-connecting'].filter(Boolean).join(' ')}
```

- [ ] **Step 4: Run the test and the existing canvas tests**

Run: `npx playwright test tests/e2e/assists.spec.ts tests/e2e/interactions.spec.ts tests/e2e/canvas.spec.ts`

Expected: all PASS. The existing "dragging a step is one undo entry" and "hover plus adds a connected step" tests prove body drags and plus buttons still work.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/assists.spec.ts src/canvas/Canvas.tsx src/canvas/canvas.css
git commit -m "Fix plain drags from a connection dot moving the shape instead of connecting"
```

In the commit body, add one line on the cause found in Step 2.

---

### Task 2: Layout preferences, Layout menu and Ctrl+'

**Files:**
- Create: `src/store/layoutPrefs.ts`, `src/store/layoutPrefs.test.ts`, `src/ui/LayoutMenu.tsx`
- Modify: `src/ui/TopBar.tsx` (insert `<LayoutMenu />` before the Tidy button)
- Modify: `src/canvas/useKeyboard.ts` (Ctrl branch)
- Modify: `src/ui/ui.css` (append `.menu-shortcut`, `.is-hidden`)

**Interfaces:**
- Produces:
  - `LAYOUT_PREFS: readonly ['gridSnap','smartGuides','spacingGuides','resizeSnap','arrowNudge']`
  - `type LayoutPref`, `type LayoutPrefs = Record<LayoutPref, boolean>`
  - `DEFAULT_PREFS`, `PREF_LABEL: Record<LayoutPref, string>`
  - `loadPrefs(storage)`, `savePrefs(storage, prefs)`
  - `createLayoutPrefs(storage)`
  - `layoutPrefs` (zustand vanilla store with `{ prefs: LayoutPrefs; toggle(k: LayoutPref): void }`)
  - `useLayoutPrefs(): LayoutPrefs`

- [ ] **Step 1: Write the failing tests**

Create `src/store/layoutPrefs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createLayoutPrefs, DEFAULT_PREFS, loadPrefs, PREFS_KEY } from './layoutPrefs';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

describe('layout prefs', () => {
  it('defaults every assist on', () => {
    expect(DEFAULT_PREFS).toEqual({ gridSnap: true, smartGuides: true, spacingGuides: true, resizeSnap: true, arrowNudge: true });
    expect(loadPrefs(fakeStorage())).toEqual(DEFAULT_PREFS);
  });

  it('keeps stored booleans and ignores anything else', () => {
    const s = fakeStorage({ [PREFS_KEY]: JSON.stringify({ gridSnap: false, smartGuides: 'no', bogus: true }) });
    expect(loadPrefs(s)).toEqual({ ...DEFAULT_PREFS, gridSnap: false });
  });

  it('falls back to defaults on corrupt JSON, a throwing store, or no store', () => {
    expect(loadPrefs(fakeStorage({ [PREFS_KEY]: '{' }))).toEqual(DEFAULT_PREFS);
    expect(
      loadPrefs({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toEqual(DEFAULT_PREFS);
    expect(loadPrefs(undefined)).toEqual(DEFAULT_PREFS);
  });

  it('toggle flips one pref and persists it', () => {
    const s = fakeStorage();
    const store = createLayoutPrefs(s);
    store.getState().toggle('spacingGuides');
    expect(store.getState().prefs).toEqual({ ...DEFAULT_PREFS, spacingGuides: false });
    expect(loadPrefs(s)).toEqual({ ...DEFAULT_PREFS, spacingGuides: false });
  });

  it('toggle survives a store that refuses writes', () => {
    const store = createLayoutPrefs({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    store.getState().toggle('gridSnap');
    expect(store.getState().prefs.gridSnap).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/store/layoutPrefs.test.ts`

Expected: FAIL, "Cannot find module './layoutPrefs'".

- [ ] **Step 3: Implement the store**

Create `src/store/layoutPrefs.ts`:

```ts
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export const LAYOUT_PREFS = ['gridSnap', 'smartGuides', 'spacingGuides', 'resizeSnap', 'arrowNudge'] as const;
export type LayoutPref = (typeof LAYOUT_PREFS)[number];
export type LayoutPrefs = Record<LayoutPref, boolean>;

export const PREFS_KEY = 'flowstate.layoutPrefs';
export const DEFAULT_PREFS: LayoutPrefs = { gridSnap: true, smartGuides: true, spacingGuides: true, resizeSnap: true, arrowNudge: true };
export const PREF_LABEL: Record<LayoutPref, string> = {
  gridSnap: 'Snap to grid',
  smartGuides: 'Smart guides',
  spacingGuides: 'Spacing guides',
  resizeSnap: 'Snap while resizing',
  arrowNudge: 'Ctrl+arrow nudge',
};

type Reader = Pick<Storage, 'getItem'>;
type ReadWriter = Pick<Storage, 'getItem' | 'setItem'>;

export function loadPrefs(storage: Reader | undefined): LayoutPrefs {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed: unknown = JSON.parse(raw);
    const stored = new Map(parsed && typeof parsed === 'object' ? Object.entries(parsed) : []);
    const out = { ...DEFAULT_PREFS };
    for (const k of LAYOUT_PREFS) {
      const v = stored.get(k);
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage: ReadWriter | undefined, prefs: LayoutPrefs): void {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private windows and full quotas refuse writes; the in-memory prefs still apply.
  }
}

export function createLayoutPrefs(storage: ReadWriter | undefined) {
  return createStore<{ prefs: LayoutPrefs; toggle(k: LayoutPref): void }>()((set, get) => ({
    prefs: loadPrefs(storage),
    toggle(k) {
      const prefs = { ...get().prefs, [k]: !get().prefs[k] };
      set({ prefs });
      savePrefs(storage, prefs);
    },
  }));
}

function browserStorage(): ReadWriter | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export const layoutPrefs = createLayoutPrefs(browserStorage());

export function useLayoutPrefs(): LayoutPrefs {
  return useStore(layoutPrefs, (s) => s.prefs);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/store/layoutPrefs.test.ts`

Expected: PASS (5 tests).

- [ ] **Step 5: Add the Layout menu and the shortcut**

Create `src/ui/LayoutMenu.tsx`. First confirm the icon exists: `grep -c "Magnet" node_modules/lucide-react/dist/lucide-react.d.ts`. If it is absent, use `Grid3x3`.

```tsx
import { Check, Magnet } from 'lucide-react';
import { LAYOUT_PREFS, layoutPrefs, PREF_LABEL, useLayoutPrefs } from '../store/layoutPrefs';
import { MenuButton } from './Popover';

const SHORTCUT: Partial<Record<(typeof LAYOUT_PREFS)[number], string>> = { gridSnap: "Ctrl+'" };

export function LayoutMenu() {
  const prefs = useLayoutPrefs();
  return (
    <MenuButton
      title="Layout assists"
      label={
        <>
          <Magnet size={14} />
          <span>Layout</span>
        </>
      }
    >
      {() =>
        LAYOUT_PREFS.map((k) => (
          <button key={k} type="button" role="menuitemcheckbox" aria-checked={prefs[k]} className="menu-item" onClick={() => layoutPrefs.getState().toggle(k)}>
            <Check size={14} className={prefs[k] ? undefined : 'is-hidden'} />
            <span>{PREF_LABEL[k]}</span>
            {SHORTCUT[k] && <span className="menu-shortcut">{SHORTCUT[k]}</span>}
          </button>
        ))
      }
    </MenuButton>
  );
}
```

In `src/ui/TopBar.tsx`:
- Add the import `import { LayoutMenu } from './LayoutMenu';`.
- Insert `<LayoutMenu />` directly before the Tidy `<button>`.

Append to `src/ui/ui.css`:

```css
.menu-shortcut {
  margin-left: auto;
  padding-left: 16px;
  color: var(--text-3);
  font-size: 11px;
}
.is-hidden {
  visibility: hidden;
}
```

In `src/canvas/useKeyboard.ts`:
- Add the imports `import { layoutPrefs } from '../store/layoutPrefs';`. `notify` is already imported.
- In the `if (e.ctrlKey || e.metaKey)` chain, add a branch before the closing `return;`:

```ts
        } else if (e.code === 'Quote') {
          e.preventDefault();
          layoutPrefs.getState().toggle('gridSnap');
          notify(`Snap to grid ${layoutPrefs.getState().prefs.gridSnap ? 'on' : 'off'}`);
        }
```

- [ ] **Step 6: Add a browser test for the menu and persistence**

Append to `tests/e2e/assists.spec.ts`:

```ts
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
```

- [ ] **Step 7: Run typecheck, unit and browser tests**

Run: `npm run typecheck && npx vitest run src/store && npx playwright test tests/e2e/assists.spec.ts`

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/store/layoutPrefs.ts src/store/layoutPrefs.test.ts src/ui/LayoutMenu.tsx src/ui/TopBar.tsx src/ui/ui.css src/canvas/useKeyboard.ts tests/e2e/assists.spec.ts
git commit -m "Add per-user layout assist preferences with a Layout menu and Ctrl+'"
```

---

### Task 3: Snap engine for moves

**Files:**
- Create: `src/canvas/assist/snap.ts`, `src/canvas/assist/snap.test.ts`

**Interfaces:**
- Consumes: `Rect` from `src/layout/geometry.ts`, and `NodeKind` from `src/model/types.ts`.
- Produces:
  - Constants: `GRID = 20`, `SNAP_PX = 6`, `RESIZE_MIN: Record<NodeKind, { w: number; h: number }>`
  - Types: `Axis = 'x' | 'y'`, `Guide`, `SnapPrefs`, `Candidates`, `MoveMods`, `MoveResult`
  - `snapMove(m: Rect, c: Candidates, prefs: SnapPrefs, zoom: number, mods: MoveMods): MoveResult`
  - `lockAxis(dx: number, dy: number): Axis`
  - `alignGuides(m: Rect, c: Candidates, a: Axis): Guide[]`
  - Internal `linesOf` and `nearest`, which Task 4 reuses in this file.
- **Guide convention:**
  - A `line` with `axis: 'x'` is a vertical line at `x = at`, spanning `y` from `from` to `to`. With `axis: 'y'` it is horizontal.
  - A `gap` with `axis: 'x'` is a horizontal bracket from `start` to `end` at `y = cross`.

- [ ] **Step 1: Write the failing tests**

Create `src/canvas/assist/snap.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Rect } from '../../layout/geometry';
import { lockAxis, snapMove, type Candidates, type SnapPrefs } from './snap';

const box = (x: number, y: number, w = 100, h = 50): Rect => ({ x, y, w, h });
const cands = (boxes: Rect[], yLines: number[] = [], xLines: number[] = []): Candidates => ({ boxes, xLines, yLines });
const ALL: SnapPrefs = { gridSnap: true, smartGuides: true, spacingGuides: true };
const GUIDES_ONLY: SnapPrefs = { gridSnap: false, smartGuides: true, spacingGuides: false };
const FREE = { alt: false, lock: null };

describe('snapMove', () => {
  it('snaps the top-left corner to the 20px grid when nothing is near', () => {
    expect(snapMove(box(113, 47), cands([]), ALL, 1, FREE)).toEqual({ dx: 7, dy: -7, guides: [] });
  });

  it('prefers a smart guide over the grid and reports the guide lines', () => {
    const r = snapMove(box(300, 3), cands([box(0, 0)]), ALL, 1, FREE);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(-3);
    expect(r.guides).toContainEqual({ kind: 'line', axis: 'y', at: 0, from: 0, to: 400 });
  });

  it('keeps the snap distance at 6 screen pixels whatever the zoom', () => {
    const target = cands([box(0, 0)]);
    expect(snapMove(box(300, 10), target, GUIDES_ONLY, 1, FREE).dy).toBe(0);
    expect(snapMove(box(300, 10), target, GUIDES_ONLY, 0.5, FREE).dy).toBe(-10);
    expect(snapMove(box(300, 5), target, GUIDES_ONLY, 1, FREE).dy).toBe(-5);
    expect(snapMove(box(300, 5), target, GUIDES_ONLY, 2, FREE).dy).toBe(0);
  });

  it('does nothing while Alt is held', () => {
    expect(snapMove(box(113, 3), cands([box(0, 0)]), ALL, 1, { alt: true, lock: null })).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('only snaps the free axis under an axis lock', () => {
    const r = snapMove(box(113, 3), cands([box(0, 0)]), ALL, 1, { alt: false, lock: 'x' });
    expect(r.dx).toBe(7);
    expect(r.dy).toBe(0);
  });

  it('matches an existing gap in the same row', () => {
    const r = snapMove(box(403, 0), cands([box(0, 0), box(200, 0)]), ALL, 1, FREE);
    expect(r.dx).toBe(-3);
    expect(r.guides).toContainEqual({ kind: 'gap', axis: 'x', start: 300, end: 400, cross: 25 });
    expect(r.guides).toContainEqual({ kind: 'gap', axis: 'x', start: 100, end: 200, cross: 25 });
  });

  it('centres between two neighbours with equal gaps', () => {
    const r = snapMove(box(203, 0), cands([box(0, 0), box(400, 0)]), ALL, 1, FREE);
    expect(r.dx).toBe(-3);
    expect(r.guides).toContainEqual({ kind: 'gap', axis: 'x', start: 100, end: 200, cross: 25 });
    expect(r.guides).toContainEqual({ kind: 'gap', axis: 'x', start: 300, end: 400, cross: 25 });
  });

  it('treats lane boundaries as guide lines', () => {
    const r = snapMove(box(0, 236), cands([], [240]), ALL, 1, FREE);
    expect(r.dy).toBe(4);
    expect(r.guides).toContainEqual({ kind: 'line', axis: 'y', at: 240, from: 0, to: 100 });
  });

  it('leaves the box alone when every assist is off', () => {
    const off: SnapPrefs = { gridSnap: false, smartGuides: false, spacingGuides: false };
    expect(snapMove(box(113, 3), cands([box(0, 0)]), off, 1, FREE)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('never returns negative zero', () => {
    const r = snapMove(box(-6, -6), cands([]), ALL, 1, FREE);
    expect(Object.is(r.dx, 6) && Object.is(r.dy, 6)).toBe(true);
    expect(Object.is(snapMove(box(0, 0), cands([]), ALL, 1, FREE).dx, 0)).toBe(true);
  });
});

describe('lockAxis', () => {
  it('locks to the axis with the larger movement, x on a tie', () => {
    expect(lockAxis(10, -3)).toBe('x');
    expect(lockAxis(2, -9)).toBe('y');
    expect(lockAxis(5, 5)).toBe('x');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/canvas/assist/snap.test.ts`

Expected: FAIL, "Cannot find module './snap'".

- [ ] **Step 3: Implement**

Create `src/canvas/assist/snap.ts`:

```ts
import type { Rect } from '../../layout/geometry';
import type { NodeKind } from '../../model/types';

export const GRID = 20;
export const SNAP_PX = 6;
export const RESIZE_MIN: Record<NodeKind, { w: number; h: number }> = {
  step: { w: 40, h: 32 },
  text: { w: 60, h: 24 },
  group: { w: 160, h: 100 },
};

export type Axis = 'x' | 'y';
export type Guide =
  | { kind: 'line'; axis: Axis; at: number; from: number; to: number }
  | { kind: 'gap'; axis: Axis; start: number; end: number; cross: number };

export interface SnapPrefs {
  gridSnap: boolean;
  smartGuides: boolean;
  spacingGuides: boolean;
}

export interface Candidates {
  boxes: Rect[];
  xLines: number[];
  yLines: number[];
}

export interface MoveMods {
  alt: boolean;
  lock: Axis | null;
}

export interface MoveResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

const KEYS = {
  x: { pos: 'x', size: 'w', crossPos: 'y', crossSize: 'h' },
  y: { pos: 'y', size: 'h', crossPos: 'x', crossSize: 'w' },
} as const;
const EPS = 0.5;

export function linesOf(r: Rect, a: Axis): number[] {
  const k = KEYS[a];
  return [r[k.pos], r[k.pos] + r[k.size] / 2, r[k.pos] + r[k.size]];
}

function extraLines(c: Candidates, a: Axis): number[] {
  return a === 'x' ? c.xLines : c.yLines;
}

export function targetLines(c: Candidates, a: Axis): number[] {
  return [...c.boxes.flatMap((b) => linesOf(b, a)), ...extraLines(c, a)];
}

export function nearest(values: number[], targets: number[], t: number): number | null {
  let best: number | null = null;
  for (const target of targets) {
    for (const v of values) {
      const d = target - v;
      if (Math.abs(d) <= t && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best;
}

export function alignGuides(m: Rect, c: Candidates, a: Axis): Guide[] {
  const k = KEYS[a];
  const out: Guide[] = [];
  for (const v of linesOf(m, a)) {
    const hits = c.boxes.filter((b) => linesOf(b, a).some((l) => Math.abs(l - v) < EPS));
    const onLane = extraLines(c, a).some((l) => Math.abs(l - v) < EPS);
    if (!hits.length && !onLane) continue;
    const span = [m, ...hits];
    out.push({
      kind: 'line',
      axis: a,
      at: v,
      from: Math.min(...span.map((r) => r[k.crossPos])),
      to: Math.max(...span.map((r) => r[k.crossPos] + r[k.crossSize])),
    });
  }
  return out;
}

function spacingOffset(m: Rect, boxes: Rect[], a: Axis, t: number): { d: number; guides: Guide[] } | null {
  const k = KEYS[a];
  const start = (r: Rect) => r[k.pos];
  const end = (r: Rect) => r[k.pos] + r[k.size];
  const row = boxes
    .filter((b) => b[k.crossPos] < m[k.crossPos] + m[k.crossSize] && m[k.crossPos] < b[k.crossPos] + b[k.crossSize])
    .sort((p, q) => start(p) - start(q));
  const mid = start(m) + m[k.size] / 2;
  const gaps: Array<[number, number]> = [];
  for (let i = 1; i < row.length; i++) {
    const s = end(row[i - 1]);
    const e = start(row[i]);
    if (e > s && !(s < mid && mid < e)) gaps.push([s, e]);
  }
  const before = row.filter((b) => end(b) <= start(m) + t);
  const after = row.filter((b) => start(b) >= end(m) - t);
  const left = before.length ? before.reduce((p, q) => (end(q) > end(p) ? q : p)) : null;
  const right = after.length ? after.reduce((p, q) => (start(q) < start(p) ? q : p)) : null;
  const options: Array<{ d: number; spans: Array<[number, number]> }> = [];
  for (const [s, e] of gaps) {
    const g = e - s;
    if (left) options.push({ d: end(left) + g - start(m), spans: [[end(left), end(left) + g], [s, e]] });
    if (right) options.push({ d: start(right) - g - end(m), spans: [[start(right) - g, start(right)], [s, e]] });
  }
  if (left && right) {
    const g = (start(right) - end(left) - m[k.size]) / 2;
    if (g > 0) options.push({ d: end(left) + g - start(m), spans: [[end(left), end(left) + g], [start(right) - g, start(right)]] });
  }
  let best: (typeof options)[number] | null = null;
  for (const o of options) if (Math.abs(o.d) <= t && (!best || Math.abs(o.d) < Math.abs(best.d))) best = o;
  if (!best) return null;
  const cross = m[k.crossPos] + m[k.crossSize] / 2;
  return { d: best.d, guides: best.spans.map(([s, e]): Guide => ({ kind: 'gap', axis: a, start: s, end: e, cross })) };
}

export function snapMove(m: Rect, c: Candidates, prefs: SnapPrefs, zoom: number, mods: MoveMods): MoveResult {
  if (mods.alt) return { dx: 0, dy: 0, guides: [] };
  const t = SNAP_PX / zoom;
  const offsets = { x: 0, y: 0 };
  const gapGuides: Guide[] = [];
  for (const a of ['x', 'y'] as const) {
    if (mods.lock && mods.lock !== a) continue;
    let d = prefs.smartGuides ? nearest(linesOf(m, a), targetLines(c, a), t) : null;
    if (d === null && prefs.spacingGuides) {
      const spaced = spacingOffset(m, c.boxes, a, t);
      if (spaced) {
        d = spaced.d;
        gapGuides.push(...spaced.guides);
      }
    }
    if (d === null && prefs.gridSnap) d = Math.round(m[KEYS[a].pos] / GRID) * GRID - m[KEYS[a].pos];
    offsets[a] = d || 0;
  }
  const snapped = { ...m, x: m.x + offsets.x, y: m.y + offsets.y };
  const guides = prefs.smartGuides ? [...alignGuides(snapped, c, 'x'), ...alignGuides(snapped, c, 'y')] : [];
  for (const g of gapGuides) if (g.kind === 'gap') guides.push({ ...g, cross: g.cross + (g.axis === 'x' ? offsets.y : offsets.x) });
  return { dx: offsets.x, dy: offsets.y, guides };
}

export function lockAxis(dx: number, dy: number): Axis {
  return Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
}
```

`offsets[a] = d || 0` turns both `null` and `-0` into `0`. The "never returns negative zero" test pins this.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/canvas/assist/snap.test.ts`

Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/canvas/assist/snap.ts src/canvas/assist/snap.test.ts
git commit -m "Add the snapping engine for moves: guides, equal spacing, grid, axis lock"
```

---

### Task 4: Resize snapping and snap candidates

**Files:**
- Modify: `src/canvas/assist/snap.ts` (append `snapResize`)
- Modify: `src/canvas/assist/snap.test.ts` (append tests)
- Create: `src/canvas/assist/candidates.ts`, `src/canvas/assist/candidates.test.ts`

**Interfaces:**
- Consumes: `linesOf`, `targetLines`, `nearest`, `alignGuides`, `GRID`, `SNAP_PX` from Task 3.
- Produces:
  - `interface ResizeEdges { left: boolean; right: boolean; top: boolean; bottom: boolean }`
  - `snapResize(r: Rect, edges: ResizeEdges, c: Candidates, prefs: SnapPrefs, zoom: number, alt: boolean, min: { w: number; h: number }): { rect: Rect; guides: Guide[] }`
  - `type SizeOf = (id: string) => { w: number; h: number } | undefined`
  - `rectOf(n: BoardNode, sizeOf?: SizeOf): Rect`
  - `excludedFor(b: Board, ids: string[]): Set<string>`
  - `laneLines(b: Board): { xLines: number[]; yLines: number[] }`
  - `buildCandidates(b: Board, ids: string[], moving: Rect, view: Rect, sizeOf?: SizeOf, cap?: number): Candidates`
  - `CANDIDATE_CAP = 200`

- [ ] **Step 1: Write the failing tests**

Append to `src/canvas/assist/snap.test.ts`. Extend the import line to include `snapResize`:

```ts
describe('snapResize', () => {
  const MIN = { w: 40, h: 32 };
  const none = { left: false, right: false, top: false, bottom: false };

  it('snaps a dragged right edge to a neighbour line', () => {
    const r = snapResize({ x: -200, y: 100, w: 297, h: 50 }, { ...none, right: true }, cands([box(0, 0)]), ALL, 1, false, MIN);
    expect(r.rect).toEqual({ x: -200, y: 100, w: 300, h: 50 });
    expect(r.guides.some((g) => g.kind === 'line' && g.axis === 'x' && g.at === 100)).toBe(true);
  });

  it('falls back to the grid for the dragged edge only', () => {
    expect(snapResize({ x: 3, y: 0, w: 130, h: 47 }, { ...none, right: true, bottom: true }, cands([]), ALL, 1, false, MIN).rect).toEqual({ x: 3, y: 0, w: 137, h: 40 });
  });

  it('moves the left edge and keeps the right edge fixed', () => {
    expect(snapResize({ x: 97, y: 0, w: 103, h: 50 }, { ...none, left: true }, cands([box(0, 200)]), ALL, 1, false, MIN).rect).toEqual({ x: 100, y: 0, w: 100, h: 50 });
  });

  it('refuses a snap that would shrink below the minimum size', () => {
    expect(snapResize({ x: 97, y: 0, w: 42, h: 50 }, { ...none, left: true }, cands([box(100, 200)]), ALL, 1, false, MIN).rect).toEqual({ x: 97, y: 0, w: 42, h: 50 });
  });

  it('does nothing while Alt is held', () => {
    expect(snapResize({ x: 0, y: 0, w: 133, h: 50 }, { ...none, right: true }, cands([]), ALL, 1, true, MIN).rect).toEqual({ x: 0, y: 0, w: 133, h: 50 });
  });
});
```

Check the grid case: right edge `3 + 130 = 133` goes to 140, so `w = 137`. Bottom `47` goes to 40, so `h = 40`.

Create `src/canvas/assist/candidates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard } from '../../model/factory';
import { groupSteps } from '../../ops/groups';
import { setLanes } from '../../ops/lanes';
import { addStep } from '../../ops/steps';
import { buildCandidates, excludedFor, laneLines } from './candidates';

const WORLD = { x: -10000, y: -10000, w: 20000, h: 20000 };

function grouped() {
  const b = createBoard('B');
  const a = addStep(b, { title: 'A', x: 0, y: 0 });
  const s = addStep(b, { title: 'S', x: 300, y: 0 });
  const c = addStep(b, { title: 'C', x: 0, y: 400 });
  const g = groupSteps(b, [a, s], 'G');
  return { b, a, s, c, g };
}

describe('snap candidates', () => {
  it('excludes a dragged step and its own group frame but keeps its siblings', () => {
    const { b, a, s, g } = grouped();
    const skip = excludedFor(b, [a]);
    expect(skip.has(a)).toBe(true);
    expect(skip.has(g)).toBe(true);
    expect(skip.has(s)).toBe(false);
  });

  it('excludes the members of a dragged group', () => {
    const { b, a, s, g, c } = grouped();
    expect([...excludedFor(b, [g])].sort()).toEqual([a, g, s].sort());
    expect(excludedFor(b, [g]).has(c)).toBe(false);
  });

  it('keeps only nodes in view, nearest first, up to the cap', () => {
    const { b, a } = grouped();
    const moving = { x: 0, y: 0, w: 180, h: 72 };
    expect(buildCandidates(b, [a], moving, WORLD).boxes).toHaveLength(2);
    expect(buildCandidates(b, [a], moving, { x: -50, y: -50, w: 600, h: 200 }).boxes).toEqual([{ x: 300, y: 0, w: 180, h: 72 }]);
    expect(buildCandidates(b, [a], moving, WORLD, undefined, 1).boxes).toEqual([{ x: 300, y: 0, w: 180, h: 72 }]);
  });

  it('uses measured sizes when given', () => {
    const { b, a, c } = grouped();
    const sizeOf = (id: string) => (id === c ? { w: 50, h: 20 } : undefined);
    expect(buildCandidates(b, [a], { x: 0, y: 0, w: 180, h: 72 }, WORLD, sizeOf).boxes).toContainEqual({ x: 0, y: 400, w: 50, h: 20 });
  });

  it('turns lane boundaries into lines across the lanes', () => {
    const b = createBoard('B');
    setLanes(b, ['Ops', 'Eng']);
    const [l1, l2] = [...b.lanes].sort((p, q) => p.order - q.order);
    expect(laneLines(b)).toEqual({ xLines: [], yLines: [0, l1.height, l1.height + l2.height] });
    b.direction = 'TB';
    expect(laneLines(b)).toEqual({ xLines: [0, l1.height, l1.height + l2.height], yLines: [] });
    expect(laneLines(createBoard('Empty'))).toEqual({ xLines: [], yLines: [] });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/canvas/assist`

Expected: FAIL, "snapResize is not exported" and "Cannot find module './candidates'".

- [ ] **Step 3: Implement**

Append to `src/canvas/assist/snap.ts`:

```ts
export interface ResizeEdges {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

function snapEdge(v: number, targets: number[], t: number, prefs: SnapPrefs): number {
  const d = prefs.smartGuides ? nearest([v], targets, t) : null;
  if (d !== null) return v + d;
  return prefs.gridSnap ? Math.round(v / GRID) * GRID : v;
}

export function snapResize(
  r: Rect,
  edges: ResizeEdges,
  c: Candidates,
  prefs: SnapPrefs,
  zoom: number,
  alt: boolean,
  min: { w: number; h: number },
): { rect: Rect; guides: Guide[] } {
  if (alt) return { rect: r, guides: [] };
  const t = SNAP_PX / zoom;
  const xs = targetLines(c, 'x');
  const ys = targetLines(c, 'y');
  let { x, y, w, h } = r;
  if (edges.left) {
    const nx = snapEdge(x, xs, t, prefs);
    if (x + w - nx >= min.w) {
      w += x - nx;
      x = nx;
    }
  } else if (edges.right) {
    const right = snapEdge(x + w, xs, t, prefs);
    if (right - x >= min.w) w = right - x;
  }
  if (edges.top) {
    const ny = snapEdge(y, ys, t, prefs);
    if (y + h - ny >= min.h) {
      h += y - ny;
      y = ny;
    }
  } else if (edges.bottom) {
    const bottom = snapEdge(y + h, ys, t, prefs);
    if (bottom - y >= min.h) h = bottom - y;
  }
  const rect = { x, y, w, h };
  return { rect, guides: prefs.smartGuides ? [...alignGuides(rect, c, 'x'), ...alignGuides(rect, c, 'y')] : [] };
}
```

Create `src/canvas/assist/candidates.ts`:

```ts
import { axes, laneBands, overlaps, type Rect } from '../../layout/place';
import type { Board, BoardNode } from '../../model/types';
import type { Candidates } from './snap';

export const CANDIDATE_CAP = 200;

export type SizeOf = (id: string) => { w: number; h: number } | undefined;

export function rectOf(n: BoardNode, sizeOf?: SizeOf): Rect {
  const s = sizeOf?.(n.id);
  return { x: n.x, y: n.y, w: s?.w ?? n.w, h: s?.h ?? n.h };
}

export function excludedFor(b: Board, ids: string[]): Set<string> {
  const dragged = new Set(ids);
  const out = new Set(ids);
  for (const n of b.nodes) {
    if (dragged.has(n.id) && n.groupId) out.add(n.groupId);
    if (n.groupId && dragged.has(n.groupId)) out.add(n.id);
  }
  return out;
}

export function laneLines(b: Board): { xLines: number[]; yLines: number[] } {
  const bands = laneBands(b);
  if (!bands.length) return { xLines: [], yLines: [] };
  const lines = [bands[0].start, ...bands.map((band) => band.start + band.size)];
  return axes(b).cross === 'y' ? { xLines: [], yLines: lines } : { xLines: lines, yLines: [] };
}

export function buildCandidates(b: Board, ids: string[], moving: Rect, view: Rect, sizeOf?: SizeOf, cap = CANDIDATE_CAP): Candidates {
  const skip = excludedFor(b, ids);
  const cx = moving.x + moving.w / 2;
  const cy = moving.y + moving.h / 2;
  const boxes = b.nodes
    .filter((n) => !skip.has(n.id))
    .map((n) => rectOf(n, sizeOf))
    .filter((r) => overlaps(r, view, 0))
    .map((r) => ({ r, d: (r.x + r.w / 2 - cx) ** 2 + (r.y + r.h / 2 - cy) ** 2 }))
    .sort((p, q) => p.d - q.d)
    .slice(0, cap)
    .map((e) => e.r);
  return { boxes, ...laneLines(b) };
}
```

Before running, confirm two things by reading the source:
- `groupSteps(b, ids, title)` in `src/ops/groups.ts` returns the new group id.
- `setLanes` in `src/ops/lanes.ts` gives new lanes a height.

If either signature differs, adjust the test calls, not the production code.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/canvas/assist`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/assist
git commit -m "Add resize snapping and snap candidate selection"
```

---

### Task 5: Snap and guides while dragging

**Files:**
- Create: `src/canvas/assist/overlay.ts`, `src/canvas/assist/modifiers.ts`, `src/canvas/assist/useDragAssist.ts`, `src/canvas/assist/GuidesOverlay.tsx`
- Modify: `src/canvas/Canvas.tsx` (drag handlers, `onNodesChange`, children)
- Modify: `src/canvas/canvas.css` (append guide styles)
- Modify: `tests/e2e/assists.spec.ts`, `tests/e2e/perf.spec.ts`

**Interfaces:**
- Consumes:
  - `snapMove`, `lockAxis` (Task 3)
  - `buildCandidates`, `rectOf`, `SizeOf` (Task 4)
  - `layoutPrefs` (Task 2)
- Produces:
  - `assistOverlay` (zustand vanilla store `{ guides: Guide[]; ghosts: Rect[] }`) and `clearOverlay()`
  - `mods: { alt: boolean; shift: boolean; ctrl: boolean }` and `watchModifiers(onChange): () => void`
  - `useDragAssist(boardId, editable, measured): DragAssist`, where `DragAssist = { active(): boolean; start(ids: string[]): void; adjustMove(positions: Record<string, XY>): void; finish(): void }`
  - Task 6 adds `adjustResize`. Task 7 changes `finish`.

- [ ] **Step 1: Write the failing browser tests**

In `tests/e2e/assists.spec.ts`, add `test.use({ viewport: { width: 1600, height: 900 } });` right after the imports. Then append:

```ts
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
      await expect(page.locator('.fs-guide').first()).toBeVisible();
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
```

Check the Shift case: from `x: 405` a move of 150 gives a raw x of 555. The grid rounds that to 560. `y` stays 3 because the lock pins it. A shares the row but offers no x line within 6px and no gap to match, so the grid wins.

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test tests/e2e/assists.spec.ts`

Expected: the five new tests FAIL (positions unsnapped, no `.fs-guide`). Tasks 1 and 2 still pass.

- [ ] **Step 3: Implement the overlay store, the modifier tracker and the overlay component**

Create `src/canvas/assist/overlay.ts`:

```ts
import { createStore } from 'zustand/vanilla';
import type { Rect } from '../../layout/geometry';
import type { Guide } from './snap';

export const assistOverlay = createStore<{ guides: Guide[]; ghosts: Rect[] }>()(() => ({ guides: [], ghosts: [] }));

export function clearOverlay(): void {
  assistOverlay.setState({ guides: [], ghosts: [] });
}
```

Create `src/canvas/assist/modifiers.ts`:

```ts
export const mods = { alt: false, shift: false, ctrl: false };
let pointerDown = false;
let swallowAltUp = false;

function read(e: KeyboardEvent | PointerEvent): void {
  mods.alt = e.altKey;
  mods.shift = e.shiftKey;
  mods.ctrl = e.ctrlKey || e.metaKey;
}

const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const;

export function watchModifiers(onChange: () => void): () => void {
  const onPointer = (e: PointerEvent) => {
    read(e);
    if (e.type === 'pointerdown') pointerDown = true;
    else if (e.type === 'pointerup' || e.type === 'pointercancel') pointerDown = false;
  };
  const onKey = (e: KeyboardEvent) => {
    read(e);
    if (e.key === 'Alt') {
      // Windows focuses the browser menu when a lone Alt is released, which would swallow the next shortcut.
      if (e.type === 'keydown' && pointerDown) swallowAltUp = true;
      if (swallowAltUp) e.preventDefault();
      if (e.type === 'keyup') swallowAltUp = false;
    }
    onChange();
  };
  for (const t of POINTER_EVENTS) window.addEventListener(t, onPointer, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  return () => {
    for (const t of POINTER_EVENTS) window.removeEventListener(t, onPointer, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
  };
}
```

Create `src/canvas/assist/GuidesOverlay.tsx`:

```tsx
import { ViewportPortal } from '@xyflow/react';
import { useStore } from 'zustand';
import { assistOverlay } from './overlay';
import type { Guide } from './snap';

function GuideMark({ g }: { g: Guide }) {
  if (g.kind === 'line') {
    return g.axis === 'x' ? (
      <line className="fs-guide" x1={g.at} x2={g.at} y1={g.from} y2={g.to} />
    ) : (
      <line className="fs-guide" x1={g.from} x2={g.to} y1={g.at} y2={g.at} />
    );
  }
  const d =
    g.axis === 'x'
      ? `M${g.start} ${g.cross - 5}V${g.cross + 5}M${g.start} ${g.cross}H${g.end}M${g.end} ${g.cross - 5}V${g.cross + 5}`
      : `M${g.cross - 5} ${g.start}H${g.cross + 5}M${g.cross} ${g.start}V${g.end}M${g.cross - 5} ${g.end}H${g.cross + 5}`;
  return <path className="fs-guide fs-gap" d={d} />;
}

export function GuidesOverlay() {
  const guides = useStore(assistOverlay, (s) => s.guides);
  const ghosts = useStore(assistOverlay, (s) => s.ghosts);
  if (!guides.length && !ghosts.length) return null;
  return (
    <ViewportPortal>
      <svg className="fs-guides" width={1} height={1}>
        {ghosts.map((r, i) => (
          <rect key={`ghost${i}`} className="fs-ghost" x={r.x} y={r.y} width={r.w} height={r.h} rx={8} />
        ))}
        {guides.map((g, i) => (
          <GuideMark key={`guide${i}`} g={g} />
        ))}
      </svg>
    </ViewportPortal>
  );
}
```

Append to `src/canvas/canvas.css`:

```css
.fs-guides {
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
  z-index: 1000;
}
.fs-guide {
  stroke: var(--accent);
  stroke-width: 1;
  fill: none;
  vector-effect: non-scaling-stroke;
}
.fs-ghost {
  fill: none;
  stroke: var(--text-3);
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
  vector-effect: non-scaling-stroke;
}
```

- [ ] **Step 4: Implement the drag session hook**

Create `src/canvas/assist/useDragAssist.ts`:

```ts
import { useStoreApi } from '@xyflow/react';
import { useEffect, useMemo, useRef } from 'react';
import { boundsOf, type Rect } from '../../layout/geometry';
import type { Board } from '../../model/types';
import { layoutPrefs } from '../../store/layoutPrefs';
import { flowStore } from '../../store/store';
import { buildCandidates, rectOf, type SizeOf } from './candidates';
import { mods, watchModifiers } from './modifiers';
import { assistOverlay, clearOverlay } from './overlay';
import { lockAxis, snapMove, type Axis, type Candidates } from './snap';

export type XY = { x: number; y: number };
export type Size = { width: number; height: number };

interface Session {
  ids: string[];
  start: Map<string, XY>;
  ghosts: Rect[];
  box: Rect;
  cands: Candidates;
  delta: XY;
}

export interface DragAssist {
  active(): boolean;
  start(ids: string[]): void;
  adjustMove(positions: Record<string, XY>): void;
  finish(): void;
}

export function useDragAssist(boardId: string, editable: boolean, measured: ReadonlyMap<string, Size>): DragAssist {
  const rfStore = useStoreApi();
  const session = useRef<Session | null>(null);

  useEffect(() => {
    if (!editable) return;
    return watchModifiers(() => {
      const s = session.current;
      if (s) assistOverlay.setState({ ghosts: mods.ctrl ? s.ghosts : [] });
    });
  }, [editable]);

  return useMemo(() => {
    const boardOf = (): Board | undefined => flowStore.getState().project.boards.find((b) => b.id === boardId);
    const sizeOf: SizeOf = (id) => {
      const m = measured.get(id);
      return m ? { w: m.width, h: m.height } : undefined;
    };
    const view = (): { rect: Rect; zoom: number } => {
      const { width, height, transform } = rfStore.getState();
      const [tx, ty, zoom] = transform;
      return { rect: { x: -tx / zoom, y: -ty / zoom, w: width / zoom, h: height / zoom }, zoom };
    };
    return {
      active: () => session.current !== null,
      start(ids) {
        const b = boardOf();
        if (!b || !editable) return;
        const dragged = new Set(ids);
        const start = new Map<string, XY>();
        for (const n of b.nodes) if (dragged.has(n.id) || (n.groupId && dragged.has(n.groupId))) start.set(n.id, { x: n.x, y: n.y });
        const ghosts = b.nodes.filter((n) => dragged.has(n.id)).map((n) => rectOf(n, sizeOf));
        const box = boundsOf(ghosts);
        if (!box) return;
        session.current = { ids, start, ghosts, box, cands: buildCandidates(b, ids, box, view().rect, sizeOf), delta: { x: 0, y: 0 } };
      },
      adjustMove(positions) {
        const s = session.current;
        const ref = s?.ids.find((id) => positions[id] && s.start.has(id));
        const origin = ref ? s?.start.get(ref) : undefined;
        if (!s || !ref || !origin) return;
        let dx = positions[ref].x - origin.x;
        let dy = positions[ref].y - origin.y;
        let lock: Axis | null = null;
        if (mods.shift) {
          lock = lockAxis(dx, dy);
          if (lock === 'x') dy = 0;
          else dx = 0;
        }
        const moving = { ...s.box, x: s.box.x + dx, y: s.box.y + dy };
        const snap = snapMove(moving, s.cands, layoutPrefs.getState().prefs, view().zoom, { alt: mods.alt, lock });
        s.delta = { x: dx + snap.dx, y: dy + snap.dy };
        for (const id of s.ids) {
          const p = s.start.get(id);
          if (p && positions[id]) positions[id] = { x: p.x + s.delta.x, y: p.y + s.delta.y };
        }
        assistOverlay.setState({ guides: snap.guides, ghosts: mods.ctrl ? s.ghosts : [] });
      },
      finish() {
        session.current = null;
        clearOverlay();
      },
    };
  }, [boardId, editable, measured, rfStore]);
}
```

- [ ] **Step 5: Wire it into the canvas**

In `src/canvas/Canvas.tsx`:
- Add these imports:

```ts
import { GuidesOverlay } from './assist/GuidesOverlay';
import { useDragAssist } from './assist/useDragAssist';
```

- After `const measured = useRef(...)`, add `const assist = useDragAssist(boardId, editable, measured.current);`.
- Replace the unmount effect `useEffect(() => () => endDrag(dragging), []);` with:

```ts
  useEffect(
    () => () => {
      assist.finish();
      endDrag(dragging);
    },
    [assist],
  );
```

- In the vanish effect, change `endDrag(dragging);` to `{ assist.finish(); endDrag(dragging); }`. Add `assist` to its deps: `[board, assist]`.
- In `onNodesChange`, right after the `for (const ch of changes)` loop and before `if (editable && (Object.keys(positions).length ...`, add:

```ts
      // React Flow's drag-end change carries its own unsnapped positions, so every change in a drag is snapped.
      if (editable && Object.keys(positions).length && assist.active()) assist.adjustMove(positions);
```

  Change that callback's deps to `[boardId, editable, assist]`.
- Replace the `onNodeDragStart` and `onNodeDragStop` props with:

```tsx
      onNodeDragStart={(_, node, dragged) => {
        dragging.current = [node.id];
        flowStore.getState().begin();
        assist.start(dragged.map((n) => n.id));
      }}
```

```tsx
      onNodeDragStop={() => {
        assist.finish();
        endDrag(dragging);
      }}
```

- Add `{editable && <GuidesOverlay />}` as the first child of `<ReactFlow>`.

- [ ] **Step 6: Run the browser tests**

Run: `npx playwright test tests/e2e/assists.spec.ts tests/e2e/interactions.spec.ts tests/e2e/canvas.spec.ts`

Expected: all PASS.
- If an older test asserted an exact unsnapped drop position, grid snap now moves it. Update that expectation to the snapped value and say so in the commit message.
- If the "one undo entry" test fails, snapping has split the drag. Check that `begin()` still runs before `assist.start`.
- If the Shift test drags a different node, React Flow's Shift multi-select added a node. Check the seed has nothing preselected.

- [ ] **Step 7: Add the drag frame-budget test**

In `tests/e2e/perf.spec.ts`, extract the frame sampler from the existing test into a helper at file top, and make the existing test call it:

```ts
function sampleFrames(page: Page, count = 240): Promise<number[]> {
  return page.evaluate(
    (n) =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        let last = performance.now();
        const tick = (now: number) => {
          times.push(now - last);
          last = now;
          if (times.length < n) requestAnimationFrame(tick);
          else resolve(times);
        };
        requestAnimationFrame(tick);
      }),
    count,
  );
}

function p95(times: number[]): number {
  const sorted = times.slice(5).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)];
}
```

- Import `type Page` from `@playwright/test`.
- In the existing test, replace its inline `page.evaluate(...)` with `const frames = sampleFrames(page);`.
- Keep its `avg` and `p95` logging, using the helper for p95.

Then add:

```ts
test('drags on a 1000-step board with guides on without long frames', async ({ page, request }) => {
  test.setTimeout(120_000);
  const p = await seed(request, (b) => {
    for (let row = 0; row < 50; row++) {
      let prev = addStep(b, { title: `R${row} C0`, x: 0, y: row * 140 });
      for (let col = 1; col < 20; col++) prev = addStep(b, { title: `R${row} C${col}`, after: prev });
    }
  }, 'Perf drag');
  await open(page, p);
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
  const target = (await page.locator('.react-flow__node-step').first().boundingBox())!;
  const frames = sampleFrames(page);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 60; i++) await page.mouse.move(target.x + target.width / 2 + i * 4, target.y + target.height / 2 + i * 3);
  await page.mouse.up();
  const worst = p95(await frames);
  console.log(`1000 steps drag: p95 ${worst.toFixed(1)}ms`);
  expect(worst).toBeLessThan(50);
});
```

- [ ] **Step 8: Run the perf tests**

Run: `npx playwright test tests/e2e/perf.spec.ts`

Expected: both PASS.

If the drag test fails:
1. Profile before touching the code.
2. The likely cost is `buildCandidates` being called outside `start`. Confirm it runs once per drag.
3. The next likely cost is `assistOverlay.setState` re-rendering on every move. That's acceptable only if the overlay alone re-renders.

- [ ] **Step 9: Typecheck, full unit run, commit**

Run: `npm run typecheck && npm test`

Expected: PASS.

```bash
git add src/canvas/assist src/canvas/Canvas.tsx src/canvas/canvas.css tests/e2e/assists.spec.ts tests/e2e/perf.spec.ts
git commit -m "Snap drags to guides, equal gaps and the grid, with Shift lock and Alt suspend"
```

---

### Task 6: Snap while resizing

**Files:**
- Modify: `src/canvas/assist/useDragAssist.ts` (add `adjustResize`)
- Modify: `src/canvas/Canvas.tsx` (`onNodesChange`)
- Modify: `src/canvas/StepNode.tsx:22-23,42`, `src/canvas/TextNode.tsx:12`, `src/canvas/GroupNode.tsx:12` (resize start/end, min sizes)
- Modify: `tests/e2e/assists.spec.ts`

**Interfaces:**
- Consumes: `snapResize`, `RESIZE_MIN` (Tasks 3 and 4), `buildCandidates` (Task 4).
- Produces: `DragAssist.adjustResize(positions: Record<string, XY>, sizes: Record<string, Size>): void`, which mutates both records in place. Also `endResize()`, exported from `src/canvas/assist/overlay.ts`.

- [ ] **Step 1: Write the failing browser test**

Append to `tests/e2e/assists.spec.ts`:

```ts
test('resizing snaps the dragged edge unless resize snap is off', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await resetZoom(page);
  await node(page, 's1').click();
  const edge = await centerOf(node(page, 's1').locator('.react-flow__resize-control.line.right'));
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 27, edge.y, { steps: 8 });
  await page.mouse.up();
  expect(await node0(page, 's1')).toMatchObject({ x: 0, w: 200 });
  expect(await page.evaluate(() => window.__flowstate!.getState().past.length)).toBe(1);

  await page.getByRole('button', { name: 'Layout assists' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Snap while resizing' }).click();
  await page.keyboard.press('Escape');
  const edge2 = await centerOf(node(page, 's1').locator('.react-flow__resize-control.line.right'));
  await page.mouse.move(edge2.x, edge2.y);
  await page.mouse.down();
  await page.mouse.move(edge2.x + 7, edge2.y, { steps: 4 });
  await page.mouse.up();
  expect(await node0(page, 's1')).toMatchObject({ x: 0, w: 207 });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test tests/e2e/assists.spec.ts -g "resizing snaps"`

Expected: FAIL, with `w` of 207 on the first assertion.

- [ ] **Step 3: Implement `adjustResize` and `endResize`**

In `src/canvas/assist/overlay.ts`, add:

```ts
import { flowStore } from '../../store/store';

export function endResize(): void {
  clearOverlay();
  flowStore.getState().commit();
}
```

In `src/canvas/assist/useDragAssist.ts`:
- Add `adjustResize(positions: Record<string, XY>, sizes: Record<string, Size>): void;` to `DragAssist`.
- Import `snapResize` and `RESIZE_MIN` from `./snap`.
- Add this method to the returned object:

```ts
      adjustResize(positions, sizes) {
        const prefs = layoutPrefs.getState().prefs;
        const b = boardOf();
        if (!b || !editable || !prefs.resizeSnap) return;
        const { rect: viewRect, zoom } = view();
        const moved = (a: number, c: number) => Math.abs(a - c) > 0.01;
        for (const [id, d] of Object.entries(sizes)) {
          const n = b.nodes.find((x) => x.id === id);
          if (!n) continue;
          const pos = positions[id] ?? { x: n.x, y: n.y };
          const raw = { x: pos.x, y: pos.y, w: d.width, h: d.height };
          // The board holds last frame's snapped rect, so an edge that differs from it is the one being dragged.
          const edges = {
            left: moved(raw.x, n.x),
            top: moved(raw.y, n.y),
            right: moved(raw.x + raw.w, n.x + n.w),
            bottom: moved(raw.y + raw.h, n.y + n.h),
          };
          const out = snapResize(raw, edges, buildCandidates(b, [id], raw, viewRect, sizeOf), prefs, zoom, mods.alt, RESIZE_MIN[n.kind]);
          if (positions[id] || out.rect.x !== raw.x || out.rect.y !== raw.y) positions[id] = { x: out.rect.x, y: out.rect.y };
          sizes[id] = { width: out.rect.w, height: out.rect.h };
          assistOverlay.setState({ guides: out.guides });
        }
      },
```

In `src/canvas/Canvas.tsx` `onNodesChange`, directly after the `adjustMove` line from Task 5, add:

```ts
      if (editable && Object.keys(sizes).length) assist.adjustResize(positions, sizes);
```

Wire the resizers:
- In `StepNode.tsx`:
  - Delete the module-level `commit` const.
  - Import `endResize` from `./assist/overlay` and `RESIZE_MIN` from `./assist/snap`.
  - Change the resizer to:

```tsx
      {editable && <NodeResizer isVisible={selected} minWidth={RESIZE_MIN.step.w} minHeight={RESIZE_MIN.step.h} onResizeStart={begin} onResizeEnd={endResize} />}
```

- In `TextNode.tsx` and `GroupNode.tsx`, make the same change using `RESIZE_MIN.text` and `RESIZE_MIN.group`. Keep `onResizeStart={() => flowStore.getState().begin()}`, and set `onResizeEnd={endResize}`.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test tests/e2e/assists.spec.ts tests/e2e/canvas.spec.ts && npm run typecheck`

Expected: PASS.

If the final width shows raw (207) after mouse up in the first half, React Flow's final `resizing: false` dimension change overwrote the store. Check `measured.current` in `Canvas.onNodesChange`: it stores raw dimensions, while `board` holds the snapped ones. The ResizeObserver re-measures on the next frame, so the rendered size should match the board. The assertion reads the board, not the DOM.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/assist src/canvas/Canvas.tsx src/canvas/StepNode.tsx src/canvas/TextNode.tsx src/canvas/GroupNode.tsx tests/e2e/assists.spec.ts
git commit -m "Snap resized edges to guides and the grid"
```

---

### Checkpoint: human playtest

Stop here and ask the user to playtest drag snapping, guides, spacing marks, Shift, Alt and resize snap, with each Layout switch on and off. Specifically ask:
1. Does the 6px snap distance feel right?
2. Are the guides visible enough in both themes?
3. On Windows, after an Alt+drag, does the next shortcut (for example Ctrl+Z) still work?

Fold any findings in before Task 7.

---

### Task 7: Ctrl+drag and Ctrl+Shift+drag copy

**Files:**
- Modify: `src/canvas/assist/useDragAssist.ts` (`finish` returns a copy request; ghosts become candidates under Ctrl)
- Modify: `src/canvas/Canvas.tsx` (`onNodeDragStop`, imports)
- Modify: `tests/e2e/assists.spec.ts`

**Interfaces:**
- Consumes: `copySubgraph`, `pasteSubgraph` (`src/ops/clipboard.ts`) and `setPositions` (`src/ops/steps.ts`), all existing.
- Produces: `DragAssist.finish(event?: { ctrlKey: boolean; metaKey: boolean }): CopyDrop | null`, where `CopyDrop = { ids: string[]; start: Record<string, XY>; delta: XY }`.

- [ ] **Step 1: Write the failing browser tests**

Append to `tests/e2e/assists.spec.ts`. Add `import { connect } from '../../src/ops/edges';` to the imports.

```ts
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
  await page.mouse.move(c.x, c.y + 200, { steps: 10 });
  await page.keyboard.up('Control');
  await page.mouse.up();
  const b = await board(page);
  expect(b.nodes).toHaveLength(1);
  expect(b.nodes[0]).toMatchObject({ x: 0, y: 200 });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test tests/e2e/assists.spec.ts -g "Ctrl|copy"`

Expected: the first three FAIL, because the node moves and no copy appears. The fourth may already pass. Keep it as a regression guard.

- [ ] **Step 3: Implement**

In `src/canvas/assist/useDragAssist.ts`:
- Add this export:

```ts
export interface CopyDrop {
  ids: string[];
  start: Record<string, XY>;
  delta: XY;
}
```

- Change `finish(): void;` in `DragAssist` to `finish(event?: { ctrlKey: boolean; metaKey: boolean }): CopyDrop | null;`.
- In `adjustMove`, replace `const snap = snapMove(moving, s.cands, ...` with:

```ts
        const cands = mods.ctrl ? { ...s.cands, boxes: [...s.cands.boxes, ...s.ghosts] } : s.cands;
        const snap = snapMove(moving, cands, layoutPrefs.getState().prefs, view().zoom, { alt: mods.alt, lock });
```

- Replace `finish` with:

```ts
      finish(event) {
        const s = session.current;
        session.current = null;
        clearOverlay();
        if (!s || !event || !(event.ctrlKey || event.metaKey)) return null;
        if (s.delta.x === 0 && s.delta.y === 0) return null;
        return { ids: s.ids, start: Object.fromEntries(s.start), delta: s.delta };
      },
```

In `src/canvas/Canvas.tsx`:
- Add `import { copySubgraph, pasteSubgraph } from '../ops/clipboard';`.
- Add `setPositions` if it is not already imported (it is).
- Replace `onNodeDragStop` with:

```tsx
      onNodeDragStop={(event) => {
        const copy = assist.finish(event);
        if (copy) {
          const ids = runSafely(() =>
            flowStore.getState().changeBoard((b) => {
              setPositions(b, copy.start);
              return pasteSubgraph(b, copySubgraph(b, copy.ids), copy.delta.x, copy.delta.y);
            }, boardId),
          );
          if (ids) flowStore.getState().select(ids);
        }
        endDrag(dragging);
      }}
```

The unmount and vanish paths keep calling `assist.finish()` with no event, which returns null.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test tests/e2e/assists.spec.ts tests/e2e/interactions.spec.ts && npm run typecheck`

Expected: PASS.

If the plain move in the fourth test becomes a copy, the stop event's `ctrlKey` is stale. Log `event.ctrlKey` in `onNodeDragStop`: React Flow passes d3's `sourceEvent`, which is the pointerup/mouseup and carries live modifier state.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/assist/useDragAssist.ts src/canvas/Canvas.tsx tests/e2e/assists.spec.ts
git commit -m "Copy on Ctrl+drag and keep the copy in line on Ctrl+Shift+drag"
```

---

### Task 8: Align, distribute, match size and reorder operations

**Files:**
- Create: `src/ops/arrange.ts`, `src/ops/arrange.test.ts`

**Interfaces:**
- Consumes:
  - From `src/ops/steps.ts`: `setPositions`, `withGroupMembers`, `resizeNode`
  - From `src/ops/query.ts`: `getNode`
  - From `src/layout/place.ts`: `fitGroup`
  - From `src/layout/geometry.ts`: `boundsOf`, `overlaps`
- Produces:
  - Types: `ALIGN_EDGES`, `AlignEdge`, `DistributeAxis = 'horizontal' | 'vertical'`, `MatchDims = 'width' | 'height' | 'both'`, `OrderMove = 'front' | 'forward' | 'backward' | 'back'`
  - `alignNodes(b, ids, edge): string[]`
  - `distributeNodes(b, ids, axis): string[]`
  - `matchSize(b, ids, referenceId, dims): string[]`
  - `reorder(b, ids, move): string[]`
  - All throw `OpError` on invalid input.

- [ ] **Step 1: Write the failing tests**

Create `src/ops/arrange.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard } from '../model/factory';
import { alignNodes, distributeNodes, matchSize, reorder } from './arrange';
import { OpError } from './errors';
import { groupSteps } from './groups';
import { setLanes } from './lanes';
import { addStep } from './steps';
import { node } from './testkit';

function three() {
  const b = createBoard('B');
  const ids = [addStep(b, { title: 'A', x: 0, y: 0 }), addStep(b, { title: 'B', x: 50, y: 100 }), addStep(b, { title: 'C', x: 120, y: 260 })];
  return { b, ids };
}

describe('alignNodes', () => {
  it('aligns left, right, top, middle and bottom to the selection box', () => {
    const cases: Array<[Parameters<typeof alignNodes>[2], 'x' | 'y', number[]]> = [
      ['left', 'x', [0, 0, 0]],
      ['right', 'x', [120, 120, 120]],
      ['top', 'y', [0, 0, 0]],
      ['middle', 'y', [130, 130, 130]],
      ['bottom', 'y', [260, 260, 260]],
    ];
    for (const [edge, axis, expected] of cases) {
      const { b, ids } = three();
      alignNodes(b, ids, edge);
      expect(ids.map((id) => node(b, id)[axis])).toEqual(expected);
    }
  });

  it('centres nodes of different widths', () => {
    const { b, ids } = three();
    node(b, ids[1]).w = 100;
    alignNodes(b, ids, 'center');
    expect(ids.map((id) => node(b, id).x)).toEqual([60, 100, 60]);
  });

  it('needs at least two items', () => {
    const { b, ids } = three();
    expect(() => alignNodes(b, [ids[0]], 'left')).toThrow(OpError);
  });

  it('moves a selected group with its members and ignores members listed alongside it', () => {
    const b = createBoard('B');
    const m1 = addStep(b, { title: 'M1', x: 0, y: 0 });
    const m2 = addStep(b, { title: 'M2', x: 300, y: 0 });
    const g = groupSteps(b, [m1, m2], 'G');
    const t = addStep(b, { title: 'T', x: 0, y: 400 });
    const before = node(b, g).y;
    alignNodes(b, [g, m1, t], 'bottom');
    const dy = node(b, g).y - before;
    expect(node(b, g).y + node(b, g).h).toBe(node(b, t).y + node(b, t).h);
    expect(node(b, m1).y).toBe(dy);
    expect(node(b, m2).y).toBe(dy);
  });

  it('reassigns lanes when alignment crosses them', () => {
    const b = createBoard('B');
    setLanes(b, ['Ops', 'Eng']);
    const a = addStep(b, { title: 'A', x: 0, y: 40 });
    const c = addStep(b, { title: 'C', x: 300, y: 300 });
    expect(node(b, a).laneId).not.toBe(node(b, c).laneId);
    alignNodes(b, [a, c], 'top');
    expect(node(b, c).laneId).toBe(node(b, a).laneId);
  });
});

describe('distributeNodes', () => {
  it('keeps the outermost nodes and equalises the gaps', () => {
    const b = createBoard('B');
    const ids = [addStep(b, { title: 'A', x: 0, y: 0 }), addStep(b, { title: 'B', x: 200, y: 0 }), addStep(b, { title: 'C', x: 600, y: 0 })];
    distributeNodes(b, ids, 'horizontal');
    expect(ids.map((id) => node(b, id).x)).toEqual([0, 300, 600]);
  });

  it('works vertically and needs three items', () => {
    const b = createBoard('B');
    const ids = [addStep(b, { title: 'A', x: 0, y: 0 }), addStep(b, { title: 'B', x: 0, y: 90 }), addStep(b, { title: 'C', x: 0, y: 400 })];
    distributeNodes(b, ids, 'vertical');
    expect(ids.map((id) => node(b, id).y)).toEqual([0, 200, 400]);
    expect(() => distributeNodes(b, ids.slice(0, 2), 'vertical')).toThrow(OpError);
  });
});

describe('matchSize', () => {
  it('copies width, height or both from the reference and keeps the top-left corner', () => {
    const b = createBoard('B');
    const ref = addStep(b, { title: 'R', x: 0, y: 0 });
    const other = addStep(b, { title: 'O', shape: 'decision', x: 300, y: 50 });
    matchSize(b, [ref, other], ref, 'width');
    expect(node(b, other)).toMatchObject({ x: 300, y: 50, w: 180, h: 110 });
    matchSize(b, [ref, other], ref, 'both');
    expect(node(b, other)).toMatchObject({ w: 180, h: 72 });
  });

  it('rejects an unknown reference or nothing else to resize', () => {
    const b = createBoard('B');
    const ref = addStep(b, { title: 'R', x: 0, y: 0 });
    expect(() => matchSize(b, [ref], 'nope', 'width')).toThrow(OpError);
    expect(() => matchSize(b, [ref], ref, 'width')).toThrow(OpError);
  });
});

describe('reorder', () => {
  function stack() {
    const b = createBoard('B');
    const ids = [addStep(b, { title: 'A', x: 0, y: 0 }), addStep(b, { title: 'B', x: 50, y: 20 }), addStep(b, { title: 'C', x: 100, y: 40 })];
    return { b, ids, order: () => b.nodes.map((n) => n.title) };
  }

  it('brings to front and sends to back', () => {
    const s = stack();
    reorder(s.b, [s.ids[0]], 'front');
    expect(s.order()).toEqual(['B', 'C', 'A']);
    reorder(s.b, [s.ids[0]], 'back');
    expect(s.order()).toEqual(['A', 'B', 'C']);
  });

  it('steps forward or backward past the next overlapping node only', () => {
    const s = stack();
    const far = addStep(s.b, { title: 'Far', x: 2000, y: 2000 });
    reorder(s.b, [s.ids[0]], 'forward');
    expect(s.order()).toEqual(['B', 'A', 'C', 'Far']);
    reorder(s.b, [s.ids[2]], 'forward');
    expect(s.order()).toEqual(['B', 'A', 'C', 'Far']);
    reorder(s.b, [far], 'backward');
    expect(s.order()).toEqual(['B', 'A', 'C', 'Far']);
    reorder(s.b, [s.ids[2]], 'backward');
    expect(s.order()).toEqual(['B', 'C', 'A', 'Far']);
  });

  it('keeps the relative order of several moved nodes', () => {
    const s = stack();
    reorder(s.b, [s.ids[0], s.ids[1]], 'forward');
    expect(s.order()).toEqual(['C', 'A', 'B']);
  });

  it('leaves groups where they are', () => {
    const s = stack();
    const g = groupSteps(s.b, [s.ids[0]], 'G');
    const groupIndex = s.b.nodes.findIndex((n) => n.id === g);
    reorder(s.b, [g], 'front');
    expect(s.b.nodes.findIndex((n) => n.id === g)).toBe(groupIndex);
  });
});
```

Check the distribute vertical case:
- The span is 0 to 472 (400 + 72) and the total height is 216.
- So the gap is `(472 - 216) / 2 = 128`, and B lands at `0 + 72 + 128 = 200`.

Check the "backward" case:
- In `['B', 'A', 'C', 'Far']`, moving C backward skips non-overlapping nodes. The first overlapping node below it is A (0..180 overlaps 100..280), so C moves before A, giving `['B', 'C', 'A', 'Far']`.
- Far overlaps nothing and stays put.

Before writing, confirm two things. If either differs, adjust these test expectations rather than the operations:
- `addStep` with explicit `x, y` sets `laneId` through `syncLane`. Read `addStep` in `src/ops/steps.ts`.
- The lane band heights make y 40 and y 300 land in different lanes.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ops/arrange.test.ts`

Expected: FAIL, "Cannot find module './arrange'".

- [ ] **Step 3: Implement**

Create `src/ops/arrange.ts`:

```ts
import { boundsOf, overlaps } from '../layout/geometry';
import { fitGroup } from '../layout/place';
import type { Board, BoardNode } from '../model/types';
import { OpError } from './errors';
import { getNode } from './query';
import { resizeNode, setPositions, withGroupMembers } from './steps';

export const ALIGN_EDGES = ['left', 'center', 'right', 'top', 'middle', 'bottom'] as const;
export type AlignEdge = (typeof ALIGN_EDGES)[number];
export type DistributeAxis = 'horizontal' | 'vertical';
export type MatchDims = 'width' | 'height' | 'both';
export type OrderMove = 'front' | 'forward' | 'backward' | 'back';

type XY = { x: number; y: number };

function topLevel(b: Board, ids: string[], min: number, action: string): BoardNode[] {
  const picked = new Set(ids);
  const nodes = [...picked].map((id) => getNode(b, id)).filter((n) => !(n.groupId && picked.has(n.groupId)));
  if (nodes.length < min) throw new OpError(`${action} needs at least ${min} items that are not inside a selected group.`);
  return nodes;
}

function place(b: Board, positions: Record<string, XY>): void {
  setPositions(b, withGroupMembers(b, positions));
}

export function alignNodes(b: Board, ids: string[], edge: AlignEdge): string[] {
  const nodes = topLevel(b, ids, 2, 'Align');
  const box = boundsOf(nodes);
  if (!box) return [];
  const positions: Record<string, XY> = {};
  for (const n of nodes) {
    const p = { x: n.x, y: n.y };
    if (edge === 'left') p.x = box.x;
    else if (edge === 'center') p.x = box.x + (box.w - n.w) / 2;
    else if (edge === 'right') p.x = box.x + box.w - n.w;
    else if (edge === 'top') p.y = box.y;
    else if (edge === 'middle') p.y = box.y + (box.h - n.h) / 2;
    else p.y = box.y + box.h - n.h;
    positions[n.id] = p;
  }
  place(b, positions);
  return nodes.map((n) => n.id);
}

export function distributeNodes(b: Board, ids: string[], axis: DistributeAxis): string[] {
  const nodes = topLevel(b, ids, 3, 'Distribute');
  const [pos, size] = axis === 'horizontal' ? (['x', 'w'] as const) : (['y', 'h'] as const);
  const sorted = [...nodes].sort((p, q) => p[pos] - q[pos]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const total = sorted.reduce((sum, n) => sum + n[size], 0);
  const gap = (last[pos] + last[size] - first[pos] - total) / (sorted.length - 1);
  const positions: Record<string, XY> = {};
  let at = first[pos];
  for (const n of sorted) {
    positions[n.id] = pos === 'x' ? { x: at, y: n.y } : { x: n.x, y: at };
    at += n[size] + gap;
  }
  place(b, positions);
  return sorted.map((n) => n.id);
}

export function matchSize(b: Board, ids: string[], referenceId: string, dims: MatchDims): string[] {
  const ref = getNode(b, referenceId);
  const others = [...new Set(ids)]
    .filter((id) => id !== referenceId)
    .map((id) => getNode(b, id))
    .filter((n) => n.kind !== 'group');
  if (!others.length) throw new OpError('Match size needs at least one other step or text besides the reference.');
  const groups = new Set<string>();
  for (const n of others) {
    resizeNode(b, n.id, { x: n.x, y: n.y, w: dims === 'height' ? n.w : ref.w, h: dims === 'width' ? n.h : ref.h });
    if (n.groupId) groups.add(n.groupId);
  }
  for (const g of groups) fitGroup(b, g);
  return others.map((n) => n.id);
}

function stepPast(b: Board, id: string, dir: 1 | -1, picked: Set<string>): void {
  const i = b.nodes.findIndex((n) => n.id === id);
  const n = b.nodes[i];
  for (let j = i + dir; j >= 0 && j < b.nodes.length; j += dir) {
    const other = b.nodes[j];
    if (picked.has(other.id) || other.kind === 'group') continue;
    if (overlaps(n, other, 0)) {
      b.nodes.splice(i, 1);
      b.nodes.splice(j, 0, n);
      return;
    }
  }
}

export function reorder(b: Board, ids: string[], move: OrderMove): string[] {
  const picked = new Set(ids.filter((id) => getNode(b, id).kind !== 'group'));
  if (move === 'front' || move === 'back') {
    const chosen = b.nodes.filter((n) => picked.has(n.id));
    const rest = b.nodes.filter((n) => !picked.has(n.id));
    b.nodes = move === 'front' ? [...rest, ...chosen] : [...chosen, ...rest];
  } else {
    const dir = move === 'forward' ? 1 : -1;
    const order = b.nodes.map((n) => n.id).filter((id) => picked.has(id));
    for (const id of dir === 1 ? order.reverse() : order) stepPast(b, id, dir, picked);
  }
  return [...picked];
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/ops/arrange.test.ts`

Expected: PASS.

Also check that the operations work on immer drafts, because the store runs them inside `produce`. Add this test to `src/ops/arrange.test.ts`:

```ts
import { createFlowStore } from '../store/store';

describe('arrange inside the store', () => {
  it('reorders and aligns through changeBoard as one undo step each', () => {
    const store = createFlowStore();
    const ids = store.getState().changeBoard((b) => [addStep(b, { title: 'A', x: 0, y: 0 }), addStep(b, { title: 'B', x: 50, y: 20 })]);
    const before = store.getState().past.length;
    store.getState().changeBoard((b) => reorder(b, [ids[0]], 'front'));
    store.getState().changeBoard((b) => alignNodes(b, ids, 'left'));
    const b = store.getState().project.boards[0];
    expect(b.nodes.map((n) => n.title)).toEqual(['B', 'A']);
    expect(b.nodes.map((n) => n.x)).toEqual([0, 0]);
    expect(store.getState().past.length).toBe(before + 2);
  });
});
```

Run: `npx vitest run src/ops/arrange.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ops/arrange.ts src/ops/arrange.test.ts
git commit -m "Add align, distribute, match size and reorder board operations"
```

---

### Task 9: Colour presets plus custom fill

**Files:**
- Create: `src/model/color.ts`, `src/model/color.test.ts`
- Modify: `src/canvas/labels.tsx:4` (delete the `TINTS` export)
- Modify: `src/canvas/FloatingToolbar.tsx` (import `TINTS` from the model, swatch, custom input)
- Modify: `src/ops/steps.ts` (`cleanFields` validates colour)
- Modify: `src/ops/steps.test.ts` (validation test)
- Modify: `src/canvas/ShapeSvg.tsx:54-57` (optional `fill`)
- Modify: `src/canvas/StepNode.tsx` (fill and ink classes)
- Modify: `src/ui/controls.tsx` (add `ColorInput`)
- Modify: `src/canvas/canvas.css` (ink and colour-input rules)
- Modify: `tests/e2e/assists.spec.ts`

**Interfaces:**
- Produces:
  - `TINTS`, `type Tint`, `isTint(v): v is Tint`, `isHex(v): boolean`, `isColor(v): boolean`
  - `type Fill = { kind: 'tint'; tint: Tint } | { kind: 'hex'; hex: string; ink: 'dark' | 'light' } | null`
  - `fillOf(color: string | null): Fill`, `inkOn(hex: string): 'dark' | 'light'`
  - `ColorInput({ label, value, onPick, className?, children? })`, which calls `onPick` once per native `change`.

- [ ] **Step 1: Write the failing tests**

Create `src/model/color.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fillOf, inkOn, isColor } from './color';

describe('colour', () => {
  it('accepts presets and #rrggbb only', () => {
    expect(isColor('green')).toBe(true);
    expect(isColor('#A1b2C3')).toBe(true);
    expect(isColor('red')).toBe(false);
    expect(isColor('#abc')).toBe(false);
  });

  it('resolves a stored colour to a preset tint, a custom fill, or the default', () => {
    expect(fillOf(null)).toBeNull();
    expect(fillOf('blue')).toEqual({ kind: 'tint', tint: 'blue' });
    expect(fillOf('#ffeb3b')).toEqual({ kind: 'hex', hex: '#ffeb3b', ink: 'dark' });
    expect(fillOf('red')).toBeNull();
  });

  it('picks the more readable ink for a custom fill', () => {
    expect(inkOn('#ffffff')).toBe('dark');
    expect(inkOn('#000000')).toBe('light');
    expect(inkOn('#1b2130')).toBe('light');
  });
});
```

Append to `src/ops/steps.test.ts`, inside a new `describe`:

```ts
describe('step colour', () => {
  it('stores presets and hex colours and rejects anything else', () => {
    const { b, ids } = chain(['A']);
    updateSteps(b, [{ id: ids[0], color: '#12ab34' }]);
    expect(node(b, ids[0]).color).toBe('#12ab34');
    updateSteps(b, [{ id: ids[0], color: 'violet' }]);
    expect(node(b, ids[0]).color).toBe('violet');
    expect(() => updateSteps(b, [{ id: ids[0], color: 'red' }])).toThrow(OpError);
    updateSteps(b, [{ id: ids[0], color: null }]);
    expect(node(b, ids[0]).color).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/model/color.test.ts src/ops/steps.test.ts`

Expected: FAIL. `./color` is missing, and `'red'` does not throw.

- [ ] **Step 3: Implement the model and validation**

Create `src/model/color.ts`:

```ts
export const TINTS = ['blue', 'green', 'amber', 'rose', 'violet', 'slate'] as const;
export type Tint = (typeof TINTS)[number];
export type Fill = { kind: 'tint'; tint: Tint } | { kind: 'hex'; hex: string; ink: 'dark' | 'light' } | null;

const HEX = /^#[0-9a-f]{6}$/i;

export function isTint(value: string): value is Tint {
  return TINTS.some((t) => t === value);
}

export function isHex(value: string): boolean {
  return HEX.test(value);
}

export function isColor(value: string): boolean {
  return isTint(value) || isHex(value);
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function inkOn(hex: string): 'dark' | 'light' {
  const n = Number.parseInt(hex.slice(1), 16);
  const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return (lum + 0.05) / 0.05 >= 1.05 / (lum + 0.05) ? 'dark' : 'light';
}

export function fillOf(color: string | null): Fill {
  if (!color) return null;
  if (isTint(color)) return { kind: 'tint', tint: color };
  if (isHex(color)) return { kind: 'hex', hex: color, ink: inkOn(color) };
  return null;
}
```

In `src/ops/steps.ts`:
- Import `isColor, TINTS` from `'../model/color'` and `OpError` from `'./errors'` (if not already imported).
- In `cleanFields`, add this check inside the loop, before `out[key] = ...`:

```ts
    if (key === 'color' && typeof value === 'string' && !isColor(value)) {
      throw new OpError(`Unknown colour "${value}". Use ${TINTS.join(', ')}, a #rrggbb value, or null.`);
    }
```

Tidy up `TINTS`:
- In `src/canvas/labels.tsx`, delete the line `export const TINTS = [...] as const;`.
- In `src/canvas/FloatingToolbar.tsx`, remove `TINTS` from the `./labels` import and add `import { fillOf, TINTS } from '../model/color';`.
- Run `grep -rn "TINTS" src` and confirm nothing else imports it from `labels`.

- [ ] **Step 4: Run the unit tests**

Run: `npx vitest run src/model/color.test.ts src/ops/steps.test.ts`

Expected: PASS.

- [ ] **Step 5: Render custom fills and add the custom picker**

In `src/canvas/ShapeSvg.tsx`:
- Change the signature to `export function ShapeSvg({ shape, w, h, fill }: { shape: Shape; w: number; h: number; fill?: string })`.
- Change the body path to `<path className="fs-shape-body" d={shapePath(shape, w, h)} style={fill ? { fill } : undefined} />`.

In `src/canvas/StepNode.tsx`:
- Import `fillOf` from `'../model/color'`.
- Add `const fill = fillOf(node.color);` after the `const { node, ... } = data;` line.
- In the `className` array, replace `node.color && \`tint-${node.color}\`,` with:

```ts
    fill?.kind === 'tint' && `tint-${fill.tint}`,
    fill?.kind === 'hex' && `ink-${fill.ink}`,
```

- Change `<ShapeSvg shape={node.shape} w={node.w} h={node.h} />` to `<ShapeSvg shape={node.shape} w={node.w} h={node.h} fill={fill?.kind === 'hex' ? fill.hex : undefined} />`.

In `src/ui/controls.tsx`:
- Add `useEffect`, `useRef` and `type ReactNode` to the React import if they are missing.
- Import `isHex` from `'../model/color'`.
- Append:

```tsx
export function ColorInput({ label, value, onPick, className, children }: { label: string; value: string | null; onPick: (hex: string) => void; className?: string; children?: ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // React's onChange fires on every picker drag step, which would flood undo; the native change fires once.
    const onChange = () => onPick(el.value);
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, [onPick]);
  return (
    <label className={className} title={label}>
      <input ref={ref} type="color" aria-label={label} className="nodrag" defaultValue={value && isHex(value) ? value : '#4c6ef5'} />
      {children}
    </label>
  );
}
```

In `src/canvas/FloatingToolbar.tsx`:
- Import `ColorInput` from `'../ui/controls'`.
- Add `const fill = fillOf(node.color);` near the top of the component.
- Replace the Colour button's swatch span with:

```tsx
          <span className={`fs-swatch swatch-${fill?.kind === 'tint' ? fill.tint : 'none'}`} style={fill?.kind === 'hex' ? { background: fill.hex } : undefined} />
```

- In the `panel === 'color'` row, after the preset `.map(...)`, add:

```tsx
          <ColorInput label="Custom colour" value={node.color} className="fs-color-input" onPick={(hex) => update({ color: hex })} />
```

Append to `src/canvas/canvas.css`:

```css
.fs-step.ink-dark {
  --text: #1b2130;
  --text-2: #3f4757;
  --text-3: #5b6475;
}
.fs-step.ink-light {
  --text: #ffffff;
  --text-2: #e6e9ef;
  --text-3: #c9ced8;
}
.fs-color-input {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.fs-color-input input[type='color'] {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  cursor: pointer;
}
```

- [ ] **Step 6: Browser tests for custom colour and a bad stored colour**

Append to `tests/e2e/assists.spec.ts`:

```ts
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
```

`ToolButton` renders `title` as an attribute. If it renders an `aria-label` instead, switch to `getByRole('button', { name: 'Colour' })`. Check `src/ui/controls.tsx` first.

- [ ] **Step 7: Run everything touched**

Run: `npm run typecheck && npm test && npx playwright test tests/e2e/assists.spec.ts tests/e2e/canvas.spec.ts tests/e2e/export.spec.ts`

Expected: PASS. The export tests guard that inline fills survive image export.

- [ ] **Step 8: Commit**

```bash
git add src/model/color.ts src/model/color.test.ts src/ops/steps.ts src/ops/steps.test.ts src/canvas/labels.tsx src/canvas/FloatingToolbar.tsx src/canvas/ShapeSvg.tsx src/canvas/StepNode.tsx src/ui/controls.tsx src/canvas/canvas.css tests/e2e/assists.spec.ts
git commit -m "Allow a custom fill colour alongside the six presets, with readable text"
```

---

### Task 10: Selection commands, Ctrl+X, nudge and layer shortcuts

**Files:**
- Create: `src/canvas/commands.ts`
- Modify: `src/canvas/useKeyboard.ts` (Ctrl branch and Delete case use `commands.ts`; remove the local `pasteCount` and unused imports)
- Modify: `src/canvas/Canvas.tsx` (`elevateNodesOnSelect={false}`)
- Modify: `tests/e2e/assists.spec.ts`

**Interfaces:**
- Consumes: `reorder`, `OrderMove` (Task 8), `GRID` (Task 3), `layoutPrefs` (Task 2).
- Produces, from `src/canvas/commands.ts`:
  - `type XY`
  - `run<R>(boardId, fn: (b: Board) => R): R | undefined`
  - `copySelection(boardId)`, `cutSelection(boardId)`
  - `pasteClipboard(boardId, at?: XY)`, `duplicateSelection(boardId)`
  - `removeSelection(boardId, reconnect?)`
  - `nudgeSelection(boardId, dx, dy)`
  - `arrangeSelection(boardId, fn: (b: Board, ids: string[]) => unknown)`

- [ ] **Step 1: Write the failing browser tests**

Append to `tests/e2e/assists.spec.ts`. Add `titles` to the `./fixtures` import.

```ts
test('Ctrl+X cuts and Ctrl+V pastes back', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await page.keyboard.press('Control+X');
  expect(await titles(page)).toEqual([]);
  await page.keyboard.press('Control+V');
  expect(await titles(page)).toEqual(['A']);
});

test('Ctrl+arrows nudge by a grid step or a pixel, one undo each', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await page.keyboard.press('Control+ArrowRight');
  await page.keyboard.press('Control+Shift+ArrowDown');
  expect(await node0(page, 's1')).toMatchObject({ x: 20, y: 1 });
  expect(await page.evaluate(() => window.__flowstate!.getState().past.length)).toBe(2);
  await page.keyboard.press('Control+Z');
  expect(await node0(page, 's1')).toMatchObject({ x: 20, y: 0 });
});

test('layer shortcuts change which step is drawn on top, even while selected', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 60, y: 20 });
  });
  await open(page, p);
  await resetZoom(page);
  await node(page, 's1').click({ position: { x: 20, y: 10 } });
  const overlap = await centerOf(node(page, 's2'));
  const topAt = () =>
    page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.react-flow__node')?.getAttribute('data-id') ?? null, { x: overlap.x - 60, y: overlap.y });
  expect(await topAt()).toBe('s2');
  await page.keyboard.press('Control+Shift+BracketRight');
  expect((await board(page)).nodes.map((n) => n.id)).toEqual(['s2', 's1']);
  expect(await topAt()).toBe('s1');
  await page.keyboard.press('Control+BracketLeft');
  expect((await board(page)).nodes.map((n) => n.id)).toEqual(['s1', 's2']);
  expect(await topAt()).toBe('s2');
});
```

The probe point `overlap.x - 60` lies inside both A (0 to 180) and B (60 to 240) at 100% zoom, near B's left third. Confirm this before relying on it: B's centre is x 150 in flow space, so the probe sits at flow x 90, which both steps cover.

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test tests/e2e/assists.spec.ts -g "Ctrl\+X|nudge|layer"`

Expected: FAIL. Ctrl+X does nothing, the node does not move, and the order is unchanged.

- [ ] **Step 3: Implement the commands**

Create `src/canvas/commands.ts`:

```ts
import { boundsOf } from '../layout/geometry';
import type { Board } from '../model/types';
import { copySubgraph, pasteSubgraph } from '../ops/clipboard';
import { deleteEdges } from '../ops/edges';
import { deleteSteps, setPositions, withGroupMembers } from '../ops/steps';
import { flowStore } from '../store/store';
import { runSafely } from './safe';

export type XY = { x: number; y: number };

let pasteCount = 0;

export function run<R>(boardId: string, fn: (b: Board) => R): R | undefined {
  return runSafely(() => flowStore.getState().changeBoard(fn, boardId));
}

function boardOf(boardId: string): Board | undefined {
  return flowStore.getState().project.boards.find((b) => b.id === boardId);
}

export function copySelection(boardId: string): void {
  const st = flowStore.getState();
  const b = boardOf(boardId);
  if (!b || !st.selection.length) return;
  st.setClipboard(copySubgraph(b, st.selection));
  pasteCount = 0;
}

export function cutSelection(boardId: string): void {
  const sel = flowStore.getState().selection;
  if (!sel.length) return;
  copySelection(boardId);
  run(boardId, (b) => deleteSteps(b, sel));
  flowStore.getState().select([]);
}

export function pasteClipboard(boardId: string, at?: XY): void {
  const st = flowStore.getState();
  const clip = st.clipboard;
  if (!clip) return;
  const box = at ? boundsOf(clip.nodes) : null;
  let dx: number;
  let dy: number;
  if (at && box) {
    dx = at.x - box.x;
    dy = at.y - box.y;
  } else {
    pasteCount += 1;
    dx = dy = 40 * pasteCount;
  }
  const ids = run(boardId, (b) => pasteSubgraph(b, clip, dx, dy));
  if (ids) st.select(ids);
}

export function duplicateSelection(boardId: string): void {
  const sel = flowStore.getState().selection;
  if (!sel.length) return;
  const ids = run(boardId, (b) => pasteSubgraph(b, copySubgraph(b, sel), 40, 40));
  if (ids) flowStore.getState().select(ids);
}

export function removeSelection(boardId: string, reconnect = false): void {
  const st = flowStore.getState();
  const sel = st.selection;
  const edges = st.edgeSelection;
  if (!sel.length && !edges.length) return;
  run(boardId, (b) => {
    if (sel.length) deleteSteps(b, sel, { reconnect });
    const live = edges.filter((id) => b.edges.some((e) => e.id === id));
    if (live.length) deleteEdges(b, live);
  });
  st.select([]);
}

export function nudgeSelection(boardId: string, dx: number, dy: number): void {
  const sel = flowStore.getState().selection;
  if (!sel.length) return;
  run(boardId, (b) => {
    const picked = new Set(sel);
    const positions: Record<string, XY> = {};
    for (const n of b.nodes) {
      if (picked.has(n.id) && !(n.groupId && picked.has(n.groupId))) positions[n.id] = { x: n.x + dx, y: n.y + dy };
    }
    setPositions(b, withGroupMembers(b, positions));
  });
}

export function arrangeSelection(boardId: string, fn: (b: Board, ids: string[]) => unknown): void {
  const sel = flowStore.getState().selection;
  if (!sel.length) return;
  run(boardId, (b) => fn(b, sel));
}
```

- [ ] **Step 4: Route the keyboard through the commands**

In `src/canvas/useKeyboard.ts`:
- Add these imports:

```ts
import { reorder, type OrderMove } from '../ops/arrange';
import { GRID } from './assist/snap';
import { arrangeSelection, copySelection, cutSelection, duplicateSelection, nudgeSelection, pasteClipboard, removeSelection } from './commands';
```

- Next to `ARROWS`, add:

```ts
const NUDGE: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
```

- Delete `let pasteCount = 0;`.
- Replace the whole `if (e.ctrlKey || e.metaKey) { ... return; }` block with the following. It keeps the Task 2 Quote branch.

```ts
      if (e.ctrlKey || e.metaKey) {
        const arrow = ARROWS[e.key];
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) st.redo();
          else st.undo();
        } else if (key === 'y') {
          e.preventDefault();
          st.redo();
        } else if (key === 'a') {
          e.preventDefault();
          st.select(board.nodes.map((n) => n.id));
        } else if (key === 'c' && sel.length) {
          copySelection(boardId);
        } else if (key === 'x' && sel.length) {
          e.preventDefault();
          cutSelection(boardId);
        } else if (key === 'v' && st.clipboard) {
          e.preventDefault();
          pasteClipboard(boardId);
        } else if (key === 'd' && sel.length) {
          e.preventDefault();
          duplicateSelection(boardId);
        } else if (arrow && sel.length && layoutPrefs.getState().prefs.arrowNudge) {
          e.preventDefault();
          const step = e.shiftKey ? 1 : GRID;
          const [dx, dy] = NUDGE[arrow];
          nudgeSelection(boardId, dx * step, dy * step);
        } else if ((e.code === 'BracketRight' || e.code === 'BracketLeft') && sel.length) {
          e.preventDefault();
          const move: OrderMove = e.code === 'BracketRight' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward';
          arrangeSelection(boardId, (b, ids) => reorder(b, ids, move));
        } else if (e.code === 'Quote') {
          e.preventDefault();
          layoutPrefs.getState().toggle('gridSnap');
          notify(`Snap to grid ${layoutPrefs.getState().prefs.gridSnap ? 'on' : 'off'}`);
        }
        return;
      }
```

- Replace the `case 'Delete': case 'Backspace':` body with:

```ts
          if (!sel.length && !st.edgeSelection.length) return;
          e.preventDefault();
          removeSelection(boardId, e.shiftKey);
          return;
```

- Remove imports that are now unused: `copySubgraph`, `pasteSubgraph`, `deleteEdges`, and `deleteSteps` if nothing else uses it. Let `npm run typecheck` confirm.

In `src/canvas/Canvas.tsx`, add `elevateNodesOnSelect={false}` to `<ReactFlow>`.

- [ ] **Step 5: Run the keyboard suites**

Run: `npm run typecheck && npx playwright test tests/e2e/assists.spec.ts tests/e2e/keyboard.spec.ts tests/e2e/interactions.spec.ts`

Expected: PASS. `keyboard.spec.ts` guards the existing copy, paste, duplicate and delete behaviour.

- [ ] **Step 6: Commit**

```bash
git add src/canvas/commands.ts src/canvas/useKeyboard.ts src/canvas/Canvas.tsx tests/e2e/assists.spec.ts
git commit -m "Add Ctrl+X, Ctrl+arrow nudge and layer shortcuts through shared selection commands"
```

---

### Task 11: Right-click menu, pane menu and edit items

**Files:**
- Create: `src/canvas/menu/ContextMenu.tsx`, `src/canvas/menu/entries.tsx`, `src/canvas/menu/useCanvasMenu.tsx`
- Modify: `src/canvas/Canvas.tsx` (remove `onPaneContextMenu`, render the menu)
- Modify: `src/canvas/canvas.css` (menu rules)
- Modify: `tests/e2e/assists.spec.ts`

**Interfaces:**
- Consumes:
  - From `commands.ts` (Task 10): `copySelection`, `cutSelection`, `pasteClipboard`, `duplicateSelection`, `removeSelection`, `XY`
  - From `layoutPrefs` (Task 2): `LAYOUT_PREFS`, `PREF_LABEL`, `layoutPrefs`
  - From `useKeyboard.ts`: `isTyping`
- Produces:
  - `type MenuEntry`
    - `{ kind: 'item'; label; shortcut?; disabled?; checked?; icon?: ReactNode; run(): void }`
    - `{ kind: 'submenu'; label; disabled?; entries: MenuEntry[] }`
    - `{ kind: 'custom'; id; render(close): ReactNode }`
    - `{ kind: 'sep' }`
  - `type MenuAnchor = XY`
  - `ContextMenu({ at, entries, onClose })`
  - `editEntries(boardId, at): MenuEntry[]`
  - `nodeEntries(boardId, at): MenuEntry[]` (Task 12 adds a `refId` parameter)
  - `paneEntries(boardId, at): MenuEntry[]`
  - `useCanvasMenu(boardId, editable): ReactNode`

- [ ] **Step 1: Write the failing browser tests**

Append to `tests/e2e/assists.spec.ts`:

```ts
const menu = (page: Page) => page.locator('.fs-context-menu');

test('right-click opens the pane menu, right-drag pans without one', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  const spot = { x: pane.x + 30, y: pane.y + 30 };
  const transform = () => page.locator('.react-flow__viewport').getAttribute('style');
  const before = await transform();
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(spot.x + 120, spot.y + 80, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect(menu(page)).toHaveCount(0);
  expect(await transform()).not.toBe(before);
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  await expect(menu(page)).toBeVisible();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Snap to grid' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
});

test('the menu works from the keyboard and toggles a layout switch', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  await page.mouse.click(pane.x + 30, pane.y + 30, { button: 'right' });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(menu(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Layout assists' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Snap to grid' })).toHaveAttribute('aria-checked', 'false');
});

test('right-clicking an unselected step selects it and offers edit actions', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click({ button: 'right' });
  expect(await page.evaluate(() => window.__flowstate!.getState().selection)).toEqual(['s1']);
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  expect(await titles(page)).toEqual(['A', 'A']);
  await node(page, 's1').click();
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menuitem', { name: 'Cut' })).toBeVisible();
});

test('right-clicking inside a title editor keeps the browser menu', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').dblclick();
  const editor = node(page, 's1').locator('[contenteditable="true"], input, textarea').first();
  await expect(editor).toBeVisible();
  await page.evaluate(() => {
    window.addEventListener('contextmenu', (e) => (document.body.dataset.ctxPrevented = String(e.defaultPrevented)), { once: true });
  });
  await editor.click({ button: 'right' });
  await expect(menu(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.body.dataset.ctxPrevented)).toBe('false');
});
```

Check the keyboard walk in the second test:
1. The first actionable item is "Select all", because "Paste here" is disabled with an empty clipboard.
2. ArrowDown moves to "Tidy layout".
3. The next ArrowDown skips the separator and lands on "Snap to grid".
4. Enter toggles it off.

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test tests/e2e/assists.spec.ts -g "menu|right-click"`

Expected: FAIL, because no `.fs-context-menu` appears. The title-editor test may pass already, since today the native menu is only suppressed on the pane. Keep it as the guard for the new capture listener.

- [ ] **Step 3: Implement the menu component**

Create `src/canvas/menu/ContextMenu.tsx`:

```tsx
import { Check, ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type MenuEntry =
  | { kind: 'item'; label: string; shortcut?: string; disabled?: boolean; checked?: boolean; icon?: ReactNode; run: () => void }
  | { kind: 'submenu'; label: string; disabled?: boolean; entries: MenuEntry[] }
  | { kind: 'custom'; id: string; render: (close: () => void) => ReactNode }
  | { kind: 'sep' };

export type MenuAnchor = { x: number; y: number };

type Actionable = Extract<MenuEntry, { kind: 'item' | 'submenu' }>;

function actionable(e: MenuEntry | undefined): e is Actionable {
  return !!e && (e.kind === 'item' || e.kind === 'submenu') && !e.disabled;
}

function MenuList({ entries, close, onBack }: { entries: MenuEntry[]; close: () => void; onBack?: () => void }) {
  const [active, setActive] = useState(() => entries.findIndex(actionable));
  const [open, setOpen] = useState<number | null>(null);
  const [flip, setFlip] = useState({ x: false, y: false });
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setFlip({ x: r.right > window.innerWidth - 4, y: r.bottom > window.innerHeight - 4 });
    ref.current?.focus();
  }, []);

  const move = (dir: 1 | -1) => {
    for (let i = 1; i <= entries.length; i++) {
      const j = (active + dir * i + entries.length) % entries.length;
      if (actionable(entries[j])) return setActive(j);
    }
  };
  const activate = (i: number) => {
    const e = entries[i];
    if (!actionable(e)) return;
    if (e.kind === 'submenu') return setOpen(i);
    close();
    e.run();
  };
  const back = () => {
    setOpen(null);
    ref.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        move(1);
        break;
      case 'ArrowUp':
        move(-1);
        break;
      case 'Enter':
      case ' ':
        activate(active);
        break;
      case 'ArrowRight':
        if (entries[active]?.kind === 'submenu') activate(active);
        break;
      case 'ArrowLeft':
        onBack?.();
        break;
      case 'Escape':
        if (onBack) onBack();
        else close();
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div ref={ref} role="menu" tabIndex={-1} className={`menu-panel fs-menu${flip.x ? ' flip-x' : ''}${flip.y ? ' flip-y' : ''}`} onKeyDown={onKeyDown}>
      {entries.map((e, i) => {
        if (e.kind === 'sep') return <div key={`sep${i}`} className="menu-sep" role="separator" />;
        if (e.kind === 'custom') return <div key={e.id}>{e.render(close)}</div>;
        const isOpen = e.kind === 'submenu' && open === i;
        return (
          <div
            key={e.label}
            className="fs-menu-row"
            onMouseEnter={() => {
              setActive(i);
              setOpen(e.kind === 'submenu' && !e.disabled ? i : null);
              if (e.kind !== 'submenu') ref.current?.focus();
            }}
          >
            <button
              type="button"
              tabIndex={-1}
              role={e.kind === 'item' && e.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={e.kind === 'item' ? e.checked : undefined}
              aria-haspopup={e.kind === 'submenu' ? 'menu' : undefined}
              aria-expanded={e.kind === 'submenu' ? isOpen : undefined}
              disabled={e.disabled}
              className={`menu-item${i === active ? ' is-active' : ''}`}
              onClick={() => activate(i)}
            >
              {e.kind === 'item' && e.checked !== undefined && <Check size={13} className={e.checked ? undefined : 'is-hidden'} />}
              {e.kind === 'item' && e.icon}
              <span>{e.label}</span>
              {e.kind === 'item' && e.shortcut && <span className="menu-shortcut">{e.shortcut}</span>}
              {e.kind === 'submenu' && <ChevronRight size={13} className="menu-shortcut" />}
            </button>
            {isOpen && <MenuList entries={e.entries} close={close} onBack={back} />}
          </div>
        );
      })}
    </div>
  );
}

export function ContextMenu({ at, entries, onClose }: { at: MenuAnchor; entries: MenuEntry[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);

  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: Math.max(4, Math.min(at.x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(at.y, window.innerHeight - r.height - 4)) });
  }, [at]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('wheel', onClose, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('wheel', onClose, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div ref={ref} className="fs-context-menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <MenuList entries={entries} close={onClose} />
    </div>,
    document.body,
  );
}
```

`e.target as Node` matches the existing pattern in `src/ui/Popover.tsx`.

- [ ] **Step 4: Implement the entries and the trigger**

Create `src/canvas/menu/entries.tsx`:

```tsx
import { tidyBoard } from '../../layout/tidyBoard';
import { LAYOUT_PREFS, layoutPrefs, PREF_LABEL } from '../../store/layoutPrefs';
import { flowStore } from '../../store/store';
import { notify } from '../../ui/toast';
import { copySelection, cutSelection, duplicateSelection, pasteClipboard, removeSelection, type XY } from '../commands';
import type { MenuEntry } from './ContextMenu';

export function editEntries(boardId: string, at: XY): MenuEntry[] {
  const clip = flowStore.getState().clipboard;
  return [
    { kind: 'item', label: 'Cut', shortcut: 'Ctrl+X', run: () => cutSelection(boardId) },
    { kind: 'item', label: 'Copy', shortcut: 'Ctrl+C', run: () => copySelection(boardId) },
    { kind: 'item', label: 'Paste', shortcut: 'Ctrl+V', disabled: !clip, run: () => pasteClipboard(boardId, at) },
    { kind: 'item', label: 'Duplicate', shortcut: 'Ctrl+D', run: () => duplicateSelection(boardId) },
    { kind: 'item', label: 'Delete', shortcut: 'Del', run: () => removeSelection(boardId) },
  ];
}

export function nodeEntries(boardId: string, at: XY): MenuEntry[] {
  return editEntries(boardId, at);
}

export function paneEntries(boardId: string, at: XY): MenuEntry[] {
  const st = flowStore.getState();
  const prefs = layoutPrefs.getState().prefs;
  const ids = st.project.boards.find((b) => b.id === boardId)?.nodes.map((n) => n.id) ?? [];
  return [
    { kind: 'item', label: 'Paste here', shortcut: 'Ctrl+V', disabled: !st.clipboard, run: () => pasteClipboard(boardId, at) },
    { kind: 'item', label: 'Select all', shortcut: 'Ctrl+A', disabled: !ids.length, run: () => flowStore.getState().select(ids) },
    {
      kind: 'item',
      label: 'Tidy layout',
      shortcut: 'L',
      run: () => void tidyBoard(flowStore, boardId).catch((err: unknown) => notify(`Tidy failed: ${err instanceof Error ? err.message : String(err)}`)),
    },
    { kind: 'sep' },
    ...LAYOUT_PREFS.map((k): MenuEntry => ({ kind: 'item', label: PREF_LABEL[k], checked: prefs[k], run: () => layoutPrefs.getState().toggle(k) })),
  ];
}
```

Create `src/canvas/menu/useCanvasMenu.tsx`:

```tsx
import { useReactFlow, useStoreApi } from '@xyflow/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { boundsOf } from '../../layout/geometry';
import { flowStore } from '../../store/store';
import { isTyping } from '../useKeyboard';
import { ContextMenu, type MenuAnchor, type MenuEntry } from './ContextMenu';
import { nodeEntries, paneEntries } from './entries';

const CLICK_SLOP = 4;

export function useCanvasMenu(boardId: string, editable: boolean): ReactNode {
  const rf = useReactFlow();
  const rfStore = useStoreApi();
  const [menu, setMenu] = useState<{ at: MenuAnchor; entries: MenuEntry[] } | null>(null);
  const close = useCallback(() => setMenu(null), []);

  useEffect(() => setMenu(null), [boardId]);

  useEffect(() => {
    if (!editable) return;
    let down: MenuAnchor | null = null;
    const inCanvas = (t: EventTarget | null): t is Element => t instanceof Element && !!rfStore.getState().domNode?.contains(t);
    // Our menu opens on pointerup so a right-drag can still pan; the native menu would fire first on macOS.
    const onContextMenu = (e: MouseEvent) => {
      if (inCanvas(e.target) && !isTyping(e.target)) e.preventDefault();
    };
    const onDown = (e: PointerEvent) => {
      down = e.button === 2 && inCanvas(e.target) && !isTyping(e.target) ? { x: e.clientX, y: e.clientY } : null;
    };
    const onUp = (e: PointerEvent) => {
      const start = down;
      down = null;
      if (e.button !== 2 || !start || !inCanvas(e.target)) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) >= CLICK_SLOP) return;
      if (e.target.closest('.react-flow__edge, .react-flow__minimap, .react-flow__controls')) return;
      const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = e.target.closest('.react-flow__node')?.getAttribute('data-id');
      const st = flowStore.getState();
      if (id && !id.startsWith('lane:')) {
        if (!st.selection.includes(id)) st.select([id]);
        setMenu({ at: { x: e.clientX, y: e.clientY }, entries: nodeEntries(boardId, at) });
      } else {
        setMenu({ at: { x: e.clientX, y: e.clientY }, entries: paneEntries(boardId, at) });
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
      const st = flowStore.getState();
      if (isTyping(e.target) || st.activeBoardId !== boardId || !st.selection.length) return;
      const b = st.project.boards.find((x) => x.id === boardId);
      const box = b && boundsOf(b.nodes.filter((n) => st.selection.includes(n.id)));
      if (!box) return;
      e.preventDefault();
      const corner = { x: box.x, y: box.y + box.h };
      setMenu({ at: rf.flowToScreenPosition(corner), entries: nodeEntries(boardId, corner) });
    };
    document.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [boardId, editable, rf, rfStore]);

  return menu ? <ContextMenu at={menu.at} entries={menu.entries} onClose={close} /> : null;
}
```

If TypeScript does not narrow `e.target` through the `inCanvas` type guard inside `onUp`, bind it first (`const target = e.target; if (!inCanvas(target)) return;`) and use `target` below. Do not cast.

In `src/canvas/Canvas.tsx`:
- Import `useCanvasMenu` from `'./menu/useCanvasMenu'`.
- Add `const menu = useCanvasMenu(boardId, editable);` after `useKeyboard(boardId, editable);`.
- Delete the `onPaneContextMenu={(e) => e.preventDefault()}` prop.
- Add `{menu}` as a child of `<ReactFlow>`.

Append to `src/canvas/canvas.css`:

```css
.fs-context-menu {
  position: fixed;
  z-index: 50;
}
.fs-menu {
  position: relative;
  top: 0;
  right: auto;
  min-width: 220px;
  max-height: none;
  overflow: visible;
  outline: none;
}
.fs-menu-row {
  position: relative;
}
.fs-menu-row > .fs-menu {
  position: absolute;
  top: -6px;
  left: calc(100% + 4px);
}
.fs-menu-row > .fs-menu.flip-x {
  left: auto;
  right: calc(100% + 4px);
}
.fs-menu-row > .fs-menu.flip-y {
  top: auto;
  bottom: -6px;
}
.menu-item.is-active:not(:disabled) {
  background: var(--surface-2);
}
.menu-item:disabled {
  opacity: 0.45;
  cursor: default;
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run typecheck && npx playwright test tests/e2e/assists.spec.ts tests/e2e/canvas.spec.ts tests/e2e/perf.spec.ts`

Expected: PASS. The perf suite guards that right-button panning still works, since the existing pan test uses the middle button and the new menu listens on the right.

- [ ] **Step 6: Commit**

```bash
git add src/canvas/menu src/canvas/Canvas.tsx src/canvas/canvas.css tests/e2e/assists.spec.ts
git commit -m "Add a right-click menu that leaves right-drag panning intact"
```

---

### Task 12: Align, distribute, match size, arrange and colour in the menu

**Files:**
- Modify: `src/canvas/menu/entries.tsx` (`nodeEntries` gains `refId` and the layout submenus)
- Modify: `src/canvas/menu/useCanvasMenu.tsx` (pass `refId`)
- Modify: `tests/e2e/assists.spec.ts`

**Interfaces:**
- Consumes:
  - `alignNodes`, `distributeNodes`, `matchSize`, `reorder`, `ALIGN_EDGES`, `AlignEdge` (Task 8)
  - `run`, `arrangeSelection` (Task 10)
  - `TINTS` (Task 9), `ColorInput` (Task 9)
  - `updateSteps` (existing)
- Produces: `nodeEntries(boardId: string, refId: string, at: XY): MenuEntry[]`

- [ ] **Step 1: Write the failing browser tests**

Append to `tests/e2e/assists.spec.ts`:

```ts
test('align and distribute from the menu, one undo step each', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 250, y: 90 });
    addStep(b, { title: 'C', x: 600, y: 30 });
  });
  await open(page, p);
  await resetZoom(page);
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+A');
  await node(page, 's1').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Align', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Top', exact: true }).click();
  expect((await board(page)).nodes.map((n) => n.y)).toEqual([0, 0, 0]);
  await node(page, 's1').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Distribute', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Horizontally', exact: true }).click();
  expect((await board(page)).nodes.map((n) => n.x)).toEqual([0, 300, 600]);
  expect(await page.evaluate(() => window.__flowstate!.getState().past.length)).toBe(2);
});

test('match size copies the right-clicked step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'D', shape: 'decision', x: 300, y: 0 });
  });
  await open(page, p);
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+A');
  await node(page, 's1').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Match size', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Both', exact: true }).click();
  expect(await node0(page, 's2')).toMatchObject({ w: 180, h: 72 });
});

test('colour and layer order from the menu', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 60, y: 20 });
  });
  await open(page, p);
  await resetZoom(page);
  await node(page, 's1').click({ button: 'right', position: { x: 20, y: 10 } });
  await page.getByRole('menuitem', { name: 'Colour', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Green', exact: true }).click();
  expect((await node0(page, 's1')).color).toBe('green');
  await expect(node(page, 's1')).toHaveClass(/tint-green/);
  await node(page, 's1').click({ button: 'right', position: { x: 20, y: 10 } });
  await page.getByRole('menuitem', { name: 'Colour', exact: true }).hover();
  await page.getByLabel('Custom colour').fill('#123456');
  expect((await node0(page, 's1')).color).toBe('#123456');
  await expect(node(page, 's1')).toHaveClass(/ink-light/);
  await node(page, 's1').click({ button: 'right', position: { x: 20, y: 10 } });
  await page.getByRole('menuitem', { name: 'Arrange', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Bring to front', exact: true }).click();
  expect((await board(page)).nodes.map((n) => n.id)).toEqual(['s2', 's1']);
});
```

Check the distribute case: after aligning top, the x values are 0, 250, 600, so the span is 0 to 780 and each gap is 120. B lands at `180 + 120 = 300`.

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test tests/e2e/assists.spec.ts -g "align and distribute|match size|colour and layer"`

Expected: FAIL. There is no "Align" menu item.

- [ ] **Step 3: Implement**

In `src/canvas/menu/entries.tsx`:
- Add these imports:

```tsx
import { ALIGN_EDGES, alignNodes, distributeNodes, matchSize, reorder, type AlignEdge, type DistributeAxis, type MatchDims, type OrderMove } from '../../ops/arrange';
import { TINTS } from '../../model/color';
import type { Board } from '../../model/types';
import { updateSteps } from '../../ops/steps';
import { ColorInput } from '../../ui/controls';
import { arrangeSelection, run } from '../commands';
```

  Merge `arrangeSelection` and `run` into the existing `../commands` import rather than duplicating it.

- Replace `nodeEntries` with:

```tsx
const ALIGN_LABEL: Record<AlignEdge, string> = { left: 'Left', center: 'Center', right: 'Right', top: 'Top', middle: 'Middle', bottom: 'Bottom' };
const DISTRIBUTE: Array<[string, DistributeAxis]> = [
  ['Horizontally', 'horizontal'],
  ['Vertically', 'vertical'],
];
const MATCH: Array<[string, MatchDims]> = [
  ['Width', 'width'],
  ['Height', 'height'],
  ['Both', 'both'],
];
const ORDER: Array<[string, OrderMove, string]> = [
  ['Bring to front', 'front', 'Ctrl+Shift+]'],
  ['Bring forward', 'forward', 'Ctrl+]'],
  ['Send backward', 'backward', 'Ctrl+['],
  ['Send to back', 'back', 'Ctrl+Shift+['],
];

function colourEntries(boardId: string, steps: string[], current: string | null): MenuEntry[] {
  const paint = (color: string | null) => run(boardId, (b) => updateSteps(b, steps.map((id) => ({ id, color }))));
  return [
    { kind: 'item', label: 'Default', icon: <span className="fs-swatch swatch-none" />, run: () => paint(null) },
    ...TINTS.map((t): MenuEntry => ({ kind: 'item', label: t[0].toUpperCase() + t.slice(1), icon: <span className={`fs-swatch swatch-${t}`} />, run: () => paint(t) })),
    {
      kind: 'custom',
      id: 'custom-colour',
      render: (close) => (
        <ColorInput
          label="Custom colour"
          value={current}
          className="menu-item fs-color-input"
          onPick={(hex) => {
            paint(hex);
            close();
          }}
        >
          Custom…
        </ColorInput>
      ),
    },
  ];
}

export function nodeEntries(boardId: string, refId: string, at: XY): MenuEntry[] {
  const st = flowStore.getState();
  const board = st.project.boards.find((b) => b.id === boardId);
  const sel = st.selection;
  const kindOf = (id: string) => board?.nodes.find((n) => n.id === id)?.kind;
  const steps = sel.filter((id) => kindOf(id) === 'step');
  const onSel = (fn: (b: Board, ids: string[]) => unknown) => () => arrangeSelection(boardId, fn);
  const item = (label: string, action: () => void, shortcut?: string): MenuEntry => ({ kind: 'item', label, run: action, shortcut });
  const current = board?.nodes.find((n) => n.id === refId)?.color ?? null;
  return [
    ...editEntries(boardId, at),
    { kind: 'sep' },
    { kind: 'submenu', label: 'Align', disabled: sel.length < 2, entries: ALIGN_EDGES.map((edge) => item(ALIGN_LABEL[edge], onSel((b, ids) => alignNodes(b, ids, edge)))) },
    { kind: 'submenu', label: 'Distribute', disabled: sel.length < 3, entries: DISTRIBUTE.map(([label, axis]) => item(label, onSel((b, ids) => distributeNodes(b, ids, axis)))) },
    { kind: 'submenu', label: 'Match size', disabled: sel.length < 2, entries: MATCH.map(([label, dims]) => item(label, onSel((b, ids) => matchSize(b, ids, refId, dims)))) },
    { kind: 'submenu', label: 'Arrange', entries: ORDER.map(([label, move, keys]) => item(label, onSel((b, ids) => reorder(b, ids, move)), keys)) },
    { kind: 'submenu', label: 'Colour', disabled: !steps.length, entries: colourEntries(boardId, steps, current) },
  ];
}
```

In `src/canvas/menu/useCanvasMenu.tsx`:
- Change `nodeEntries(boardId, at)` to `nodeEntries(boardId, id, at)` in `onUp`.
- Change it to `nodeEntries(boardId, st.selection[0], corner)` in `onKey`.

- [ ] **Step 4: Run the tests**

Run: `npm run typecheck && npx playwright test tests/e2e/assists.spec.ts`

Expected: PASS.

If the custom-colour row closes before `fill` lands, the outside-pointerdown handler is firing on the colour input. It is inside the menu, so `ref.current.contains` must be true. Check that the custom row renders inside `MenuList`.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/menu tests/e2e/assists.spec.ts
git commit -m "Add align, distribute, match size, arrange and colour to the right-click menu"
```

---

### Task 13: AI parity for alignment, order and colour

**Files:**
- Modify: `src/ai/schemas.ts` (add `ARRANGE_ACTIONS`, the `arrange` tool, and `color` on `update_steps`)
- Modify: `src/ai/toolDefs.ts` (description)
- Modify: `src/ai/executor.ts` (handler)
- Modify: `src/ai/stats.ts` (`arranged`)
- Modify: `src/ai/systemPrompt.ts` (two lines)
- Modify: `src/ai/executor.test.ts`

**Interfaces:**
- Consumes: `alignNodes`, `distributeNodes`, `matchSize`, `reorder` and their types (Task 8), plus `isColor` validation through `updateSteps` (Task 9).
- Produces:
  - Tool `arrange` with input `{ board?, ids: string[], action: ArrangeAction, reference?: string }`
  - `update_steps` accepts `color: string | null`
  - `StatKey` gains `'arranged'`

- [ ] **Step 1: Write the failing tests**

Append inside `describe('executeTool', ...)` in `src/ai/executor.test.ts`:

```ts
  it('aligns and distributes steps through arrange', async () => {
    const { run, active } = setup((b) => {
      addStep(b, { title: 'A', x: 0, y: 0 });
      addStep(b, { title: 'B', x: 250, y: 90 });
      addStep(b, { title: 'C', x: 600, y: 30 });
    });
    const top = await run('arrange', { ids: ['s1', 's2', 's3'], action: 'align_top' });
    expect(top.ok).toBe(true);
    expect(top.stats).toEqual({ arranged: 3 });
    expect(active().nodes.map((n) => n.y)).toEqual([0, 0, 0]);
    await run('arrange', { ids: ['s1', 's2', 's3'], action: 'distribute_horizontal' });
    expect(active().nodes.map((n) => n.x)).toEqual([0, 300, 600]);
    await run('arrange', { ids: ['s1'], action: 'bring_to_front' });
    expect(active().nodes.map((n) => n.id)).toEqual(['s2', 's3', 's1']);
  });

  it('needs a reference for match actions and reports it', async () => {
    const { run, active } = setup((b) => {
      addStep(b, { title: 'A', x: 0, y: 0 });
      addStep(b, { title: 'D', shape: 'decision', x: 300, y: 0 });
    });
    const missing = await run('arrange', { ids: ['s1', 's2'], action: 'match_size' });
    expect(missing.ok).toBe(false);
    expect(missing.content).toMatch(/reference/);
    const ok = await run('arrange', { ids: ['s2'], action: 'match_size', reference: 's1' });
    expect(ok.ok).toBe(true);
    expect(active().nodes[1]).toMatchObject({ w: 180, h: 72 });
  });

  it('colours steps and rejects unknown colours', async () => {
    const { run, active } = setup((b) => {
      addStep(b, { title: 'A', x: 0, y: 0 });
    });
    expect((await run('update_steps', { updates: [{ id: 's1', color: 'green' }] })).ok).toBe(true);
    expect(active().nodes[0].color).toBe('green');
    const bad = await run('update_steps', { updates: [{ id: 's1', color: 'red' }] });
    expect(bad.ok).toBe(false);
    expect(bad.content).toMatch(/Unknown colour/);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ai/executor.test.ts`

Expected: FAIL with `Unknown tool "arrange"`, and `update_steps` rejecting `color` as an unrecognised key. If zod strips unknown keys silently instead, the colour assertion fails.

- [ ] **Step 3: Implement**

In `src/ai/schemas.ts`:
- Near the top, add:

```ts
export const ARRANGE_ACTIONS = [
  'align_left',
  'align_center',
  'align_right',
  'align_top',
  'align_middle',
  'align_bottom',
  'distribute_horizontal',
  'distribute_vertical',
  'match_width',
  'match_height',
  'match_size',
  'bring_to_front',
  'bring_forward',
  'send_backward',
  'send_to_back',
] as const;
export type ArrangeAction = (typeof ARRANGE_ACTIONS)[number];
```

- In the `update_steps` update object, add after `replaces`:

```ts
          color: z.string().nullable().optional().describe('blue, green, amber, rose, violet, slate, a #rrggbb value, or null for the default.'),
```

- Add to `TOOL_SCHEMAS`, after `tidy`:

```ts
  arrange: z.object({
    board,
    ids: z.array(id).min(1),
    action: z.enum(ARRANGE_ACTIONS),
    reference: z.string().optional().describe('For match_width, match_height and match_size: the step whose size to copy.'),
  }),
```

In `src/ai/toolDefs.ts`, add to `DESCRIPTIONS`:

```ts
  arrange:
    'Line up, space out, resize or layer existing steps without changing arrows. align_* lines them up on an edge or centre (2 or more), distribute_* makes the gaps equal (3 or more), match_* copies the size of "reference", and bring_*/send_* change which overlapping step is drawn on top.',
```

In `src/ai/stats.ts`:
- Add `| 'arranged'` to `StatKey`.
- Add `['arranged', (n) => \`${n} arranged\`],` to `PHRASES`, right after the `'moved'` entry.

In `src/ai/executor.ts`:
- Add these imports:

```ts
import { alignNodes, distributeNodes, matchSize, reorder, type AlignEdge, type DistributeAxis, type MatchDims, type OrderMove } from '../ops/arrange';
import type { ArrangeAction } from './schemas';
```

  Merge `ArrangeAction` into the existing `./schemas` import.

- Above `const handlers`, add:

```ts
const ALIGN: Partial<Record<ArrangeAction, AlignEdge>> = {
  align_left: 'left',
  align_center: 'center',
  align_right: 'right',
  align_top: 'top',
  align_middle: 'middle',
  align_bottom: 'bottom',
};
const DISTRIBUTE: Partial<Record<ArrangeAction, DistributeAxis>> = { distribute_horizontal: 'horizontal', distribute_vertical: 'vertical' };
const MATCH: Partial<Record<ArrangeAction, MatchDims>> = { match_width: 'width', match_height: 'height', match_size: 'both' };
const ORDER: Partial<Record<ArrangeAction, OrderMove>> = {
  bring_to_front: 'front',
  bring_forward: 'forward',
  send_backward: 'backward',
  send_to_back: 'back',
};

function applyArrange(b: Board, ids: string[], action: ArrangeAction, reference: string | undefined): string[] {
  const edge = ALIGN[action];
  if (edge) return alignNodes(b, ids, edge);
  const axis = DISTRIBUTE[action];
  if (axis) return distributeNodes(b, ids, axis);
  const dims = MATCH[action];
  if (dims) {
    if (!reference) throw new OpError(`${action} needs "reference": the step whose size to copy.`);
    return matchSize(b, ids, reference, dims);
  }
  const move = ORDER[action];
  if (move) return reorder(b, ids, move);
  throw new OpError(`Unknown arrange action "${action}".`);
}
```

- Add the handler to `handlers`, after `tidy`:

```ts
  arrange: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const ids = applyArrange(b, input.ids, input.action, input.reference);
      return { result: { arranged: ids }, touched: ids, stats: { arranged: ids.length } };
    }),
```

`update_steps` already spreads `...rest` into `StepUpdate`, so `color` flows to `updateSteps`. `cleanFields` validates it (Task 9) and throws `OpError`, which `executeTool` turns into a failed outcome.

In `src/ai/systemPrompt.ts`, add two lines directly after the "Never supply coordinates" line:

```
- To line up, evenly space, match the size of, or layer specific steps, use arrange. Use tidy only to re-lay out a whole board.
- Colour steps with update_steps color: blue, green, amber, rose, violet, slate, a #rrggbb value, or null to clear it.
```

- [ ] **Step 4: Run the AI tests**

Run: `npx vitest run src/ai && npm run typecheck`

Expected: PASS. If `toolDefs.test.ts` or `stats.test.ts` pins the full tool list or phrase list, add `arrange` or `arranged` to those expectations.

- [ ] **Step 5: Commit**

```bash
git add src/ai
git commit -m "Let the assistant align, distribute, match size, layer and colour steps"
```

---

### Task 14: ADRs, docs and full verification

**Files:**
- Create: `docs/adr/0008-right-click-menu-on-pointerup.md`, `docs/adr/0009-layout-prefs-per-user.md`, `docs/adr/0010-honest-layer-order.md`
- Modify: `docs/adr/README.md` (index rows)
- Modify: `README.md` (shortcut or feature list, only where one exists)
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Write the ADRs**

Follow the format of `docs/adr/0005-undo-ignored-during-open-transactions.md`: title line, `Status: Accepted (2026-09-26)`, then Context, Decision (with Rejected), and Consequences. Keep each short.

**`0008-right-click-menu-on-pointerup.md`, "Right-click menu opens on pointerup and yields to right-drag panning"**
- **Context:** right-drag already pans (`panOnDrag={[1, 2]}`). The browser's `contextmenu` event fires on mousedown on macOS, before any movement is known.
- **Decision:**
  - Capture-phase `preventDefault` on `contextmenu` inside the canvas, except in text editors.
  - Open our menu on a right-button pointerup that moved less than 4px.
  - Shift+F10 and the ContextMenu key open it at the selection.
- **Rejected:**
  - An off-the-shelf menu (Radix) that opens on `contextmenu`: it breaks right-drag panning on macOS and adds a dependency.
  - Moving pan off the right button: it changes existing muscle memory.
- **Consequences:** a slow right-click with a 4px wobble pans instead of opening the menu.

**`0009-layout-prefs-per-user.md`, "Layout assist switches are per-user browser prefs, not project data"**
- **Decision:** the five switches live in localStorage under `flowstate.layoutPrefs`, not in the project file.
- **Why:** they express how one person likes to edit, and project files will later be shared (ADR 0002, ADR 0004). Blocked storage falls back to defaults.
- **Consequences:** prefs do not follow the user across browsers, and team sharing will not sync them.

**`0010-honest-layer-order.md`, "Layer order is the board's node order and selection does not raise nodes"**
- **Decision:**
  - z-order is the order of `board.nodes`, so older files need no migration.
  - `elevateNodesOnSelect={false}`, because React Flow's default raises selected nodes and made Send to back look like a no-op until you deselected.
- **Consequences:**
  - The floating toolbar is a `NodeToolbar` portal and stays on top.
  - A selected node's resize handles can be hidden under an overlapping node, as in PowerPoint.
  - Groups stay behind steps and lanes behind everything.

Add the three rows to the index table in `docs/adr/README.md`.

- [ ] **Step 2: Update the living docs**

- **`README.md`:** if it has a keyboard or feature list (`grep -n "Ctrl\|Shortcut\|Keyboard" README.md`), add:
  - Ctrl+X
  - Ctrl+arrow nudge
  - Ctrl+] / Ctrl+[ layering
  - Ctrl+' grid snap
  - Ctrl+drag copy
  - Shift and Alt while dragging
  - The right-click menu

  If there is no such list, add nothing.
- **`PROJECT_STATUS.md`:**
  - Move "layout assists" into Complete, with a one-line summary.
  - Add "Playtest layout assists (snap distance, guide visibility, Windows Alt behaviour)" to In flight.
  - Add a Timeline row for 2026-09-26.

- [ ] **Step 3: Full verification**

Run each and read the output:

```bash
npm run typecheck
npm test
npm run build
npx playwright test
```

Expected: all PASS, except the live API test, which is skipped unless `LIVE_API` is set.

Then do a runtime smoke test in the real app:
1. Run `npm run dev`, after freeing ports 5173 and 8797.
2. Open the app.
3. Drag with guides.
4. Ctrl+drag a copy.
5. Right-click to align three steps.
6. Set a custom colour.
7. Ask the assistant to "line up the first three steps along the top" (only if the user approves spending API credit; otherwise skip and say so).

- [ ] **Step 4: Commit**

```bash
git add docs/adr README.md PROJECT_STATUS.md
git commit -m "docs: ADRs 0008-0010 and status for layout assists"
```
