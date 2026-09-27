# Arrow Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user move where an arrow attaches, mark an arrow "Don't merge" so it gets its own line, and reshape arrows by hand, without making shared lines rare or the canvas slower.

**Architecture:**
- **Pure routing** lives in `src/layout/route/`: `ports.ts` (sides, attach points, constants), `elbow.ts` (a line-for-line port of React Flow's smooth-step points), `path.ts` (rounded SVG path and label point), `through.ts` (right-angled route through bends), `apart.ts` ("Don't merge"), `around.ts` (search around boxes).
- **Board operations** on arrows live in `src/ops/arrowPath.ts`. `ops` may import `layout`, never `canvas`.
- **The canvas** turns the board into routes in `src/canvas/arrowRoutes.ts` (cached per arrow, keyed on the arrow and its two boxes), `FlowEdge` only draws them, and `ArrowHandles.tsx` plus `useArrowDrag.ts` own the handles and their drags. `Canvas.tsx` only gets wiring.

**Tech Stack:** React 19, TypeScript 7, @xyflow/react 12.12 (@xyflow/system 0.0.83), zustand 5, immer 11, zod 4, vitest 5, Playwright 1.63.

**Spec:** docs/superpowers/specs/2026-09-27-arrow-routing-design.md

## Global Constraints

- **Comments:** only for a non-obvious why, at most 3 lines, never restating the code, never duplicating an ADR (point at it instead: `// why: ADR-0014`).
- **Punctuation:** no em dashes anywhere, in code, comments, commit messages or docs.
- **Commits:** present tense subject, no `Co-Authored-By` or any other trailer lines. Stage by path, never `git add -A`.
- **Undo:** every user action is exactly one undo step. Drags use the store's `begin()`/`commit()` transaction; everything else is a single `changeBoard` call.
- **Reference view:** the read-only view (`editable: false`) shows no handles and has no editing.
- **Dependencies:** none new. Any install would be prefixed with `sfw`.
- **Type checker:** never add casts or ignores to quiet it; remove dead imports (`tsconfig.json` has `noUnusedLocals` and `noUnusedParameters`, so an unused test helper is a type error too).
- **APIs:** verify React Flow APIs against `node_modules/@xyflow/react` and `node_modules/@xyflow/system` sources, not memory. `getSmoothStepPath` and its `getPoints` and `getBend` helpers are in `node_modules/@xyflow/system/dist/esm/index.js` (`handleDirections` at line 1223, `getPoints` at 1240, `getBend` at 1363, `getSmoothStepPath` at 1411).
- **Schema:** `SCHEMA_VERSION` is `2`. The migration from 1 adds `separate: false, bends: []` to every edge.
- **Routing constants** (in `src/layout/route/`):

  | Name | Value | Meaning |
  |---|---|---|
  | `CORNER_RADIUS` | 14 | Corner rounding, as today |
  | `STUB` | 22 | Straight piece out of each side, as today |
  | `PORT_OUTSET` | 5.5 | An arrow starts 5.5px outside the box edge, where React Flow anchors it today |
  | `SHIFT_STEP` | 10 | "Don't merge" sideways step |
  | `SHIFT_TRIES` | 5 | Steps before a line stays where it is |
  | `AROUND_PAD` | 16 | Padding around boxes for "Route around boxes" |
  | `AROUND_LIMIT_MS` | 50 | Search time limit |
  | `TURN_COST` | 40 | Search penalty per turn |
  | `AROUND_MARGIN` | 400 | How far past the two ends the search may wander |
  | `GRID` | 20 | Existing grid, from `src/canvas/assist/snap.ts` |
  | `HANDLE` | 8 | Handle size in screen px, grown by `max(1 / zoom, 1)` like the box resize handles |

- **Performance budget:** the p95 drag frame on the 200 steps, 200 arrows, 20 separate arrows board may be at most baseline + 2ms; opening the 200-arrow board may take at most baseline × 1.10. Baselines are measured in Task 0, on this machine, before any product change.
- **Playwright on this machine:**
  - The machine is short on memory: run Playwright with `--workers=2` at most, one suite at a time while iterating.
  - Playwright uses ports 5174/8788 (`playwright.config.ts`). Never kill other dev servers.
  - Never set `LIVE_API`.
  - If a worker crashes with 0xC0000409, rerun once.
- **Commands:**
  - Typecheck: `npm run typecheck`
  - Unit tests: `npx vitest run <file>`
  - Browser tests: `npx playwright test <file> --workers=2`
  - Budget: PowerShell `$env:PERF_BUDGET='1'; npx playwright test tests/e2e/perf.spec.ts -g "routing budget" --workers=1; Remove-Item Env:PERF_BUDGET`, or Bash `PERF_BUDGET=1 npx playwright test tests/e2e/perf.spec.ts -g "routing budget" --workers=1`

## Review Focus

1. **Two connected steps pushed together by something other than a drag** (the assistant's `insert_between` or `branch_parallel` shifting a downstream chain through `shiftDownstream`, which moves boxes without `setPositions`): the hand-shaped arrow between them must move with them and keep its shape. Pinned in Task 5 by the unit test "carries the bends of an arrow whose two ends are both pushed" in `src/layout/place.test.ts`.
2. **A segment dragged until it lines up with a neighbouring segment**, so the segment and the bar under the pointer vanish mid-drag: the drag must keep following the pointer and end as one undo step with no transaction left open. Pinned in Task 8 by "a segment dragged onto its neighbour line keeps dragging and ends as one undo step" in `tests/e2e/arrows.spec.ts`.
3. **The arrow deleted (Delete key) while one of its handles is being dragged:** the drag must end, no transaction may stay open, and one Ctrl+Z must bring the arrow back as it was. Pinned in Task 8 by "deleting the arrow in the middle of a bend drag closes the drag, and one undo brings it back".
4. **Editing arrows while zoomed out to 48%:** handles must stay at least 8 screen pixels wide and a segment must move by the pointer distance converted to board units. Pinned in Task 8 by "zoomed out, handles stay grabbable and a segment moves by the pointer distance in board units".
5. **Route around boxes on a large, dense board (200 boxes):** it must find a route inside the 50ms limit instead of wrongly saying none exists. Pinned in Task 14 by the unit test "routes across a 200-box board inside the time limit" in `src/layout/route/around.test.ts`.

## File Map

| File | Responsibility |
|---|---|
| `src/model/types.ts`, `src/model/migrate.ts` | `XY`, the two new edge fields, schema v2 and its migration |
| `src/layout/route/ports.ts` (new) | Sides, attach points, stub ends, routing constants |
| `src/layout/route/elbow.ts` (new) | Automatic route between two sides (port of React Flow's `getPoints`) |
| `src/layout/route/path.ts` (new) | Rounded SVG path from corner points, label point halfway along |
| `src/layout/route/through.ts` (new) | Right-angled route through bends, collinear cleanup, segment moves |
| `src/layout/route/apart.ts` (new) | "Don't merge": spread attach points, sideways line shift |
| `src/layout/route/around.ts` (new) | Time-limited orthogonal search around boxes |
| `src/layout/place.ts` | `shiftDownstream` carries bends |
| `src/ops/arrowPath.ts` (new) | Reattach, bends, reset, "Don't merge", add and remove bend, route around, bends following boxes |
| `src/ops/edges.ts` | New edge fields; `connect` rules shared with reattach |
| `src/ops/steps.ts`, `clipboard.ts`, `board.ts` | Bends move with boxes, paste offset, Tidy clears |
| `src/canvas/arrowRoutes.ts` (new) | Board-to-route bridge with caching |
| `src/canvas/toFlow.ts`, `FlowEdge.tsx`, `Canvas.tsx` | Route in edge data, drawing, wiring |
| `src/canvas/ArrowHandles.tsx`, `useArrowDrag.ts` (new) | Handles and drags as single undo steps |
| `src/canvas/EdgeToolbar.tsx` | "Reset path" button |
| `src/canvas/menu/entries.tsx`, `useCanvasMenu.tsx` | Arrow right-click menu |
| `src/ai/schemas.ts`, `toolDefs.ts`, `executor.ts`, `stats.ts`, `systemPrompt.ts`, `src/analysis/summary.ts` | `update_arrows`, summary markers, prompt line |
| `tests/e2e/arrows.spec.ts` (new), `tests/e2e/perf.spec.ts` | Browser tests and the budget |
| `docs/adr/0014`, `0015` (new) | Decisions |

---

### Task 0: Performance baselines

**Files:**
- Modify: `tests/e2e/perf.spec.ts` (imports at lines 1-3; append after line 76)

**Interfaces:**
- Consumes: `seed`, `open`, `board` from `tests/e2e/fixtures.ts`; `addStep` from `src/ops/steps.ts`; `connect` from `src/ops/edges.ts`; the existing `p95(times: number[]): number` in `perf.spec.ts`.
- Produces (in `tests/e2e/perf.spec.ts`, used by Tasks 1, 6, 13 and 19):
  - `const BASELINE: { dragP95Ms: number; openMs: number }`
  - `const ENFORCE_BUDGET: boolean` (true when `PERF_BUDGET` is set)
  - `function routingBoard(b: Board): void` (10 rows of 20 chained steps plus one skip arrow per row: 200 steps, 200 arrows)
  - tests `drags a step on a 200-arrow board within the routing budget` and `opens a 200-arrow board within the routing budget`

This task changes no product code. It measures the current drawing so later tasks can be held to the budget. Each test measures three runs and uses their median, which is how noise is handled everywhere in this plan.

- [ ] **Step 1: Add the two scenarios**

In `tests/e2e/perf.spec.ts`, change the imports at the top to:

```ts
import { expect, test, type Page } from '@playwright/test';
import type { Board } from '../../src/model/types';
import { connect } from '../../src/ops/edges';
import { addStep } from '../../src/ops/steps';
import { board, open, seed } from './fixtures';
```

Append to the end of the file:

```ts
// Medians measured on the last commit before arrow routing (spec section 4, ADR-0015).
const BASELINE = { dragP95Ms: 33.4, openMs: 478 };
const ENFORCE_BUDGET = !!process.env.PERF_BUDGET;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function routingBoard(b: Board): void {
  for (let row = 0; row < 10; row++) {
    const ids = [addStep(b, { title: `R${row} C0`, x: 0, y: row * 200 })];
    for (let col = 1; col < 20; col++) ids.push(addStep(b, { title: `R${row} C${col}`, after: ids[col - 1] }));
    connect(b, { source: ids[5], target: ids[7] });
  }
}

async function recordFrames(page: Page, action: () => Promise<void>): Promise<number[]> {
  const state = await page.evaluateHandle(() => {
    const s = { times: [] as number[], on: true };
    let last = performance.now();
    const tick = (now: number) => {
      s.times.push(now - last);
      last = now;
      if (s.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return s;
  });
  await action();
  return page.evaluate((s) => {
    s.on = false;
    return s.times;
  }, state);
}

test('drags a step on a 200-arrow board within the routing budget', async ({ page, request }) => {
  test.setTimeout(120_000);
  const p = await seed(request, routingBoard, 'Perf routing');
  await open(page, p);
  const id = (await board(page)).nodes.find((n) => n.title === 'R0 C5')!.id;
  const runs: number[] = [];
  for (let run = 0; run < 3; run++) {
    const c = (await page.getByTestId(`node-${id}`).boundingBox())!;
    const dir = run % 2 ? -1 : 1;
    const times = await recordFrames(page, async () => {
      await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 60; i++) await page.mouse.move(c.x + c.width / 2 + dir * i * 2, c.y + c.height / 2 + dir * i);
      await page.mouse.up();
    });
    runs.push(p95(times));
  }
  const worst = median(runs);
  console.log(`routing drag p95 per run ${runs.map((r) => r.toFixed(1)).join(', ')}ms, median ${worst.toFixed(1)}ms`);
  if (ENFORCE_BUDGET) expect(worst).toBeLessThanOrEqual(BASELINE.dragP95Ms + 2);
});

test('opens a 200-arrow board within the routing budget', async ({ page, request }) => {
  test.setTimeout(120_000);
  const p = await seed(request, routingBoard, 'Perf open');
  const runs: number[] = [];
  for (let run = 0; run < 4; run++) {
    await page.goto(`/?project=${p.id}`);
    await page.locator('.react-flow__edge-path').first().waitFor({ state: 'attached' });
    const at = await page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame(() => resolve(performance.now()))));
    if (run > 0) runs.push(at);
  }
  const typical = median(runs);
  console.log(`routing open per run ${runs.map((r) => r.toFixed(0)).join(', ')}ms, median ${typical.toFixed(0)}ms`);
  if (ENFORCE_BUDGET) expect(typical).toBeLessThanOrEqual(BASELINE.openMs * 1.1);
});
```

Notes for the implementer:
- The first page load is a warm-up and is not counted, because Vite compiles modules on first request.
- `waitFor({ state: 'attached' })` is deliberate: Playwright calls a perfectly horizontal SVG path hidden (zero height).
- The board opens fitted to view, so every arrow is rendered during the drag. That is the worst case, on purpose.

- [ ] **Step 2: Run the scenarios three times on the current code**

Run this three times, one after another:

```bash
npx playwright test tests/e2e/perf.spec.ts -g "routing budget" --workers=1
```

Expected: both tests PASS every time (nothing is enforced yet). Each run prints two lines like:

```
routing drag p95 per run 33.4, 33.4, 33.4ms, median 33.4ms
routing open per run 491, 482, 522ms, median 491ms
```

On the machine this plan was written on, the drag p95 was 33.4ms in all nine drags (frames land on the 60Hz grid, so a p95 is either about 16.7, 33.4 or 50ms), and the open medians were 491, 477 and 478ms.

- [ ] **Step 3: Record the baselines**

Set `BASELINE.dragP95Ms` to the median of the three printed drag medians, and `BASELINE.openMs` to the median of the three printed open medians. If they match the values already in the file, leave them.

The drag number sits on the frame grid, so the 2ms margin means "never drop to a slower frame cadence". That is the intended reading. The open number moves by a few percent between runs; the median of three stays well inside the 10% margin.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/perf.spec.ts
git commit -m "Measure drag and open baselines for a 200-arrow board"
```

In the commit body, list the three drag medians and the three open medians you measured, so the noise is on record.

---

### Task 1: Schema v2 and a single XY type

**Files:**
- Modify: `src/model/types.ts:1` (`SCHEMA_VERSION`), `:19` (add `XY` before `Flag`), `:47-56` (`BoardEdge`)
- Modify: `src/model/migrate.ts:6-7` (`MIGRATIONS`), `:32-41` (`Edge` schema)
- Modify: `src/ops/edges.ts:28-38` (`connect` pushes the new fields)
- Modify: `src/canvas/assist/useDragAssist.ts:4,12`, `src/canvas/commands.ts:2,9`, `src/ops/arrange.ts:3,14`, `src/canvas/menu/entries.tsx:3,10` (use the one `XY`)
- Modify: `src/layout/place.test.ts:13`, `tests/e2e/keyboard.spec.ts:74` (hand-built edges), `src/model/factory.test.ts:8`
- Modify: `tests/e2e/perf.spec.ts` (`routingBoard` marks 20 arrows separate)
- Test: `src/model/migrate.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `export interface XY { x: number; y: number }` in `src/model/types.ts`. It is the only `XY` in the codebase after this task.
  - `BoardEdge.separate: boolean`, `BoardEdge.bends: XY[]`
  - `SCHEMA_VERSION = 2`

`XY` was defined three times (`useDragAssist.ts`, `commands.ts`, `arrange.ts`). None of them lives in `src/layout/geometry.ts` or `place.ts`, and `BoardEdge` now needs a point type, so the model owns it and the three copies import it.

- [ ] **Step 1: Write the failing tests**

In `src/model/migrate.test.ts`, add these three tests inside `describe('migrateProject', ...)`, just before `it('describes the first problem readably', ...)`:

```ts
  it('upgrades a version 1 file so every arrow shares lines and has no bends', () => {
    const raw = JSON.parse(JSON.stringify(fullProject()));
    raw.schemaVersion = 1;
    for (const e of raw.boards[0].edges) {
      delete e.separate;
      delete e.bends;
    }
    const out = migrateProject(raw);
    expect(out.schemaVersion).toBe(2);
    expect(out.boards[0].edges.map((e) => [e.separate, e.bends])).toEqual([[false, []]]);
  });

  it('refuses a version 1 file with a malformed arrow instead of crashing', () => {
    const raw = JSON.parse(JSON.stringify(fullProject()));
    raw.schemaVersion = 1;
    raw.boards[0].edges[0] = 'e1';
    expect(() => migrateProject(raw)).toThrow(/boards\[0\]\.edges\[0\]/);
  });

  it('rejects a bend that is not a point', () => {
    const raw = JSON.parse(JSON.stringify(fullProject()));
    raw.boards[0].edges[0].bends = [{ x: '1', y: 2 }];
    expect(() => migrateProject(raw)).toThrow(/boards\[0\]\.edges\[0\]\.bends\[0\]\.x/);
  });
```

`JSON.parse` returns `any`, which is why these tests need no casts to build broken files.

In `src/model/factory.test.ts` line 8, change `expect(p.schemaVersion).toBe(1);` to `expect(p.schemaVersion).toBe(2);`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/model`
Expected: FAIL.
- "upgrades a version 1 file": `expected 1 to be 2`.
- "rejects a bend that is not a point": the old schema strips `bends`, so nothing throws.
- factory: `expected 1 to be 2`.
- "refuses a version 1 file with a malformed arrow" may already pass (the old schema rejects the string); it guards the migration against crashing on it.

- [ ] **Step 3: Add the type and fields**

In `src/model/types.ts`:
- Change line 1 to `export const SCHEMA_VERSION = 2;`
- Insert before `export interface Flag {`:

```ts
export interface XY {
  x: number;
  y: number;
}

```

- In `BoardEdge`, after `flags: Flag[];`, add:

```ts
  separate: boolean;
  bends: XY[];
```

- [ ] **Step 4: Add the migration and schema**

In `src/model/migrate.ts`, replace:

```ts
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Record<number, Migration> = {};
```

with:

```ts
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function mapEdges(raw: Record<string, unknown>, fn: (edge: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(raw.boards)) return raw;
  const boards = raw.boards.map((b: unknown) => (isRecord(b) && Array.isArray(b.edges) ? { ...b, edges: b.edges.map((e: unknown) => (isRecord(e) ? fn(e) : e)) } : b));
  return { ...raw, boards };
}

const MIGRATIONS: Record<number, Migration> = {
  1: (raw) => mapEdges(raw, (e) => ({ ...e, separate: false, bends: [] })),
};
```

The migration never throws on malformed input. It leaves anything it does not understand in place, and the schema check that follows reports it with a path.

In the `Edge` schema, after `flags: z.array(Flag),` add:

```ts
  separate: z.boolean(),
  bends: z.array(z.object({ x: z.number(), y: z.number() })),
```

- [ ] **Step 5: Create edges with the new fields**

In `src/ops/edges.ts`, inside `connect`, change the pushed object's tail from:

```ts
    label: (args.label ?? '').trim(),
    flags: [],
  });
```

to:

```ts
    label: (args.label ?? '').trim(),
    flags: [],
    separate: false,
    bends: [],
  });
```

`pasteSubgraph` spreads the copied edge, so it already carries both fields.

- [ ] **Step 6: Point the three XY copies at the model**

- `src/canvas/assist/useDragAssist.ts`: change `import type { Board } from '../../model/types';` to `import type { Board, XY } from '../../model/types';` and delete the line `export type XY = { x: number; y: number };`.
- `src/canvas/commands.ts`: change `import type { Board } from '../model/types';` to `import type { Board, XY } from '../model/types';` and delete `export type XY = { x: number; y: number };` and the blank line after it.
- `src/ops/arrange.ts`: change `import type { Board, BoardNode } from '../model/types';` to `import type { Board, BoardNode, XY } from '../model/types';` and delete `type XY = { x: number; y: number };` and the blank line after it.
- `src/canvas/menu/entries.tsx`: change `import type { Board } from '../../model/types';` to `import type { Board, XY } from '../../model/types';`, and in the `../commands` import remove `, type XY`.

Then confirm there is one definition left:

Run: `git grep -n "type XY\|interface XY" src`
Expected: exactly one line, `src/model/types.ts: export interface XY {`.

- [ ] **Step 7: Fix the two hand-built edges and mark separate arrows in the perf board**

- `src/layout/place.test.ts` line 13 and `tests/e2e/keyboard.spec.ts` line 74: in each `b.edges.push({ ... })`, change the ending `label: '', flags: [] });` to `label: '', flags: [], separate: false, bends: [] });`.
- `tests/e2e/perf.spec.ts`, in `routingBoard`, replace:

```ts
    connect(b, { source: ids[5], target: ids[7] });
```

with:

```ts
    const skip = connect(b, { source: ids[5], target: ids[7] });
    for (const e of b.edges) if (e.id === skip || (e.source === ids[5] && e.target === ids[6])) e.separate = true;
```

That marks 20 arrows separate (two per row, both on the right side of `C5`), which is the budget's data shape. They have no effect on drawing until Task 13.

- [ ] **Step 8: Run the tests and the typecheck**

Run: `npx vitest run src/model src/ops src/layout`
Expected: all PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/model/types.ts src/model/migrate.ts src/model/migrate.test.ts src/model/factory.test.ts src/ops/edges.ts src/ops/arrange.ts src/canvas/assist/useDragAssist.ts src/canvas/commands.ts src/canvas/menu/entries.tsx src/layout/place.test.ts tests/e2e/keyboard.spec.ts tests/e2e/perf.spec.ts
git commit -m "Add separate and bends to arrows with a schema 2 migration"
```

Body: the migration adds `separate: false, bends: []` to every arrow; `XY` now has one home in the model.

---

### Task 2: Automatic route, ported from React Flow

**Files:**
- Create: `src/layout/route/ports.ts`, `src/layout/route/elbow.ts`, `src/layout/route/path.ts`
- Test: `src/layout/route/elbow.test.ts`, `src/layout/route/path.test.ts`

**Interfaces:**
- Consumes: `Side`, `Direction`, `BoardEdge`, `XY` from `src/model/types.ts`; `Rect` from `src/layout/geometry.ts`.
- Produces:
  - `ports.ts`: `STUB = 22`, `CORNER_RADIUS = 14`, `PORT_OUTSET = 5.5`, `type Axis = 'x' | 'y'`, `SIDE_DIR: Record<Side, XY>`, `sideAxis(side: Side): Axis`, `autoSides(direction: Direction): { source: Side; target: Side }`, `edgeSides(direction: Direction, edge: Pick<BoardEdge, 'sourceSide' | 'targetSide'>): { source: Side; target: Side }`, `portAt(box: Rect, side: Side, t?: number): XY`, `stubEnd(port: XY, side: Side, length?: number): XY`
  - `elbow.ts`: `elbow(source: XY, sourceSide: Side, target: XY, targetSide: Side, offset?: number): XY[]`
  - `path.ts`: `roundedPath(points: XY[], radius?: number): string`, `halfway(points: XY[]): XY`

`elbow` returns the same points React Flow's `getPoints` does, including its repeated and collinear points, so that `roundedPath(elbow(...), 14)` is character for character the path `getSmoothStepPath` draws today. Read `getPoints` and `getBend` in `node_modules/@xyflow/system/dist/esm/index.js` (lines 1240 and 1363) before you start; the port below follows them line by line. Two details matter for exact equality:
- the centre uses `a + (b - a) * 0.5` on the main axis and `(a + b) / 2` on the other, exactly as React Flow does;
- distances use `Math.sqrt(Math.pow(...))`, not `Math.hypot`, which rounds differently.

`PORT_OUTSET` is 5.5 because React Flow anchors an arrow at the outer edge of the side dot: `.fs-handle` is 9px wide plus a 1.5px border that Chrome renders as 1px at device pixel ratio 1, giving an 11px dot centred on the box edge. Task 4 checks this against the real dot in the browser.

- [ ] **Step 1: Write the failing tests**

Create `src/layout/route/elbow.test.ts`:

```ts
import { getSmoothStepPath, Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { SIDES, type Side } from '../../model/types';
import { elbow } from './elbow';
import { roundedPath } from './path';

const POSITION: Record<Side, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };
const SOURCE = { x: 100, y: 100 };
const TARGETS = [
  { x: 400, y: 220 },
  { x: -200, y: -20 },
  { x: 140, y: 400 },
  { x: 60, y: -200 },
  { x: 400, y: 105 },
  { x: 110, y: 110 },
  { x: 100, y: 300 },
  { x: 300, y: 100 },
  { x: 100.5, y: 100.25 },
];

describe('elbow', () => {
  for (const s of SIDES) {
    for (const t of SIDES) {
      it(`draws ${s} to ${t} exactly as getSmoothStepPath`, () => {
        for (const target of TARGETS) {
          const [expected] = getSmoothStepPath({
            sourceX: SOURCE.x,
            sourceY: SOURCE.y,
            sourcePosition: POSITION[s],
            targetX: target.x,
            targetY: target.y,
            targetPosition: POSITION[t],
            borderRadius: 14,
            offset: 22,
          });
          expect(roundedPath(elbow(SOURCE, s, target, t), 14), `to ${target.x},${target.y}`).toBe(expected);
        }
      });
    }
  }
});
```

The targets cover all four quadrants, near-aligned ends, ends closer than the 22px stub (React Flow's gap offset branch), and fractional coordinates.

Create `src/layout/route/path.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { halfway, roundedPath } from './path';

describe('roundedPath', () => {
  it('draws a straight line with no corners', () => {
    expect(roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe('M0 0L100 0');
  });

  it('rounds a corner by the radius, or by half the shorter leg', () => {
    expect(roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 14)).toBe('M0 0L 86,0Q 100,0 100,14L100 100');
    expect(roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 100 }], 14)).toBe('M0 0L 5,0Q 10,0 10,5L10 100');
  });
});

describe('halfway', () => {
  it('finds the point at half the length, not the middle corner', () => {
    expect(halfway([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 300 }])).toEqual({ x: 100, y: 100 });
  });

  it('handles a single point and zero-length pieces', () => {
    expect(halfway([{ x: 5, y: 5 }])).toEqual({ x: 5, y: 5 });
    expect(halfway([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 40, y: 0 }])).toEqual({ x: 20, y: 0 });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/layout/route`
Expected: FAIL. Vitest cannot resolve `./elbow` and `./path` because they do not exist yet.

- [ ] **Step 3: Write `ports.ts`**

Create `src/layout/route/ports.ts`:

```ts
import type { BoardEdge, Direction, Side, XY } from '../../model/types';
import type { Rect } from '../geometry';

export const STUB = 22;
export const CORNER_RADIUS = 14;
// why: React Flow anchors an arrow at the outer edge of the side dot (9px plus a 1px rendered border, centred on the box edge).
export const PORT_OUTSET = 5.5;

export type Axis = 'x' | 'y';

export const SIDE_DIR: Record<Side, XY> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

export function sideAxis(side: Side): Axis {
  return side === 'left' || side === 'right' ? 'x' : 'y';
}

export function autoSides(direction: Direction): { source: Side; target: Side } {
  return direction === 'LR' ? { source: 'right', target: 'left' } : { source: 'bottom', target: 'top' };
}

export function edgeSides(direction: Direction, edge: Pick<BoardEdge, 'sourceSide' | 'targetSide'>): { source: Side; target: Side } {
  const auto = autoSides(direction);
  return { source: edge.sourceSide ?? auto.source, target: edge.targetSide ?? auto.target };
}

export function portAt(box: Rect, side: Side, t = 0.5): XY {
  const d = SIDE_DIR[side];
  if (sideAxis(side) === 'y') return { x: box.x + box.w * t, y: (side === 'top' ? box.y : box.y + box.h) + d.y * PORT_OUTSET };
  return { x: (side === 'left' ? box.x : box.x + box.w) + d.x * PORT_OUTSET, y: box.y + box.h * t };
}

export function stubEnd(port: XY, side: Side, length = STUB): XY {
  const d = SIDE_DIR[side];
  return { x: port.x + d.x * length, y: port.y + d.y * length };
}
```

`t` is the position along the side, 0 to 1. Everything except "Don't merge" uses the midpoint.

- [ ] **Step 4: Write `elbow.ts`**

Create `src/layout/route/elbow.ts`:

```ts
import type { Side, XY } from '../../model/types';
import { SIDE_DIR, sideAxis, STUB } from './ports';

// why: a line-for-line port of getPoints in @xyflow/system dist/esm/index.js, so automatic arrows draw as before (ADR-0014).
function heading(source: XY, sourceSide: Side, target: XY): XY {
  if (sideAxis(sourceSide) === 'x') return source.x < target.x ? { x: 1, y: 0 } : { x: -1, y: 0 };
  return source.y < target.y ? { x: 0, y: 1 } : { x: 0, y: -1 };
}

export function elbow(source: XY, sourceSide: Side, target: XY, targetSide: Side, offset = STUB): XY[] {
  const sd = SIDE_DIR[sourceSide];
  const td = SIDE_DIR[targetSide];
  const sGap = { x: source.x + sd.x * offset, y: source.y + sd.y * offset };
  const tGap = { x: target.x + td.x * offset, y: target.y + td.y * offset };
  const dir = heading(sGap, sourceSide, tGap);
  const axis = dir.x !== 0 ? 'x' : 'y';
  const current = dir[axis];
  const sShift = { x: 0, y: 0 };
  const tShift = { x: 0, y: 0 };
  let points: XY[];
  if (sd[axis] * td[axis] === -1) {
    const cx = axis === 'x' ? sGap.x + (tGap.x - sGap.x) * 0.5 : (sGap.x + tGap.x) / 2;
    const cy = axis === 'x' ? (sGap.y + tGap.y) / 2 : sGap.y + (tGap.y - sGap.y) * 0.5;
    const vertical = [{ x: cx, y: sGap.y }, { x: cx, y: tGap.y }];
    const horizontal = [{ x: sGap.x, y: cy }, { x: tGap.x, y: cy }];
    if (sd[axis] === current) points = axis === 'x' ? vertical : horizontal;
    else points = axis === 'x' ? horizontal : vertical;
  } else {
    const sourceTarget = [{ x: sGap.x, y: tGap.y }];
    const targetSource = [{ x: tGap.x, y: sGap.y }];
    if (axis === 'x') points = sd.x === current ? targetSource : sourceTarget;
    else points = sd.y === current ? sourceTarget : targetSource;
    if (sourceSide === targetSide) {
      const diff = Math.abs(source[axis] - target[axis]);
      if (diff <= offset) {
        const gap = Math.min(offset - 1, offset - diff);
        if (sd[axis] === current) sShift[axis] = (sGap[axis] > source[axis] ? -1 : 1) * gap;
        else tShift[axis] = (tGap[axis] > target[axis] ? -1 : 1) * gap;
      }
    } else {
      const other = axis === 'x' ? 'y' : 'x';
      const sameDir = sd[axis] === td[other];
      const above = sGap[other] > tGap[other];
      const below = sGap[other] < tGap[other];
      const flip = (sd[axis] === 1 && ((!sameDir && above) || (sameDir && below))) || (sd[axis] !== 1 && ((!sameDir && below) || (sameDir && above)));
      if (flip) points = axis === 'x' ? sourceTarget : targetSource;
    }
  }
  const gs = { x: sGap.x + sShift.x, y: sGap.y + sShift.y };
  const gt = { x: tGap.x + tShift.x, y: tGap.y + tShift.y };
  const first = points[0];
  const last = points[points.length - 1];
  return [source, ...(gs.x !== first.x || gs.y !== first.y ? [gs] : []), ...points, ...(gt.x !== last.x || gt.y !== last.y ? [gt] : []), target];
}
```

ADR-0014 is written in Task 19; the pointer is correct from the start.

- [ ] **Step 5: Write `path.ts`**

Create `src/layout/route/path.ts`:

```ts
import type { XY } from '../../model/types';
import { CORNER_RADIUS } from './ports';

// why: Math.sqrt of Math.pow, not Math.hypot, to round exactly as getSmoothStepPath does.
const distance = (a: XY, b: XY) => Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));

function corner(a: XY, b: XY, c: XY, size: number): string {
  const r = Math.min(distance(a, b) / 2, distance(b, c) / 2, size);
  const { x, y } = b;
  if ((a.x === x && x === c.x) || (a.y === y && y === c.y)) return `L${x} ${y}`;
  if (a.y === y) {
    const xDir = a.x < c.x ? -1 : 1;
    const yDir = a.y < c.y ? 1 : -1;
    return `L ${x + r * xDir},${y}Q ${x},${y} ${x},${y + r * yDir}`;
  }
  const xDir = a.x < c.x ? 1 : -1;
  const yDir = a.y < c.y ? -1 : 1;
  return `L ${x},${y + r * yDir}Q ${x},${y} ${x + r * xDir},${y}`;
}

export function roundedPath(points: XY[], radius = CORNER_RADIUS): string {
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) d += corner(points[i - 1], points[i], points[i + 1], radius);
  const end = points[points.length - 1];
  return `${d}L${end.x} ${end.y}`;
}

export function halfway(points: XY[]): XY {
  const lengths = points.slice(1).map((p, i) => distance(points[i], p));
  let left = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] > 0 && left <= lengths[i]) {
      const t = left / lengths[i];
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
    }
    left -= lengths[i];
  }
  return points[0];
}
```

`halfway` measures the corner polyline, not the rounded curve. The difference is under a pixel per corner and keeps the label stable while dragging.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/layout/route`
Expected: PASS, 20 tests (16 side pairs, 4 path tests).

If a side pair fails, compare your `elbow` with `getPoints` in `node_modules/@xyflow/system/dist/esm/index.js` line by line. Do not loosen the test to `toBeCloseTo`: exact equality is what proves existing boards look the same.

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/layout/route/ports.ts src/layout/route/elbow.ts src/layout/route/path.ts src/layout/route/elbow.test.ts src/layout/route/path.test.ts
git commit -m "Port React Flow's smooth-step points into a routing module"
```

---

### Task 3: Routes through bends

**Files:**
- Create: `src/layout/route/through.ts`
- Test: `src/layout/route/through.test.ts`

**Interfaces:**
- Consumes: `stubEnd`, `sideAxis`, `type Axis` from `src/layout/route/ports.ts`; `elbow` (test only).
- Produces (in `through.ts`):
  - `simplify(points: XY[]): XY[]` (drops repeated points and collinear middle points, keeps both ends)
  - `through(source: XY, sourceSide: Side, bends: XY[], target: XY, targetSide: Side): XY[]` (simplified corner points, ports included)
  - `innerSegments(points: XY[]): number[]` (indices `i` of segments `points[i]..points[i + 1]` between the two end stubs)
  - `segmentAxis(a: XY, b: XY): Axis` (the axis a segment runs along)
  - `moveSegment(points: XY[], index: number, to: number): XY[]` (sets the across coordinate of both ends of segment `index`)

How `through` connects two points that are not aligned: it leaves the current point at a right angle to the way it arrived, so each bend is a real corner. The first leg arrives along the source side's axis (the stub). The last leg ends with the target's stub. A consequence the tests pin: rebuilding an automatic route from its own corners gives back the same route, which is what lets a first segment drag turn an automatic arrow into bends without it jumping.

- [ ] **Step 1: Write the failing tests**

Create `src/layout/route/through.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SIDES, type XY } from '../../model/types';
import { elbow } from './elbow';
import { innerSegments, moveSegment, simplify, through } from './through';

const rightAngled = (points: XY[]) => points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y);

describe('simplify', () => {
  it('drops repeated and collinear points but keeps both ends', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 50 }, { x: 30, y: 80 }];
    expect(simplify(pts)).toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 80 }]);
  });

  it('drops a point where the line doubles back on itself', () => {
    expect(simplify([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }])).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }]);
  });
});

describe('through', () => {
  const s = { x: 0, y: 0 };
  const t = { x: 400, y: 200 };

  it('passes through every bend at right angles', () => {
    const bends = [{ x: 100, y: -60 }, { x: 250, y: 300 }];
    const route = through(s, 'right', bends, t, 'left');
    expect(rightAngled(route)).toBe(true);
    for (const b of bends) expect(route).toContainEqual(b);
    expect(route[0]).toEqual(s);
    expect(route[route.length - 1]).toEqual(t);
  });

  it('leaves the box along its side and enters the target along its side', () => {
    const route = through(s, 'bottom', [{ x: 200, y: 100 }], t, 'top');
    expect(route[1].x).toBe(0);
    expect(route[1].y).toBeGreaterThan(0);
    expect(route[route.length - 2].x).toBe(400);
    expect(route[route.length - 2].y).toBeLessThan(200);
  });

  it('keeps the bends when one end moves and re-routes only the end piece', () => {
    const bends = [{ x: 200, y: 0 }, { x: 200, y: 200 }];
    const moved = through(s, 'right', bends, { x: 400, y: 260 }, 'left');
    expect(moved.slice(0, 3)).toEqual([s, ...bends]);
    expect(rightAngled(moved)).toBe(true);
  });

  it('rebuilds an automatic route unchanged from its own corners', () => {
    const targets = [{ x: 400, y: 220 }, { x: -200, y: -20 }, { x: 140, y: 400 }, { x: 60, y: -200 }, { x: 300, y: 100 }, { x: 400, y: 5 }, { x: 10, y: 10 }];
    for (const a of SIDES) {
      for (const b of SIDES) {
        for (const target of targets) {
          const auto = simplify(elbow(s, a, target, b));
          expect(through(s, a, auto.slice(1, -1), target, b), `${a} to ${b} at ${target.x},${target.y}`).toEqual(auto);
        }
      }
    }
  });
});

describe('segments', () => {
  const route = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 150, y: 100 }, { x: 150, y: 200 }, { x: 200, y: 200 }];

  it('lists only the segments between the two end stubs', () => {
    expect(innerSegments(route)).toEqual([1, 2, 3]);
    expect(innerSegments([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 60 }])).toEqual([]);
  });

  it('slides a segment sideways and keeps its neighbours at right angles', () => {
    const moved = moveSegment(route, 2, 140);
    expect(moved[2]).toEqual({ x: 50, y: 140 });
    expect(moved[3]).toEqual({ x: 150, y: 140 });
    expect(rightAngled(moved)).toBe(true);
    expect(moveSegment(route, 1, 80).slice(1, 3)).toEqual([{ x: 80, y: 0 }, { x: 80, y: 100 }]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/layout/route/through.test.ts`
Expected: FAIL, because `./through` does not exist yet.

- [ ] **Step 3: Write `through.ts`**

Create `src/layout/route/through.ts`:

```ts
import type { Side, XY } from '../../model/types';
import { sideAxis, stubEnd, type Axis } from './ports';

const same = (a: XY, b: XY) => a.x === b.x && a.y === b.y;
const inLine = (a: XY, b: XY, c: XY) => (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);

export function simplify(points: XY[]): XY[] {
  const out: XY[] = [];
  for (const p of points) {
    if (out.length && same(out[out.length - 1], p)) continue;
    if (out.length >= 2 && inLine(out[out.length - 2], out[out.length - 1], p)) out.pop();
    out.push(p);
  }
  return out;
}

export function through(source: XY, sourceSide: Side, bends: XY[], target: XY, targetSide: Side): XY[] {
  const out: XY[] = [source, stubEnd(source, sourceSide)];
  let axis: Axis = sideAxis(sourceSide);
  for (const p of [...bends, stubEnd(target, targetSide)]) {
    const last = out[out.length - 1];
    if (last.x !== p.x && last.y !== p.y) out.push(axis === 'x' ? { x: last.x, y: p.y } : { x: p.x, y: last.y });
    else if (last.x === p.x && last.y !== p.y) axis = 'y';
    else if (last.y === p.y && last.x !== p.x) axis = 'x';
    out.push(p);
  }
  out.push(target);
  return simplify(out);
}

export function innerSegments(points: XY[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length - 2; i++) out.push(i);
  return out;
}

export function segmentAxis(a: XY, b: XY): Axis {
  return a.y === b.y ? 'x' : 'y';
}

export function moveSegment(points: XY[], index: number, to: number): XY[] {
  const horizontal = segmentAxis(points[index], points[index + 1]) === 'x';
  return points.map((p, i) => (i !== index && i !== index + 1 ? p : horizontal ? { x: p.x, y: to } : { x: to, y: p.y }));
}
```

`axis` is the axis of the leg that arrived at `last`. When `last` and `p` are not aligned, the corner is placed so the route leaves `last` across that axis and reaches `p` along it, which keeps every bend a right angle.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/layout/route`
Expected: PASS (28 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/layout/route/through.ts src/layout/route/through.test.ts
git commit -m "Route arrows through bends at right angles"
```

---

### Task 4: Draw arrows from board routes

**Files:**
- Create: `src/canvas/arrowRoutes.ts`, `tests/e2e/arrows.spec.ts`
- Modify: `src/canvas/toFlow.ts:1-3` (imports), `:7` (`EdgeViewData`), `:40-42` (delete `autoSides`), `:97-116` (`toFlowEdges`)
- Modify: `src/canvas/FlowEdge.tsx` (whole file)
- Modify: `src/canvas/Canvas.tsx:23` (import), `:104` (route cache), `:129` (routes feed edges)
- Test: `src/canvas/arrowRoutes.test.ts`, `src/canvas/toFlow.test.ts`

**Interfaces:**
- Consumes: `elbow`, `through`, `roundedPath`, `halfway`, `edgeSides`, `portAt`, `autoSides` from Tasks 2 and 3.
- Produces:
  - `src/canvas/arrowRoutes.ts`: `export interface Route { points: XY[]; label: XY }`, `export type RouteCache = Map<string, { deps: unknown[]; route: Route }>`, `export function arrowRoutes(board: Board, cache: RouteCache): Map<string, Route>`
  - `src/canvas/toFlow.ts`: `EdgeViewData` gains `route: Route | undefined`; `toFlowEdges(board: Board, view: FlowView, cache: RenderCache<FlowEdgeType>, routes: ReadonlyMap<string, Route>): FlowEdgeType[]`
  - `tests/e2e/arrows.spec.ts` helpers used by later tasks: `boxOf(locator)`, `centerOf(locator)`, `resetZoom(page)`, `pathOf(page, edgeId)`, `toScreen(page, edgeId, p: XY): Promise<XY>`, `pathStart(page, edgeId)`, `BENDS`, `shapedPair(label?)`

How it fits together:
- `arrowRoutes` runs in `Canvas` once per board change, in a `useMemo` next to the existing edge cache. Each arrow's route is cached on `[edge, source node, target node, direction]`. Immer keeps unchanged objects identical, so during a drag only arrows attached to moved boxes are re-routed, and `toFlowEdges` reuses every other edge object.
- React Flow still receives `sourceHandle` and `targetHandle`, so it still decides whether an edge renders at all (for example it skips arrows to a text box, which has no dots). `FlowEdge` ignores React Flow's `sourceX`/`sourceY` and draws `data.route`.
- Automatic arrows draw the raw `elbow` points, so their path strings stay identical to today.

- [ ] **Step 1: Write the failing unit tests**

Create `src/canvas/arrowRoutes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard } from '../model/factory';
import { connect } from '../ops/edges';
import { runOp } from '../ops/run';
import { addStep, setPositions } from '../ops/steps';
import { arrowRoutes, type RouteCache } from './arrowRoutes';

function row() {
  const b = createBoard('B');
  const a = addStep(b, { title: 'A', x: 0, y: 0 });
  const c = addStep(b, { title: 'C', x: 400, y: 0 });
  const d = addStep(b, { title: 'D', x: 400, y: 300 });
  const ac = connect(b, { source: a, target: c });
  const cd = connect(b, { source: c, target: d, sourceSide: 'bottom', targetSide: 'top' });
  return { b, a, c, d, ac, cd };
}

describe('arrowRoutes', () => {
  it('starts and ends each arrow at the outer edge of its side dots', () => {
    const { b, ac, cd } = row();
    const routes = arrowRoutes(b, new Map());
    const first = routes.get(ac)!.points;
    expect(first[0]).toEqual({ x: 185.5, y: 36 });
    expect(first[first.length - 1]).toEqual({ x: 394.5, y: 36 });
    expect(routes.get(cd)!.points[0]).toEqual({ x: 490, y: 77.5 });
  });

  it('puts the label halfway along the path', () => {
    const { b, ac } = row();
    expect(arrowRoutes(b, new Map()).get(ac)!.label).toEqual({ x: 290, y: 36 });
  });

  it('draws a hand-shaped arrow through its bends', () => {
    const { b, ac } = row();
    b.edges[0].bends = [{ x: 300, y: -60 }];
    expect(arrowRoutes(b, new Map()).get(ac)!.points).toContainEqual({ x: 300, y: -60 });
  });

  it('re-routes only the arrows attached to a moved box', () => {
    const { b, a, ac, cd } = row();
    const cache: RouteCache = new Map();
    const before = arrowRoutes(b, cache);
    const next = runOp(b, (d) => setPositions(d, { [a]: { x: 0, y: 40 } })).board;
    const after = arrowRoutes(next, cache);
    expect(after.get(cd)).toBe(before.get(cd));
    expect(after.get(ac)).not.toBe(before.get(ac));
  });

  it('skips an arrow whose box is missing', () => {
    const { b, ac } = row();
    b.nodes = b.nodes.filter((n) => n.title !== 'A');
    expect(arrowRoutes(b, new Map()).has(ac)).toBe(false);
  });
});
```

In `src/canvas/toFlow.test.ts`:
- Add `import { arrowRoutes } from './arrowRoutes';` above the `./toFlow` import.
- In the existing `describe('toFlowEdges', ...)` test, replace every `toFlowEdges(b, view(), cache)` with `toFlowEdges(b, view(), cache, arrowRoutes(b, new Map()))` (three places).
- Add this test inside `describe('toFlowEdges', ...)`:

```ts
  it('carries each route and rebuilds the edge when its route changes', () => {
    const { b } = chain(['A', 'B']);
    const cache: RenderCache<FlowEdgeType> = new Map();
    const routes = arrowRoutes(b, new Map());
    const first = toFlowEdges(b, view(), cache, routes)[0];
    expect(first.data!.route).toBe(routes.get(b.edges[0].id));
    expect(toFlowEdges(b, view(), cache, routes)[0]).toBe(first);
    expect(toFlowEdges(b, view(), cache, arrowRoutes(b, new Map()))[0]).not.toBe(first);
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/canvas`
Expected: FAIL, because `./arrowRoutes` does not exist yet.

- [ ] **Step 3: Write `arrowRoutes.ts`**

Create `src/canvas/arrowRoutes.ts`:

```ts
import { elbow } from '../layout/route/elbow';
import { halfway } from '../layout/route/path';
import { edgeSides, portAt } from '../layout/route/ports';
import { through } from '../layout/route/through';
import type { Board, BoardEdge, BoardNode, Direction, XY } from '../model/types';

export interface Route {
  points: XY[];
  label: XY;
}

export type RouteCache = Map<string, { deps: unknown[]; route: Route }>;

type Link = { e: BoardEdge; s: BoardNode; t: BoardNode };

const MIDDLE = { source: 0.5, target: 0.5 };

function draw({ e, s, t }: Link, direction: Direction, at: { source: number; target: number }): Route {
  const sides = edgeSides(direction, e);
  const from = portAt(s, sides.source, at.source);
  const to = portAt(t, sides.target, at.target);
  const points = e.bends.length ? through(from, sides.source, e.bends, to, sides.target) : elbow(from, sides.source, to, sides.target);
  return { points, label: halfway(points) };
}

function remember(cache: RouteCache, key: string, deps: unknown[], make: () => Route): Route {
  const hit = cache.get(key);
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit.route;
  const route = make();
  cache.set(key, { deps, route });
  return route;
}

function linksOf(board: Board): Link[] {
  const nodes = new Map(board.nodes.map((n) => [n.id, n]));
  const links: Link[] = [];
  for (const e of board.edges) {
    const s = nodes.get(e.source);
    const t = nodes.get(e.target);
    if (s && t) links.push({ e, s, t });
  }
  return links;
}

export function arrowRoutes(board: Board, cache: RouteCache): Map<string, Route> {
  const out = new Map<string, Route>();
  for (const link of linksOf(board)) {
    out.set(link.e.id, remember(cache, link.e.id, [link.e, link.s, link.t, board.direction], () => draw(link, board.direction, MIDDLE)));
  }
  return out;
}
```

`draw` already takes the attach position along each side (`at`) because Task 13 spreads separate arrows; until then it is always the midpoint.

- [ ] **Step 4: Put the route in the edge data**

In `src/canvas/toFlow.ts`:
- Replace lines 2-3:

```ts
import { axes, boundsOf, laneBands } from '../layout/place';
import type { Board, BoardEdge, BoardNode, Direction, Lane, Side } from '../model/types';
```

with:

```ts
import { axes, boundsOf, laneBands } from '../layout/place';
import { autoSides } from '../layout/route/ports';
import type { Board, BoardEdge, BoardNode, Direction, Lane } from '../model/types';
import type { Route } from './arrowRoutes';
```

- Change `EdgeViewData` to:

```ts
export type EdgeViewData = { edge: BoardEdge; route: Route | undefined; critical: boolean; dimmed: boolean; editable: boolean };
```

- Delete the `autoSides` function (it moved to `ports.ts`; nothing else imports it from here).
- Change the `toFlowEdges` signature to:

```ts
export function toFlowEdges(board: Board, view: FlowView, cache: RenderCache<FlowEdgeType>, routes: ReadonlyMap<string, Route>): FlowEdgeType[] {
```

- Inside its `map`, replace the `return cached(cache, e.id, [e, selected, critical, dimmed, view.editable, color, board.direction], () => ({` line with:

```ts
    const route = routes.get(e.id);
    return cached(cache, e.id, [e, route, selected, critical, dimmed, view.editable, color, board.direction], () => ({
```

- and change `data: { edge: e, critical, dimmed, editable: view.editable },` to `data: { edge: e, route, critical, dimmed, editable: view.editable },`.

- [ ] **Step 5: Draw the route in `FlowEdge`**

Replace `src/canvas/FlowEdge.tsx` with:

```tsx
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { roundedPath } from '../layout/route/path';
import { EdgeToolbar } from './EdgeToolbar';
import { FlagBadges } from './FlagBadges';
import type { FlowEdgeType } from './toFlow';

export function FlowEdge({ id, data, selected, markerEnd }: EdgeProps<FlowEdgeType>) {
  if (!data?.route) return null;
  const { edge, route, critical, dimmed } = data;
  const { x: labelX, y: labelY } = route.label;
  const className = ['fs-edge', `type-${edge.type}`, critical && 'is-critical', dimmed && 'is-dimmed', selected && 'is-selected'].filter(Boolean).join(' ');
  const openFlags = edge.flags.filter((f) => !f.resolved);
  return (
    <>
      <BaseEdge id={id} path={roundedPath(route.points)} markerEnd={markerEnd} className={className} interactionWidth={18} />
      {(edge.label || openFlags.length > 0) && (
        <EdgeLabelRenderer>
          <div className={`fs-edge-label nodrag nopan ${dimmed ? 'is-dimmed' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {edge.label && <span>{edge.label}</span>}
            <FlagBadges flags={openFlags} />
          </div>
        </EdgeLabelRenderer>
      )}
      {data.editable && selected && <EdgeToolbar edge={edge} x={labelX} y={labelY} />}
    </>
  );
}
```

- [ ] **Step 6: Wire the routes in `Canvas`**

In `src/canvas/Canvas.tsx`:
- After `import { flowStore, useFlow } from '../store/store';` add `import { arrowRoutes, type RouteCache } from './arrowRoutes';`.
- After `const edgeCache = useRef<RenderCache<FlowEdgeType>>(new Map());` add `const routeCache = useRef<RouteCache>(new Map());`.
- Replace

```ts
  const edges = useMemo(() => (board ? toFlowEdges(board, view, edgeCache.current) : []), [board, view]);
```

with

```ts
  const routes = useMemo(() => (board ? arrowRoutes(board, routeCache.current) : null), [board]);
  const edges = useMemo(() => (board && routes ? toFlowEdges(board, view, edgeCache.current, routes) : []), [board, view, routes]);
```

Routes depend only on the board, so selecting or highlighting an arrow never re-routes anything.

- [ ] **Step 7: Run the unit tests**

Run: `npx vitest run src/canvas`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Write the browser tests**

Create `tests/e2e/arrows.spec.ts`:

```ts
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Board, XY } from '../../src/model/types';
import { connect } from '../../src/ops/edges';
import { addStep } from '../../src/ops/steps';
import { node, open, seed } from './fixtures';

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
```

Notes:
- Ids are predictable: a fresh board allocates `s1`, `s2`, then `e3` from one counter.
- `(300, 176)` is half of the 509px route `(185.5, 36) > (300, 36) > (300, 336) > (394.5, 336)`.
- The first test passes on the code before this task too; it guards that our ports sit exactly where React Flow put them.

- [ ] **Step 9: Run the browser tests**

Run: `npx playwright test tests/e2e/arrows.spec.ts --workers=2`
Expected: 2 PASS.

To see that the second test is real, stash your `FlowEdge.tsx` change (`git stash push src/canvas/FlowEdge.tsx`), rerun and watch it FAIL on the `d` attribute, then `git stash pop`.

Then run the suites that draw arrows today:

Run: `npx playwright test tests/e2e/canvas.spec.ts tests/e2e/interactions.spec.ts --workers=2`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add src/canvas/arrowRoutes.ts src/canvas/arrowRoutes.test.ts src/canvas/toFlow.ts src/canvas/toFlow.test.ts src/canvas/FlowEdge.tsx src/canvas/Canvas.tsx tests/e2e/arrows.spec.ts
git commit -m "Draw arrows from cached board routes instead of React Flow's path"
```

---

### Task 5: Bends move with their boxes, Tidy clears them

**Files:**
- Create: `src/ops/arrowPath.ts`
- Modify: `src/ops/steps.ts:3` (import), `:5` (import), `:152-163` (`setPositions`)
- Modify: `src/ops/clipboard.ts:35` (paste offsets bends)
- Modify: `src/ops/board.ts:25` (Tidy clears bends)
- Modify: `src/layout/place.ts:63-80` (`shiftDownstream` carries bends)
- Test: `src/ops/arrowPath.test.ts`, `src/layout/place.test.ts`, `tests/e2e/arrows.spec.ts`

**Interfaces:**
- Consumes: `setPositions`, `withGroupMembers`, `pasteSubgraph`, `copySubgraph`, `applyTidy`, `shiftDownstream` (existing).
- Produces:
  - `src/ops/arrowPath.ts`: `shiftBends(b: Board, moved: ReadonlyMap<string, XY>): void` (moves the bends of every arrow whose two ends moved by the same delta)
  - `setPositions(b: Board, positions: Record<string, XY>): void` now also shifts bends
  - test helpers in `src/ops/arrowPath.test.ts` reused by Tasks 7 and 15: `BENDS`, `shaped()` returning `{ b, a, c, e }`
  - browser helper `drag(page, target, dx, dy)` in `tests/e2e/arrows.spec.ts`

Rules (spec section 2):
- Both ends move by the same delta (a selection drag holding both, a group move, a Ctrl+drag copy putting the originals back, an arrow-key nudge): bends shift by that delta.
- Only one end moves, or the two move by different amounts (align, distribute): bends stay.
- Deltas are compared within 0.01, because a drag computes each node's position as start plus delta, and two such subtractions can differ in the last bit.

- [ ] **Step 1: Write the failing unit tests**

Create `src/ops/arrowPath.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard } from '../model/factory';
import { applyTidy } from './board';
import { copySubgraph, pasteSubgraph } from './clipboard';
import { connect } from './edges';
import { groupSteps } from './groups';
import { addStep, setPositions, withGroupMembers } from './steps';

const BENDS = [{ x: 300, y: 36 }, { x: 300, y: 236 }];

function shaped() {
  const b = createBoard('B');
  const a = addStep(b, { title: 'A', x: 0, y: 0 });
  const c = addStep(b, { title: 'C', x: 400, y: 200 });
  const e = connect(b, { source: a, target: c });
  b.edges[0].bends = BENDS.map((p) => ({ ...p }));
  return { b, a, c, e };
}

describe('bends follow their boxes', () => {
  it('shift by the same amount when both ends move together', () => {
    const { b, a, c } = shaped();
    setPositions(b, { [a]: { x: 40, y: 20 }, [c]: { x: 440, y: 220 } });
    expect(b.edges[0].bends).toEqual([{ x: 340, y: 56 }, { x: 340, y: 256 }]);
  });

  it('stay put when only one end moves', () => {
    const { b, c } = shaped();
    setPositions(b, { [c]: { x: 500, y: 260 } });
    expect(b.edges[0].bends).toEqual(BENDS);
  });

  it('stay put when both ends move by different amounts', () => {
    const { b, a, c } = shaped();
    setPositions(b, { [a]: { x: 40, y: 0 }, [c]: { x: 400, y: 260 } });
    expect(b.edges[0].bends).toEqual(BENDS);
  });

  it('shift when the group holding both ends moves', () => {
    const { b, a, c } = shaped();
    const g = groupSteps(b, [a, c], 'G');
    const frame = b.nodes.find((n) => n.id === g)!;
    setPositions(b, withGroupMembers(b, { [g]: { x: frame.x + 100, y: frame.y - 50 } }));
    expect(b.edges[0].bends).toEqual([{ x: 400, y: -14 }, { x: 400, y: 186 }]);
  });

  it('shift with the copy on paste and leave the original alone', () => {
    const { b, a, c } = shaped();
    pasteSubgraph(b, copySubgraph(b, [a, c]), 40, 60);
    expect(b.edges[0].bends).toEqual(BENDS);
    expect(b.edges[1].bends).toEqual([{ x: 340, y: 96 }, { x: 340, y: 296 }]);
  });

  it('return with the original when a Ctrl+drag drops a copy', () => {
    const { b, a, c } = shaped();
    setPositions(b, { [a]: { x: 100, y: 0 }, [c]: { x: 500, y: 200 } });
    setPositions(b, { [a]: { x: 0, y: 0 }, [c]: { x: 400, y: 200 } });
    pasteSubgraph(b, copySubgraph(b, [a, c]), 100, 0);
    expect(b.edges.map((e) => e.bends)).toEqual([BENDS, [{ x: 400, y: 36 }, { x: 400, y: 236 }]]);
  });

  it('are cleared by Tidy', () => {
    const { b, a, c } = shaped();
    applyTidy(b, { positions: { [a]: { x: 0, y: 0 }, [c]: { x: 252, y: 0 } }, laneHeights: {} });
    expect(b.edges[0].bends).toEqual([]);
  });
});
```

The Ctrl+drag test replays what `Canvas.onNodeDragStop` does: the drag has already moved both originals, then `setPositions(b, copy.start)` puts them back, then `pasteSubgraph` drops the copy at the drag delta.

In `src/layout/place.test.ts`, add after the test `'shifts downstream nodes and survives cycles'`:

```ts
  it('carries the bends of an arrow whose two ends are both pushed', () => {
    const b = createBoard('B');
    const a = add(b, { x: 0 });
    const c = add(b, { x: 300 });
    const d = add(b, { x: 600 });
    link(b, a.id, c.id);
    link(b, c.id, d.id);
    b.edges[0].bends = [{ x: 250, y: 36 }];
    b.edges[1].bends = [{ x: 550, y: 36 }];
    shiftDownstream(b, c.id, 100);
    expect(b.edges.map((e) => e.bends)).toEqual([[{ x: 250, y: 36 }], [{ x: 650, y: 36 }]]);
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ops/arrowPath.test.ts src/layout/place.test.ts`
Expected: FAIL. "shift by the same amount", "shift when the group", "shift with the copy", "return with the original", "are cleared by Tidy" and "carries the bends" fail on unchanged bends; the two "stay put" tests pass already.

- [ ] **Step 3: Write `shiftBends`**

Create `src/ops/arrowPath.ts`:

```ts
import type { Board, XY } from '../model/types';

const EPS = 0.01;

export function shiftBends(b: Board, moved: ReadonlyMap<string, XY>): void {
  for (const e of b.edges) {
    const s = moved.get(e.source);
    const t = moved.get(e.target);
    if (!e.bends.length || !s || !t) continue;
    if (Math.abs(s.x - t.x) > EPS || Math.abs(s.y - t.y) > EPS || (s.x === 0 && s.y === 0)) continue;
    e.bends = e.bends.map((p) => ({ x: p.x + s.x, y: p.y + s.y }));
  }
}
```

- [ ] **Step 4: Shift bends in `setPositions`**

In `src/ops/steps.ts`:
- Change line 3 to `import type { Actor, Board, EdgeType, Shape, Status, XY } from '../model/types';`.
- Before `import { connect } from './edges';` add `import { shiftBends } from './arrowPath';`.
- Replace `setPositions` with:

```ts
export function setPositions(b: Board, positions: Record<string, XY>): void {
  const groups = new Set<string>();
  const moved = new Map<string, XY>();
  for (const n of b.nodes) {
    const p = positions[n.id];
    if (!p) continue;
    moved.set(n.id, { x: p.x - n.x, y: p.y - n.y });
    n.x = p.x;
    n.y = p.y;
    syncLane(b, n);
    if (n.groupId) groups.add(n.groupId);
  }
  for (const g of groups) if (!positions[g]) fitGroup(b, g);
  shiftBends(b, moved);
}
```

`setPositions` is the path for canvas drags (every frame, inside the drag's transaction), group moves via `withGroupMembers`, arrow-key nudges, align, distribute, and the Ctrl+drag reset, so all of them follow the rules above.

- [ ] **Step 5: Offset bends on paste**

In `src/ops/clipboard.ts`, replace:

```ts
    b.edges.push({ ...e, id: allocId(b, 'e'), source: idMap.get(e.source)!, target: idMap.get(e.target)!, flags: freshFlags(e.flags) });
```

with:

```ts
    const bends = e.bends.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    b.edges.push({ ...e, id: allocId(b, 'e'), source: idMap.get(e.source)!, target: idMap.get(e.target)!, flags: freshFlags(e.flags), bends });
```

Copy, paste, duplicate and Ctrl+drag copy all end in `pasteSubgraph`.

- [ ] **Step 6: Clear bends on Tidy and carry them in `shiftDownstream`**

In `src/ops/board.ts`, in `applyTidy`, after `for (const g of b.nodes) if (g.kind === 'group') fitGroup(b, g.id);` add:

```ts
  for (const e of b.edges) if (e.bends.length) e.bends = [];
```

The guard matters: assigning a fresh empty array to an arrow that had none would make Immer produce a new edge object and invalidate its cached route for nothing.

In `src/layout/place.ts`, in `shiftDownstream`, after `for (const g of groups) fitGroup(board, g);` add:

```ts
  for (const e of board.edges) {
    if (!e.bends.length || !seen.has(e.source) || !seen.has(e.target)) continue;
    e.bends = e.bends.map((p) => (ax.main === 'x' ? { x: p.x + delta, y: p.y } : { x: p.x, y: p.y + delta }));
  }
```

`shiftDownstream` moves a whole downstream chain by one delta without going through `setPositions` (it is how `insert_between`, `branch_parallel` and `ensureGap` make room), so it carries the bends itself. `layout` cannot import `ops`, which is why this is not a call to `shiftBends`.

- [ ] **Step 7: Run the unit tests**

Run: `npx vitest run src/ops src/layout`
Expected: all PASS.

- [ ] **Step 8: Add the browser tests**

In `tests/e2e/arrows.spec.ts`:
- Change the fixtures import to `import { board, node, open, seed } from './fixtures';`.
- Add after `resetZoom`:

```ts
async function drag(page: Page, target: Locator, dx: number, dy: number): Promise<void> {
  const c = await centerOf(target);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  // React Flow starts the drag on the first move past its 1px threshold and measures from there.
  await page.mouse.move(c.x + 2, c.y);
  await page.mouse.move(c.x + 2 + dx, c.y + dy, { steps: 10 });
  await page.mouse.up();
}
```

- Append the tests:

```ts
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
```

`s1` starts at `(0, 0)`, so after the drag its position is the delta, snapped to the grid.

- [ ] **Step 9: Run the browser tests**

Run: `npx playwright test tests/e2e/arrows.spec.ts tests/e2e/assists.spec.ts --workers=2`
Expected: all PASS. `assists.spec.ts` covers Ctrl+drag copy, group drags and nudges, which now also run `shiftBends`.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/ops/arrowPath.ts src/ops/arrowPath.test.ts src/ops/steps.ts src/ops/clipboard.ts src/ops/board.ts src/layout/place.ts src/layout/place.test.ts tests/e2e/arrows.spec.ts
git commit -m "Move bends with their boxes, offset them on paste, clear them on Tidy"
```

---

### Task 6: CHECKPOINT: drawing budget and scale-back decision (controller, no code)

**Files:** none. This task produces a decision, not code.

**Interfaces:**
- Consumes: `BASELINE`, `ENFORCE_BUDGET` and the two routing budget tests from Task 0, the routing from Tasks 2 to 5.
- Produces: a recorded decision, "no scale-back" or "scale-back step 1", which Task 19 writes into ADR-0015.

The controller runs this, not an implementer.

- [ ] **Step 1: Run the budget with assertions active**

PowerShell:

```powershell
$env:PERF_BUDGET='1'; npx playwright test tests/e2e/perf.spec.ts -g "routing budget" --workers=1; Remove-Item Env:PERF_BUDGET
```

Bash: `PERF_BUDGET=1 npx playwright test tests/e2e/perf.spec.ts -g "routing budget" --workers=1`

Each test already takes the median of three runs. If a test fails, run the command once more. Two failures in a row mean the budget is missed. Record the printed per-run numbers and medians either way.

- [ ] **Step 2: Rule on the result**

The spec's scale-back rules (section 4), verbatim:

> 1. If our automatic drawing is slower than React Flow's, automatic arrows without `separate` go back to React Flow's `getSmoothStepPath`. Only edited or separate arrows use our routes.
> 2. If "Don't merge" still breaks the budget, it keeps the spread attach points and drops the sideways line shift. The shift is the only board-wide step.
>
> Each scale-back gets an ADR.

At this point no arrow is drawn differently for being separate (that is Task 13), so any miss here is our automatic drawing, and rule 1 applies:
- **Both tests pass:** no scale-back. Continue with Task 7.
- **Either test fails twice:** scale-back step 1 is needed. Stop and plan it as its own task before Task 7. It would change exactly these files:
  - `src/canvas/arrowRoutes.ts`: skip automatic arrows without `separate` (no bends, not separate), so they get no route.
  - `src/canvas/FlowEdge.tsx`: when `data.route` is missing, draw with `getSmoothStepPath` from React Flow's `sourceX`, `sourceY`, `sourcePosition`, `targetX`, `targetY`, `targetPosition` with `borderRadius: 14, offset: 22`, and place the label at its returned `labelX`, `labelY`, as the code before Task 4 did.
  - `src/canvas/arrowRoutes.test.ts` and `src/canvas/toFlow.test.ts`: expectations for automatic arrows.
  - `tests/e2e/arrows.spec.ts`: the label test applies only to hand-shaped arrows.
  - Slice 2 consequence: `src/canvas/ArrowHandles.tsx` (Task 8) must build the corners of an automatic arrow itself with `elbow(portAt(...), ...)`, because such arrows have no route.
  - `docs/adr/0015-arrow-routing-performance-budget.md` (Task 19) records the scale-back with the measured numbers.

- [ ] **Step 3: Record the decision**

Write the outcome and the measured numbers in the controller's notes for Task 19, for example: "Checkpoint 1: no scale-back. Drag p95 median 33.4ms (baseline 33.4ms). Open median 481ms (baseline 478ms)."

---

### Task 7: Reattach and bend operations

**Files:**
- Modify: `src/ops/edges.ts:1-2` (import), `:15-21` (`connect` uses a shared rule check)
- Modify: `src/ops/arrowPath.ts` (whole file)
- Test: `src/ops/arrowPath.test.ts`

**Interfaces:**
- Consumes: `shiftBends` (Task 5), `simplify` (Task 3), `edgeSides` (Task 2), `getEdge`, `getNode` from `src/ops/query.ts`, `OpError`.
- Produces:
  - `src/ops/edges.ts`: `assertLinkable(source: BoardNode, target: BoardNode): void` (throws the same `OpError` messages `connect` always has)
  - `src/ops/arrowPath.ts`:
    - `type ArrowEnd = 'source' | 'target'`
    - `reattach(b: Board, id: string, end: ArrowEnd, nodeId: string, side: Side): void`
    - `setBends(b: Board, id: string, bends: XY[]): void` (stores `simplify(bends)`)
    - `resetPath(b: Board, ids: string[]): void`

Reattach rules (spec sections 2 and 5):
- Same box, same effective side: no change at all (so a drop where the end already is creates no undo entry).
- Same box, another side: set the side, keep the bends.
- Another box: `connect`'s rules apply (no self-link, no group frames), plus no second arrow of the same type between the same two boxes; then move the end, set the side and clear the bends.
- A refusal throws `OpError`; the canvas shows it as the usual toast through `runSafely`.

- [ ] **Step 1: Write the failing tests**

In `src/ops/arrowPath.test.ts`, replace the import block with:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard } from '../model/factory';
import { reattach, resetPath, setBends } from './arrowPath';
import { applyTidy } from './board';
import { copySubgraph, pasteSubgraph } from './clipboard';
import { connect } from './edges';
import { OpError } from './errors';
import { groupSteps } from './groups';
import { runOp } from './run';
import { addStep, setPositions, withGroupMembers } from './steps';
```

and append:

```ts
describe('reattach', () => {
  it('moves an end to another side of the same box and keeps the bends', () => {
    const { b, e, c } = shaped();
    reattach(b, e, 'target', c, 'top');
    expect(b.edges[0]).toMatchObject({ target: c, targetSide: 'top', bends: BENDS });
  });

  it('moves an end to another box and clears the bends', () => {
    const { b, e } = shaped();
    const d = addStep(b, { title: 'D', x: 400, y: 500 });
    reattach(b, e, 'target', d, 'left');
    expect(b.edges[0]).toMatchObject({ target: d, targetSide: 'left', bends: [] });
  });

  it('changes nothing when the end is dropped on the side it already uses', () => {
    const { b, e, a } = shaped();
    expect(runOp(b, (d) => reattach(d, e, 'source', a, 'right')).board).toBe(b);
  });

  it('refuses a self-link, a group frame and a duplicate of the same type', () => {
    const { b, e, a, c } = shaped();
    const d = addStep(b, { title: 'D', x: 800, y: 0 });
    connect(b, { source: a, target: d });
    const g = groupSteps(b, [d], 'G');
    expect(() => reattach(b, e, 'target', a, 'left')).toThrow(`Cannot connect ${a} to itself.`);
    expect(() => reattach(b, e, 'target', g, 'left')).toThrow('Groups cannot be connected');
    expect(() => reattach(b, e, 'target', d, 'left')).toThrow(OpError);
    expect(b.edges[0]).toMatchObject({ source: a, target: c, bends: BENDS });
  });

  it('allows the same pair when the existing arrow is of another type', () => {
    const { b, e, a } = shaped();
    const d = addStep(b, { title: 'D', x: 800, y: 0 });
    connect(b, { source: a, target: d, type: 'dependency' });
    reattach(b, e, 'target', d, 'left');
    expect(b.edges[0].target).toBe(d);
  });
});

describe('setBends and resetPath', () => {
  it('stores bends without repeated or collinear points', () => {
    const { b, e } = shaped();
    setBends(b, e, [{ x: 300, y: 36 }, { x: 300, y: 100 }, { x: 300, y: 236 }, { x: 300, y: 236 }]);
    expect(b.edges[0].bends).toEqual(BENDS);
  });

  it('drops the bends, and leaves an automatic arrow untouched', () => {
    const { b, e } = shaped();
    resetPath(b, [e]);
    expect(b.edges[0].bends).toEqual([]);
    expect(runOp(b, (d) => resetPath(d, [e])).board).toBe(b);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ops/arrowPath.test.ts`
Expected: FAIL, because `reattach`, `setBends` and `resetPath` are not exported from `./arrowPath` yet (Vitest reports each call as not a function).

- [ ] **Step 3: Share `connect`'s rules**

In `src/ops/edges.ts`, change line 2 to `import type { Board, BoardNode, EdgeType, Side } from '../model/types';` and replace the start of `connect`:

```ts
export function connect(b: Board, args: ConnectArgs): string {
  const source = getNode(b, args.source);
  const target = getNode(b, args.target);
  if (source.kind === 'group' || target.kind === 'group') {
    throw new OpError('Groups cannot be connected. Connect the steps inside them.');
  }
  if (source.id === target.id) throw new OpError(`Cannot connect ${source.id} to itself.`);
  const type = args.type ?? 'flow';
```

with:

```ts
export function assertLinkable(source: BoardNode, target: BoardNode): void {
  if (source.kind === 'group' || target.kind === 'group') {
    throw new OpError('Groups cannot be connected. Connect the steps inside them.');
  }
  if (source.id === target.id) throw new OpError(`Cannot connect ${source.id} to itself.`);
}

export function connect(b: Board, args: ConnectArgs): string {
  const source = getNode(b, args.source);
  const target = getNode(b, args.target);
  assertLinkable(source, target);
  const type = args.type ?? 'flow';
```

- [ ] **Step 4: Add the operations**

Replace `src/ops/arrowPath.ts` with:

```ts
import { edgeSides } from '../layout/route/ports';
import { simplify } from '../layout/route/through';
import type { Board, Side, XY } from '../model/types';
import { assertLinkable } from './edges';
import { OpError } from './errors';
import { getEdge, getNode } from './query';

export type ArrowEnd = 'source' | 'target';

const EPS = 0.01;

export function shiftBends(b: Board, moved: ReadonlyMap<string, XY>): void {
  for (const e of b.edges) {
    const s = moved.get(e.source);
    const t = moved.get(e.target);
    if (!e.bends.length || !s || !t) continue;
    if (Math.abs(s.x - t.x) > EPS || Math.abs(s.y - t.y) > EPS || (s.x === 0 && s.y === 0)) continue;
    e.bends = e.bends.map((p) => ({ x: p.x + s.x, y: p.y + s.y }));
  }
}

export function reattach(b: Board, id: string, end: ArrowEnd, nodeId: string, side: Side): void {
  const e = getEdge(b, id);
  const node = getNode(b, nodeId);
  const current = end === 'source' ? e.source : e.target;
  if (node.id === current && edgeSides(b.direction, e)[end] === side) return;
  if (node.id !== current) {
    const source = end === 'source' ? node : getNode(b, e.source);
    const target = end === 'target' ? node : getNode(b, e.target);
    assertLinkable(source, target);
    if (b.edges.some((x) => x.id !== e.id && x.source === source.id && x.target === target.id && x.type === e.type)) {
      throw new OpError(`${source.id} already has a ${e.type} arrow to ${target.id}.`);
    }
    e.bends = [];
    if (end === 'source') e.source = node.id;
    else e.target = node.id;
  }
  if (end === 'source') e.sourceSide = side;
  else e.targetSide = side;
}

export function setBends(b: Board, id: string, bends: XY[]): void {
  getEdge(b, id).bends = simplify(bends);
}

export function resetPath(b: Board, ids: string[]): void {
  for (const id of ids) {
    const e = getEdge(b, id);
    if (e.bends.length) e.bends = [];
  }
}
```

`reattach` checks everything before it writes anything, so a refusal leaves the arrow exactly as it was even outside `runOp`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/ops`
Expected: all PASS, including the existing `edges` and `structure` tests that exercise `connect`'s messages.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ops/edges.ts src/ops/arrowPath.ts src/ops/arrowPath.test.ts
git commit -m "Add reattach, set bends and reset path operations"
```

---

### Task 8: Segment bars and bend squares

**Files:**
- Create: `src/canvas/useArrowDrag.ts`, `src/canvas/ArrowHandles.tsx`
- Modify: `src/canvas/FlowEdge.tsx` (render the handles)
- Modify: `src/canvas/canvas.css` (append handle styles)
- Test: `tests/e2e/arrows.spec.ts`

**Interfaces:**
- Consumes: `setBends` (Task 7); `simplify`, `moveSegment`, `segmentAxis`, `innerSegments` (Task 3); `Route` (Task 4); `mods` from `src/canvas/assist/modifiers.ts`; `GRID` from `src/canvas/assist/snap.ts`; `layoutPrefs` from `src/store/layoutPrefs.ts`; `runSafely` from `src/canvas/safe.ts`.
- Produces:
  - `src/canvas/useArrowDrag.ts`: `interface HandleEvents { onPointerDown(e: ReactPointerEvent<SVGElement>): void }`, `interface ArrowDrag { segment(index: number): HandleEvents; bend(index: number): HandleEvents }`, `useArrowDrag(edge: BoardEdge, corners: XY[]): ArrowDrag`
  - `src/canvas/ArrowHandles.tsx`: `ArrowHandles({ edge, route }: { edge: BoardEdge; route: Route })`
  - DOM hooks used by later tests and by the menu (Task 16): `svg.fs-arrow-handles`, `rect.fs-arrow-bar[data-edge][data-segment]`, `rect.fs-arrow-bend[data-edge][data-bend]`
  - browser helpers: `selectArrow(page, edgeId)`, `history(page)`, `openTx(page)`, `dragTo(page, from: Locator, to: XY, opts?: { alt?: boolean })`

How the pieces behave:
- **When handles show:** only in the editable canvas, and only while this arrow is the only thing selected (the same rule as the arrow toolbar). A marquee over fifty steps selects their arrows too, and fifty sets of handles would bury the board.
- **Where they draw:** in a `ViewportPortal` above the node layer. Handles next to a box would otherwise sit under it.
- **Size:** 8px squares, and 16 by 6 bars along the segment, all multiplied by `max(1 / zoom, 1)` exactly as React Flow scales the box resize handles (`scaleSelector` in `node_modules/@xyflow/react/dist/esm/index.mjs`).
- **Segments:** a bar on each inner segment of the simplified route (not on the two stubs at the boxes). Dragging it slides the segment across its direction. The first drag of an automatic arrow stores the whole route as bends, which Task 3 showed rebuilds the same route.
- **Bends:** a square on each stored bend. Dragging it moves that bend; `through` supplies any corners needed to reach it.
- **Snapping:** the moved coordinate snaps to `GRID` when `gridSnap` is on, and Alt (`mods.alt`) suspends it, as for box drags.
- **Undo:** pointerdown opens a transaction, pointerup, pointercancel or unmount commits it (ADR-0005). Every move recomputes from the state captured at pointerdown, so the index being dragged never drifts.
- **Listeners:** move and up are listened for on `window`, not on the handle. A segment that lines up with its neighbour disappears from the simplified route, and its bar unmounts under the pointer; the drag must survive that.

- [ ] **Step 1: Write the failing browser tests**

In `tests/e2e/arrows.spec.ts`:
- Add `import { createBoard } from '../../src/model/factory';` above the `connect` import.
- Append:

```ts
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
```

Worked numbers, so you can check the expectations:
- The automatic route from `A (0, 0)` to `B (400, 300)` has corners `(185.5, 36) (290, 36) (290, 336) (394.5, 336)`; its only inner segment is index 1, the vertical at x = 290. Dragged 100px right it lands on 390, which the grid snaps to 400; with Alt it stays at 390.
- The bend at `(300, 36)` dragged by `(+47, -23)` lands on `(347, 13)`, which snaps to `(340, 20)`.
- In the neighbour test, segment 2 (y = 150) is dragged up to y = 36, where it merges with the first leg and its bar unmounts, then on to y = 100.
- Each zoom-out click scales by 1/1.2; waiting for each percentage keeps clicks from interrupting the 150ms animation.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx playwright test tests/e2e/arrows.spec.ts --workers=2 -g "segment|bend square|reference view|middle of a bend|zoomed out"`
Expected: FAIL. There is no `.fs-arrow-bar`, `.fs-arrow-bend` or `.fs-arrow-handles` yet, so the locators time out.

- [ ] **Step 3: Write the drag hook**

Create `src/canvas/useArrowDrag.ts`:

```ts
import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { moveSegment, segmentAxis, simplify } from '../layout/route/through';
import type { BoardEdge, XY } from '../model/types';
import { setBends } from '../ops/arrowPath';
import { layoutPrefs } from '../store/layoutPrefs';
import { flowStore } from '../store/store';
import { mods } from './assist/modifiers';
import { GRID } from './assist/snap';
import { runSafely } from './safe';

type Session =
  | { kind: 'segment'; points: XY[]; index: number; across: 'x' | 'y'; offset: number }
  | { kind: 'bend'; bends: XY[]; index: number; offset: XY };

export interface HandleEvents {
  onPointerDown(e: ReactPointerEvent<SVGElement>): void;
}

export interface ArrowDrag {
  segment(index: number): HandleEvents;
  bend(index: number): HandleEvents;
}

function snap(v: number): number {
  return layoutPrefs.getState().prefs.gridSnap && !mods.alt ? Math.round(v / GRID) * GRID : v;
}

function bendsFor(s: Session, at: XY): XY[] {
  if (s.kind === 'segment') return simplify(moveSegment(s.points, s.index, snap(at[s.across] + s.offset))).slice(1, -1);
  return s.bends.map((p, i) => (i === s.index ? { x: snap(at.x + s.offset.x), y: snap(at.y + s.offset.y) } : p));
}

export function useArrowDrag(edge: BoardEdge, corners: XY[]): ArrowDrag {
  const rf = useReactFlow();
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const toFlow = (e: { clientX: number; clientY: number }) => rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });

  // why: listen on window, because a segment that lines up with its neighbour vanishes mid-drag along with its bar.
  const track = (e: ReactPointerEvent<SVGElement>, s: Session) => {
    if (e.button !== 0 || stop.current) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    flowStore.getState().begin();
    const onMove = (ev: PointerEvent) => {
      const bends = bendsFor(s, toFlow(ev));
      runSafely(() =>
        flowStore.getState().changeBoard((b) => {
          if (b.edges.some((x) => x.id === edge.id)) setBends(b, edge.id, bends);
        }),
      );
    };
    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      stop.current = null;
      flowStore.getState().commit();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    stop.current = finish;
  };

  return {
    segment: (index) => ({
      onPointerDown: (e) => {
        const across = segmentAxis(corners[index], corners[index + 1]) === 'x' ? 'y' : 'x';
        track(e, { kind: 'segment', points: corners, index, across, offset: corners[index][across] - toFlow(e)[across] });
      },
    }),
    bend: (index) => ({
      onPointerDown: (e) => {
        const at = toFlow(e);
        const p = edge.bends[index];
        track(e, { kind: 'bend', bends: edge.bends, index, offset: { x: p.x - at.x, y: p.y - at.y } });
      },
    }),
  };
}
```

Notes:
- `offset` is where on the handle the user grabbed, so the handle does not jump to the pointer.
- The edge-exists check in `onMove` covers a pointermove that lands after the arrow was deleted but before React unmounts the handles; without it the user would see an "Unknown arrow" toast.
- `changeBoard` without a board id targets the active board, which is always the editable canvas.
- A press with no movement makes no change, so `commit()` records nothing.

- [ ] **Step 4: Write the handles**

Create `src/canvas/ArrowHandles.tsx`:

```tsx
import { useStore, ViewportPortal } from '@xyflow/react';
import { useMemo } from 'react';
import { innerSegments, simplify } from '../layout/route/through';
import type { BoardEdge } from '../model/types';
import { useFlow } from '../store/store';
import type { Route } from './arrowRoutes';
import { useArrowDrag } from './useArrowDrag';

const HANDLE = 8;
const BAR_LONG = 16;
const BAR_SHORT = 6;

export function ArrowHandles({ edge, route }: { edge: BoardEdge; route: Route }) {
  const only = useFlow((s) => s.edgeSelection.length === 1 && s.edgeSelection[0] === edge.id && s.selection.length === 0);
  const scale = useStore((s) => Math.max(1 / s.transform[2], 1));
  const corners = useMemo(() => simplify(route.points), [route]);
  const drag = useArrowDrag(edge, corners);
  if (!only) return null;
  const size = HANDLE * scale;
  // why: handles next to a box would sit under the node layer, so they draw in a portal above it.
  return (
    <ViewportPortal>
      <svg className="fs-arrow-handles" width={1} height={1}>
        {innerSegments(corners).map((i) => {
          const a = corners[i];
          const b = corners[i + 1];
          const horizontal = a.y === b.y;
          const w = (horizontal ? BAR_LONG : BAR_SHORT) * scale;
          const h = (horizontal ? BAR_SHORT : BAR_LONG) * scale;
          return (
            <rect
              key={`segment${i}`}
              className={`fs-arrow-bar ${horizontal ? 'is-horizontal' : 'is-vertical'}`}
              data-edge={edge.id}
              data-segment={i}
              x={(a.x + b.x) / 2 - w / 2}
              y={(a.y + b.y) / 2 - h / 2}
              width={w}
              height={h}
              rx={(BAR_SHORT / 2) * scale}
              {...drag.segment(i)}
            />
          );
        })}
        {edge.bends.map((p, i) => (
          <rect key={`bend${i}`} className="fs-arrow-bend" data-edge={edge.id} data-bend={i} x={p.x - size / 2} y={p.y - size / 2} width={size} height={size} rx={2 * scale} {...drag.bend(i)} />
        ))}
      </svg>
    </ViewportPortal>
  );
}
```

The hooks run before the early return on purpose (rules of hooks).

- [ ] **Step 5: Render the handles and style them**

In `src/canvas/FlowEdge.tsx`:
- Add `import { ArrowHandles } from './ArrowHandles';` after the `roundedPath` import.
- After the `EdgeToolbar` line add:

```tsx
      {data.editable && selected && <ArrowHandles edge={edge} route={route} />}
```

Append to `src/canvas/canvas.css`:

```css
.fs-arrow-handles {
  position: absolute;
  left: 0;
  top: 0;
  overflow: visible;
  pointer-events: none;
  z-index: 1001;
}
.fs-arrow-handles > * {
  pointer-events: all;
  fill: var(--surface);
  stroke: var(--accent);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}
.fs-arrow-bar.is-horizontal { cursor: ns-resize; }
.fs-arrow-bar.is-vertical { cursor: ew-resize; }
.fs-arrow-bend { cursor: move; }
```

`.react-flow__viewport` sets `pointer-events: none`, which the portal inherits; each handle turns it back on. The guides overlay uses z-index 1000 in the same portal, so handles sit just above it.

- [ ] **Step 6: Run the browser tests**

Run: `npx playwright test tests/e2e/arrows.spec.ts --workers=2`
Expected: all PASS.

Run: `npx playwright test tests/e2e/interactions.spec.ts tests/e2e/keyboard.spec.ts --workers=2`
Expected: all PASS (arrow selection, Delete and undo still behave).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/canvas/useArrowDrag.ts src/canvas/ArrowHandles.tsx src/canvas/FlowEdge.tsx src/canvas/canvas.css tests/e2e/arrows.spec.ts
git commit -m "Reshape a selected arrow by dragging its segments and bends"
```

Body: one undo step per drag, grid snap with Alt to suspend it, handles above the node layer, window listeners so a vanishing segment cannot strand the transaction.

---

### Task 9: Drag an arrow end to another side dot

**Files:**
- Modify: `src/canvas/useArrowDrag.ts` (whole file)
- Modify: `src/canvas/ArrowHandles.tsx` (whole file)
- Modify: `src/canvas/Canvas.tsx` (import, `reattaching`, class name at line 354)
- Modify: `src/canvas/canvas.css` (end circle cursors)
- Test: `tests/e2e/arrows.spec.ts`

**Interfaces:**
- Consumes: `reattach`, `type ArrowEnd` (Task 7); everything Task 8 consumes; the side dots' DOM attributes `data-nodeid` and `data-handleid` on `.react-flow__handle` (set by React Flow's `Handle`, `node_modules/@xyflow/react/dist/esm/index.mjs` line 1963).
- Produces:
  - `useArrowDrag.ts`: `useReattaching(): boolean`; `ArrowDrag` gains `ghost: { end: ArrowEnd; at: XY } | null` and `end(end: ArrowEnd): HandleEvents`
  - DOM hook: `circle.fs-arrow-end[data-edge][data-end="source" | "target"]`
  - browser helper `threeBoxes(b: Board)`

How it behaves:
- Pressing an end circle shows the side dots on every box, by adding the canvas's existing `is-connecting` class, the same one a new connection drag uses (`Canvas.tsx`, `connecting` state).
- The circle follows the pointer.
- On release, `document.elementsFromPoint` finds a `.react-flow__handle` under the pointer (the dot's 6px hit ring counts). A dot reattaches the end through `reattach`; anywhere else changes nothing. A refusal shows the usual toast.
- No transaction is needed: nothing changes until the drop, and the drop is one `changeBoard`.

- [ ] **Step 1: Write the failing browser test**

Append to `tests/e2e/arrows.spec.ts`:

```ts
function threeBoxes(b: Board): void {
  const a = addStep(b, { title: 'A', x: 0, y: 0 });
  const c = addStep(b, { title: 'B', x: 400, y: 0 });
  addStep(b, { title: 'C', x: 400, y: 300 });
  connect(b, { source: a, target: c });
}

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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test tests/e2e/arrows.spec.ts --workers=2 -g "reattaches"`
Expected: FAIL, because `.fs-arrow-end` does not exist yet.

- [ ] **Step 3: Add end drags to the hook**

Replace `src/canvas/useArrowDrag.ts` with:

```ts
import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { moveSegment, segmentAxis, simplify } from '../layout/route/through';
import { SIDES, type BoardEdge, type Side, type XY } from '../model/types';
import { reattach, setBends, type ArrowEnd } from '../ops/arrowPath';
import { layoutPrefs } from '../store/layoutPrefs';
import { flowStore } from '../store/store';
import { mods } from './assist/modifiers';
import { GRID } from './assist/snap';
import { runSafely } from './safe';

const arrowDrag = createStore<{ reattaching: boolean }>()(() => ({ reattaching: false }));

export function useReattaching(): boolean {
  return useStore(arrowDrag, (s) => s.reattaching);
}

type Shape =
  | { kind: 'segment'; points: XY[]; index: number; across: 'x' | 'y'; offset: number }
  | { kind: 'bend'; bends: XY[]; index: number; offset: XY };
type Session = Shape | { kind: 'end'; end: ArrowEnd };

export interface HandleEvents {
  onPointerDown(e: ReactPointerEvent<SVGElement>): void;
}

export interface ArrowDrag {
  ghost: { end: ArrowEnd; at: XY } | null;
  end(end: ArrowEnd): HandleEvents;
  segment(index: number): HandleEvents;
  bend(index: number): HandleEvents;
}

function snap(v: number): number {
  return layoutPrefs.getState().prefs.gridSnap && !mods.alt ? Math.round(v / GRID) * GRID : v;
}

function bendsFor(s: Shape, at: XY): XY[] {
  if (s.kind === 'segment') return simplify(moveSegment(s.points, s.index, snap(at[s.across] + s.offset))).slice(1, -1);
  return s.bends.map((p, i) => (i === s.index ? { x: snap(at.x + s.offset.x), y: snap(at.y + s.offset.y) } : p));
}

function dotAt(x: number, y: number): { nodeId: string; side: Side } | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!el.classList.contains('react-flow__handle')) continue;
    const nodeId = el.getAttribute('data-nodeid');
    const side = SIDES.find((s) => s === el.getAttribute('data-handleid'));
    if (nodeId && side) return { nodeId, side };
  }
  return null;
}

export function useArrowDrag(edge: BoardEdge, corners: XY[]): ArrowDrag {
  const rf = useReactFlow();
  const [ghost, setGhost] = useState<ArrowDrag['ghost']>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const toFlow = (e: { clientX: number; clientY: number }) => rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });

  // why: listen on window, because a segment that lines up with its neighbour vanishes mid-drag along with its bar.
  const track = (e: ReactPointerEvent<SVGElement>, s: Session) => {
    if (e.button !== 0 || stop.current) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (s.kind === 'end') arrowDrag.setState({ reattaching: true });
    else flowStore.getState().begin();
    const onMove = (ev: PointerEvent) => {
      const at = toFlow(ev);
      if (s.kind === 'end') {
        setGhost({ end: s.end, at });
        return;
      }
      const bends = bendsFor(s, at);
      runSafely(() =>
        flowStore.getState().changeBoard((b) => {
          if (b.edges.some((x) => x.id === edge.id)) setBends(b, edge.id, bends);
        }),
      );
    };
    const finish = (drop: PointerEvent | null) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      stop.current = null;
      if (s.kind !== 'end') {
        flowStore.getState().commit();
        return;
      }
      arrowDrag.setState({ reattaching: false });
      setGhost(null);
      const dot = drop && dotAt(drop.clientX, drop.clientY);
      if (dot) runSafely(() => flowStore.getState().changeBoard((b) => reattach(b, edge.id, s.end, dot.nodeId, dot.side)));
    };
    const onUp = (ev: PointerEvent) => finish(ev);
    const onCancel = () => finish(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    stop.current = () => finish(null);
  };

  return {
    ghost,
    end: (end) => ({ onPointerDown: (e) => track(e, { kind: 'end', end }) }),
    segment: (index) => ({
      onPointerDown: (e) => {
        const across = segmentAxis(corners[index], corners[index + 1]) === 'x' ? 'y' : 'x';
        track(e, { kind: 'segment', points: corners, index, across, offset: corners[index][across] - toFlow(e)[across] });
      },
    }),
    bend: (index) => ({
      onPointerDown: (e) => {
        const at = toFlow(e);
        const p = edge.bends[index];
        track(e, { kind: 'bend', bends: edge.bends, index, offset: { x: p.x - at.x, y: p.y - at.y } });
      },
    }),
  };
}
```

The `reattaching` flag lives in a small store because the circle's component is inside the edge while the class it controls is on the canvas; this is the same pattern as `assistOverlay` in `src/canvas/assist/overlay.ts`.

- [ ] **Step 4: Draw the end circles**

Replace `src/canvas/ArrowHandles.tsx` with:

```tsx
import { useStore, ViewportPortal } from '@xyflow/react';
import { useMemo } from 'react';
import { innerSegments, simplify } from '../layout/route/through';
import type { BoardEdge } from '../model/types';
import { useFlow } from '../store/store';
import type { Route } from './arrowRoutes';
import { useArrowDrag } from './useArrowDrag';

const HANDLE = 8;
const BAR_LONG = 16;
const BAR_SHORT = 6;

export function ArrowHandles({ edge, route }: { edge: BoardEdge; route: Route }) {
  const only = useFlow((s) => s.edgeSelection.length === 1 && s.edgeSelection[0] === edge.id && s.selection.length === 0);
  const scale = useStore((s) => Math.max(1 / s.transform[2], 1));
  const corners = useMemo(() => simplify(route.points), [route]);
  const drag = useArrowDrag(edge, corners);
  if (!only) return null;
  const size = HANDLE * scale;
  const ends = [
    { end: 'source', at: corners[0] },
    { end: 'target', at: corners[corners.length - 1] },
  ] as const;
  // why: the end circles sit on the side dots, so handles draw in a portal above the node layer.
  return (
    <ViewportPortal>
      <svg className="fs-arrow-handles" width={1} height={1}>
        {innerSegments(corners).map((i) => {
          const a = corners[i];
          const b = corners[i + 1];
          const horizontal = a.y === b.y;
          const w = (horizontal ? BAR_LONG : BAR_SHORT) * scale;
          const h = (horizontal ? BAR_SHORT : BAR_LONG) * scale;
          return (
            <rect
              key={`segment${i}`}
              className={`fs-arrow-bar ${horizontal ? 'is-horizontal' : 'is-vertical'}`}
              data-edge={edge.id}
              data-segment={i}
              x={(a.x + b.x) / 2 - w / 2}
              y={(a.y + b.y) / 2 - h / 2}
              width={w}
              height={h}
              rx={(BAR_SHORT / 2) * scale}
              {...drag.segment(i)}
            />
          );
        })}
        {edge.bends.map((p, i) => (
          <rect key={`bend${i}`} className="fs-arrow-bend" data-edge={edge.id} data-bend={i} x={p.x - size / 2} y={p.y - size / 2} width={size} height={size} rx={2 * scale} {...drag.bend(i)} />
        ))}
        {ends.map(({ end, at }) => {
          const dragging = drag.ghost?.end === end;
          const p = dragging && drag.ghost ? drag.ghost.at : at;
          return <circle key={end} className={`fs-arrow-end${dragging ? ' is-dragging' : ''}`} data-edge={edge.id} data-end={end} cx={p.x} cy={p.y} r={size / 2} {...drag.end(end)} />;
        })}
      </svg>
    </ViewportPortal>
  );
}
```

- [ ] **Step 5: Show the side dots while an end is dragged**

In `src/canvas/Canvas.tsx`:
- Before `import { useKeyboard } from './useKeyboard';` add `import { useReattaching } from './useArrowDrag';`.
- After `const [connecting, setConnecting] = useState(false);` add `const reattaching = useReattaching();`.
- In the `className` prop of `<ReactFlow>`, replace `connecting && 'is-connecting'` with `(connecting || (editable && reattaching)) && 'is-connecting'`.

Append to `src/canvas/canvas.css`:

```css
.fs-arrow-end { cursor: grab; }
.fs-arrow-end.is-dragging { cursor: grabbing; }
```

- [ ] **Step 6: Run the browser tests**

Run: `npx playwright test tests/e2e/arrows.spec.ts tests/e2e/assists.spec.ts --workers=2`
Expected: all PASS. `assists.spec.ts` includes "a plain drag from one dot to another connects those sides", which shares the `is-connecting` class.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/canvas/useArrowDrag.ts src/canvas/ArrowHandles.tsx src/canvas/Canvas.tsx src/canvas/canvas.css tests/e2e/arrows.spec.ts
git commit -m "Reattach an arrow end by dropping it on a side dot"
```

---

### Task 10: "Reset path" on the arrow toolbar

**Files:**
- Modify: `src/canvas/EdgeToolbar.tsx:2` (icon import), `:4` (import), `:48` (button before Delete)
- Test: `tests/e2e/arrows.spec.ts`

**Interfaces:**
- Consumes: `resetPath` (Task 7); `ToolButton` from `src/ui/controls.tsx`; `editBoard` from `src/canvas/boardChange.ts`; `RouteOff` from `lucide-react` (present in `node_modules/lucide-react/dist/esm/icons/route-off.mjs`).
- Produces: a toolbar button with accessible name "Reset path", shown only when the arrow has bends.

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/arrows.spec.ts`:

```ts
test('Reset path in the toolbar returns a hand-shaped arrow to its automatic route', async ({ page, request }) => {
  const p = await seed(request, shapedPair());
  await open(page, p);
  await selectArrow(page, 'e3');
  await page.getByRole('button', { name: 'Reset path' }).click();
  expect((await board(page)).edges[0].bends).toEqual([]);
  expect(await history(page)).toBe(1);
  await expect(page.getByRole('button', { name: 'Reset path' })).toHaveCount(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx playwright test tests/e2e/arrows.spec.ts --workers=2 -g "Reset path in the toolbar"`
Expected: FAIL, no button named "Reset path".

- [ ] **Step 3: Add the button**

In `src/canvas/EdgeToolbar.tsx`:
- Change `import { Trash } from 'lucide-react';` to `import { RouteOff, Trash } from 'lucide-react';`.
- Before `import { deleteEdges, updateEdge } from '../ops/edges';` add `import { resetPath } from '../ops/arrowPath';`.
- Insert before the `<ToolButton title="Delete arrow (Del)" ...>` line:

```tsx
          {edge.bends.length > 0 && (
            <ToolButton title="Reset path" onClick={() => editBoard((b) => resetPath(b, [edge.id]))}>
              <RouteOff size={14} />
            </ToolButton>
          )}
```

- [ ] **Step 4: Run the test**

Run: `npx playwright test tests/e2e/arrows.spec.ts --workers=2`
Expected: all PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/canvas/EdgeToolbar.tsx tests/e2e/arrows.spec.ts
git commit -m "Add Reset path to the arrow toolbar"
```

---

### Task 11: HUMAN PLAYTEST: editing arrows (controller, no code)

**Files:** none.

**Interfaces:**
- Consumes: slices 1 and 2.
- Produces: the user's findings, triaged into fixes before slice 3 or into PROJECT_STATUS follow-ups.

Headless tests cannot see layout or feel. Before building the menu, the controller asks the user to try the editing slice and waits for the answer.

- [ ] **Step 1: Start the app**

Check whether a dev server is already running on 5173 (PowerShell: `Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue`). If one is, use it and do not stop it. Otherwise run `npm run dev` in the background and remember to stop only that process afterwards.

- [ ] **Step 2: Ask the user to try these, and send the list as written**

1. Open a board you know. Do its arrows look exactly as before? Look closely at short arrows and at labels, which now sit halfway along each arrow.
2. Click an arrow. Do the end circles, the bars on its middle segments and the squares on its bends read clearly against steps, lanes and groups, in light and dark theme?
3. Drag an end circle to another side of the same step, then to a dot on a different step. Did the dots appear on every step while dragging? Did anything feel off when dropping near, but not on, a dot?
4. Drag a bar sideways. Then drag a bend square. Try both with Alt held. Did the snapping feel right?
5. Press Ctrl+Z after each drag. Was each drag exactly one undo step?
6. Zoom out a long way and repeat 3 and 4. Were the handles still easy to grab?
7. Select two connected steps, drag them together, then drag only one. Did the hand-made shape travel with both and stay put with one?
8. Press L (Tidy). Did the hand-made shapes reset, and did one Ctrl+Z bring them back?
9. Shift+click another board tab to open the reference view. Confirm you cannot see or use arrow handles there.
10. Anything confusing, ugly or slow?

- [ ] **Step 3: Record the findings**

Fix anything that blocks the slice before Task 12, each as its own test-first task. Park anything else in `PROJECT_STATUS.md` under "Ideas and deferred" in Task 19.

---

### Task 12: "Don't merge" geometry

**Files:**
- Create: `src/layout/route/apart.ts`
- Test: `src/layout/route/apart.test.ts`

**Interfaces:**
- Consumes: `sideAxis`, `type Axis` (Task 2); `innerSegments`, `moveSegment`, `segmentAxis` (Task 3); `overlaps`, `Rect` from `src/layout/geometry.ts`.
- Produces (in `apart.ts`):
  - `SHIFT_STEP = 10`, `SHIFT_TRIES = 5`
  - `interface ArrowEnds { id: string; separate: boolean; source: { node: string; side: Side; box: Rect }; target: { node: string; side: Side; box: Rect } }`
  - `type PortSpots = Map<string, Record<'source' | 'target', number>>` (attach position along the side, 0 to 1; only arrows with a spread end appear)
  - `spreadPorts(arrows: ArrowEnds[]): PortSpots`
  - `shiftLines(routes: ReadonlyMap<string, XY[]>, movable: string[]): Map<string, XY[]>` (returns the new corners of each movable arrow; never touches the others)

The rules (spec section 3), with the two gaps the spec left open filled in:
- **Spread:** separate ends on the same side of the same box are spread evenly along it, ordered by where their other end is (its box centre along the side), so they do not cross at the box. Ties go by arrow id so the order is stable.
- **With shared arrows on that side:** the shared arrows keep the midpoint. Each separate end goes into the half of the side that faces its other end, and is spread evenly within that half.
- **Line shift:** for each separate arrow, in the order given, each inner segment that lies on another arrow's segment (same line, overlapping by more than 1px) slides sideways by +10, -10, +20, -20, +30 until it is clear, and stays at the last try if none is. Stubs never move, so the arrow stays attached. Crossings are ignored. Other arrows never move, but later separate arrows see earlier ones where they ended up.
- **Prefilter:** a separate arrow is only compared with arrows whose bounding box comes within 30px (the largest shift) of its own.

- [ ] **Step 1: Write the failing tests**

Create `src/layout/route/apart.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { XY } from '../../model/types';
import { shiftLines, spreadPorts, type ArrowEnds } from './apart';

const A = { x: 0, y: 0, w: 180, h: 72 };
const box = (y: number) => ({ x: 400, y, w: 180, h: 72 });

function fromA(id: string, targetY: number, separate: boolean): ArrowEnds {
  return { id, separate, source: { node: 'a', side: 'right', box: A }, target: { node: `n${id}`, side: 'left', box: box(targetY) } };
}

describe('spreadPorts', () => {
  it('spreads separate arrows evenly along a side, ordered by where their other end is', () => {
    const spots = spreadPorts([fromA('e1', 200, true), fromA('e2', -200, true), fromA('e3', 0, true)]);
    expect([spots.get('e2')!.source, spots.get('e3')!.source, spots.get('e1')!.source]).toEqual([0.25, 0.5, 0.75]);
    expect(spots.get('e1')!.target).toBe(0.5);
  });

  it('keeps shared arrows on the midpoint and puts separate ones in the half facing their other end', () => {
    const spots = spreadPorts([fromA('e1', 0, false), fromA('e2', 300, true), fromA('e3', -300, true), fromA('e4', 500, true)]);
    expect(spots.has('e1')).toBe(false);
    expect(spots.get('e3')!.source).toBe(0.25);
    expect(spots.get('e2')!.source).toBeCloseTo(0.5 + 0.5 / 3);
    expect(spots.get('e4')!.source).toBeCloseTo(0.5 + 1 / 3);
  });

  it('leaves sides without a separate arrow alone', () => {
    expect(spreadPorts([fromA('e1', 0, false), fromA('e2', 100, false)]).size).toBe(0);
  });
});

describe('shiftLines', () => {
  const trunk = (x: number, y0: number, y1: number): XY[] => [{ x: 185.5, y: y0 }, { x, y: y0 }, { x, y: y1 }, { x: 394.5, y: y1 }];

  it('moves a separate arrow sideways off a line it shares, in 10px steps', () => {
    const routes = new Map([
      ['shared', trunk(290, 36, 336)],
      ['apart', trunk(290, 236, 536)],
    ]);
    expect(shiftLines(routes, ['apart']).get('apart')).toEqual(trunk(300, 236, 536));
  });

  it('tries the other side next and stops after five steps', () => {
    const routes = new Map([
      ['a', trunk(290, 36, 336)],
      ['b', trunk(300, 36, 336)],
      ['c', trunk(280, 36, 336)],
      ['apart', trunk(290, 236, 536)],
    ]);
    expect(shiftLines(routes, ['apart']).get('apart')).toEqual(trunk(310, 236, 536));
    const walls = new Map([...[270, 280, 290, 300, 310, 320].map((x): [string, XY[]] => [`w${x}`, trunk(x, 36, 336)]), ['apart', trunk(290, 236, 536)]]);
    expect(shiftLines(walls, ['apart']).get('apart')).toEqual(trunk(320, 236, 536));
  });

  it('never moves other arrows and ignores lines that only cross', () => {
    const cross: XY[] = [{ x: 200, y: 400 }, { x: 250, y: 400 }, { x: 350, y: 400 }, { x: 400, y: 400 }];
    const routes = new Map([
      ['other', cross],
      ['apart', trunk(290, 236, 536)],
    ]);
    const out = shiftLines(routes, ['apart']);
    expect(out.get('apart')).toEqual(trunk(290, 236, 536));
    expect(out.has('other')).toBe(false);
  });
});
```

Worked numbers:
- Three separate arrows alone on a side: positions 1/4, 2/4, 3/4, the upper target first.
- With one shared arrow: `e3` (target above) is the only one in the top half, at 0.25; `e2` and `e4` split the bottom half at 0.5 + 0.5/3 and 0.5 + 1/3.
- In the five-step test the tries are 300, 280, 310, 270, 320; with walls on all of them the segment ends at 320.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/layout/route/apart.test.ts`
Expected: FAIL, because `./apart` does not exist yet.

- [ ] **Step 3: Write `apart.ts`**

Create `src/layout/route/apart.ts`:

```ts
import type { Side, XY } from '../../model/types';
import { overlaps, type Rect } from '../geometry';
import { sideAxis, type Axis } from './ports';
import { innerSegments, moveSegment, segmentAxis } from './through';

export const SHIFT_STEP = 10;
export const SHIFT_TRIES = 5;

type End = 'source' | 'target';

export interface ArrowEnds {
  id: string;
  separate: boolean;
  source: { node: string; side: Side; box: Rect };
  target: { node: string; side: Side; box: Rect };
}

export type PortSpots = Map<string, Record<End, number>>;

const center = (r: Rect, axis: Axis) => (axis === 'x' ? r.x + r.w / 2 : r.y + r.h / 2);
const along = (side: Side): Axis => (sideAxis(side) === 'x' ? 'y' : 'x');

interface Slot {
  id: string;
  end: End;
  separate: boolean;
  key: number;
  mid: number;
}

export function spreadPorts(arrows: ArrowEnds[]): PortSpots {
  const sides = new Map<string, Slot[]>();
  for (const a of arrows) {
    for (const end of ['source', 'target'] as const) {
      const me = a[end];
      const other = a[end === 'source' ? 'target' : 'source'];
      const axis = along(me.side);
      const k = `${me.node}|${me.side}`;
      const list = sides.get(k) ?? [];
      sides.set(k, list);
      list.push({ id: a.id, end, separate: a.separate, key: center(other.box, axis), mid: center(me.box, axis) });
    }
  }
  const out: PortSpots = new Map();
  const place = (slots: Slot[], from: number, to: number) => {
    slots.forEach((s, i) => {
      const spot = out.get(s.id) ?? { source: 0.5, target: 0.5 };
      spot[s.end] = from + ((to - from) * (i + 1)) / (slots.length + 1);
      out.set(s.id, spot);
    });
  };
  for (const list of sides.values()) {
    const apart = list.filter((s) => s.separate).sort((p, q) => p.key - q.key || (p.id < q.id ? -1 : 1));
    if (!apart.length) continue;
    if (apart.length === list.length) place(apart, 0, 1);
    else {
      place(apart.filter((s) => s.key < s.mid), 0, 0.5);
      place(apart.filter((s) => s.key >= s.mid), 0.5, 1);
    }
  }
  return out;
}

function boundsOf(points: XY[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function sharesLine(a: XY, b: XY, c: XY, d: XY): boolean {
  const axis = segmentAxis(a, b);
  if (segmentAxis(c, d) !== axis) return false;
  const across = axis === 'x' ? 'y' : 'x';
  if (Math.abs(a[across] - c[across]) > 0.5) return false;
  const lo = Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
  const hi = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]));
  return hi - lo > 1;
}

function clashes(points: XY[], i: number, others: XY[][]): boolean {
  return others.some((o) => o.slice(1).some((q, j) => sharesLine(points[i], points[i + 1], o[j], q)));
}

export function shiftLines(routes: ReadonlyMap<string, XY[]>, movable: string[]): Map<string, XY[]> {
  const current = new Map(routes);
  const boxes = new Map([...routes].map(([id, points]) => [id, boundsOf(points)]));
  const out = new Map<string, XY[]>();
  for (const id of movable) {
    const start = current.get(id);
    const box = boxes.get(id);
    if (!start || !box) continue;
    let points = start;
    const near: XY[][] = [];
    for (const [other, p] of current) {
      const b = boxes.get(other);
      if (other !== id && b && overlaps(b, box, SHIFT_STEP * 3)) near.push(p);
    }
    for (const i of innerSegments(points)) {
      if (!clashes(points, i, near)) continue;
      const across = segmentAxis(points[i], points[i + 1]) === 'x' ? 'y' : 'x';
      const base = points[i][across];
      let tried = points;
      for (let k = 1; k <= SHIFT_TRIES; k++) {
        tried = moveSegment(points, i, base + SHIFT_STEP * Math.ceil(k / 2) * (k % 2 ? 1 : -1));
        if (!clashes(tried, i, near)) break;
      }
      points = tried;
    }
    current.set(id, points);
    boxes.set(id, boundsOf(points));
    out.set(id, points);
  }
  return out;
}
```

The input routes must be simplified corners (`simplify` from Task 3), so that every segment is a real one.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/layout/route`
Expected: all PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/layout/route/apart.ts src/layout/route/apart.test.ts
git commit -m "Spread separate arrows along a side and shift them off shared lines"
```

---

### Task 13: Draw "Don't merge" arrows, then re-check the budget

**Files:**
- Modify: `src/canvas/arrowRoutes.ts` (whole file)
- Test: `src/canvas/arrowRoutes.test.ts`

**Interfaces:**
- Consumes: `spreadPorts`, `shiftLines`, `type ArrowEnds` (Task 12); `simplify` (Task 3); everything Task 4 consumes.
- Produces: `arrowRoutes(board, cache)` with the same signature, now drawing separate arrows from spread attach points and shifted lines.

How it stays cheap (spec section 4):
- When no arrow on the board is separate, nothing board-wide runs; the code path is Task 4's.
- Otherwise `spreadPorts` runs over the board's arrows (a map build, no geometry), each arrow's cached route is keyed on its attach positions as well, and `shiftLines` runs for separate arrows without bends only, with its bounding-box prefilter.
- A shifted route that comes out equal to last time reuses last time's object, so `toFlowEdges` and React Flow skip that edge.
- Hand-shaped arrows are drawn exactly through their bends even when separate: their attach points spread, but their lines never shift. The user placed those bends.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('arrowRoutes', ...)` in `src/canvas/arrowRoutes.test.ts`:

```ts
  it('spreads separate arrows along a side and keeps shared ones on the midpoint', () => {
    const b = createBoard('B');
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const up = addStep(b, { title: 'Up', x: 400, y: -200 });
    const down = addStep(b, { title: 'Down', x: 400, y: 200 });
    const e1 = connect(b, { source: a, target: up });
    const e2 = connect(b, { source: a, target: down });
    expect(arrowRoutes(b, new Map()).get(e1)!.points[0]).toEqual({ x: 185.5, y: 36 });
    for (const e of b.edges) e.separate = true;
    const routes = arrowRoutes(b, new Map());
    expect(routes.get(e1)!.points[0]).toEqual({ x: 185.5, y: 24 });
    expect(routes.get(e2)!.points[0]).toEqual({ x: 185.5, y: 48 });
  });

  it('moves a separate arrow off a line it would share, and only that arrow', () => {
    const b = createBoard('B');
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'C', x: 400, y: 300 });
    const e = addStep(b, { title: 'E', x: 0, y: 200 });
    const f = addStep(b, { title: 'F', x: 400, y: 500 });
    const shared = connect(b, { source: a, target: c });
    const apart = connect(b, { source: e, target: f });
    const before = arrowRoutes(b, new Map());
    b.edges[1].separate = true;
    const after = arrowRoutes(b, new Map());
    expect(after.get(shared)!.points).toEqual(before.get(shared)!.points);
    expect(after.get(apart)!.points).toEqual([{ x: 185.5, y: 236 }, { x: 300, y: 236 }, { x: 300, y: 536 }, { x: 394.5, y: 536 }]);
  });

  it('keeps the same route object for a separate arrow whose shifted route did not change', () => {
    const { b, d, ac } = row();
    b.edges[0].separate = true;
    const cache: RouteCache = new Map();
    const first = arrowRoutes(b, cache).get(ac);
    const next = runOp(b, (draft) => setPositions(draft, { [d]: { x: 400, y: 340 } })).board;
    expect(arrowRoutes(next, cache).get(ac)).toBe(first);
  });
```

Worked numbers: `A` is 72px tall, so two separate arrows alone on its right side attach at 72/3 = 24 and 48. In the second test both arrows run a vertical at x = 290 and overlap between y = 236 and 336; the separate one moves to 300.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/canvas/arrowRoutes.test.ts`
Expected: FAIL on the first two new tests (both arrows still start at y = 36, and the vertical stays at 290). The third passes already, since nothing is shifted yet; it guards the identity reuse you are about to add.

- [ ] **Step 3: Add spreading and shifting**

Replace `src/canvas/arrowRoutes.ts` with:

```ts
import { shiftLines, spreadPorts, type ArrowEnds } from '../layout/route/apart';
import { elbow } from '../layout/route/elbow';
import { halfway } from '../layout/route/path';
import { edgeSides, portAt } from '../layout/route/ports';
import { simplify, through } from '../layout/route/through';
import type { Board, BoardEdge, BoardNode, Direction, XY } from '../model/types';

export interface Route {
  points: XY[];
  label: XY;
}

export type RouteCache = Map<string, { deps: unknown[]; route: Route }>;

type Link = { e: BoardEdge; s: BoardNode; t: BoardNode };

const MIDDLE = { source: 0.5, target: 0.5 };

function draw({ e, s, t }: Link, direction: Direction, at: { source: number; target: number }): Route {
  const sides = edgeSides(direction, e);
  const from = portAt(s, sides.source, at.source);
  const to = portAt(t, sides.target, at.target);
  const points = e.bends.length ? through(from, sides.source, e.bends, to, sides.target) : elbow(from, sides.source, to, sides.target);
  return { points, label: halfway(points) };
}

function remember(cache: RouteCache, key: string, deps: unknown[], make: () => Route): Route {
  const hit = cache.get(key);
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit.route;
  const route = make();
  cache.set(key, { deps, route });
  return route;
}

function linksOf(board: Board): Link[] {
  const nodes = new Map(board.nodes.map((n) => [n.id, n]));
  const links: Link[] = [];
  for (const e of board.edges) {
    const s = nodes.get(e.source);
    const t = nodes.get(e.target);
    if (s && t) links.push({ e, s, t });
  }
  return links;
}

function ends({ e, s, t }: Link, direction: Direction): ArrowEnds {
  const sides = edgeSides(direction, e);
  return { id: e.id, separate: e.separate, source: { node: s.id, side: sides.source, box: s }, target: { node: t.id, side: sides.target, box: t } };
}

const samePoints = (a: XY[], b: XY[]) => a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);

export function arrowRoutes(board: Board, cache: RouteCache): Map<string, Route> {
  const links = linksOf(board);
  // why: the board-wide pass runs only when some arrow is separate (ADR-0015).
  const spots = links.some((l) => l.e.separate) ? spreadPorts(links.map((l) => ends(l, board.direction))) : null;
  const out = new Map<string, Route>();
  for (const link of links) {
    const at = spots?.get(link.e.id) ?? MIDDLE;
    out.set(link.e.id, remember(cache, link.e.id, [link.e, link.s, link.t, board.direction, at.source, at.target], () => draw(link, board.direction, at)));
  }
  if (!spots) return out;
  const movable = links.filter((l) => l.e.separate && !l.e.bends.length).map((l) => l.e.id);
  const shifted = shiftLines(new Map([...out].map(([id, r]) => [id, simplify(r.points)])), movable);
  for (const [id, points] of shifted) {
    const key = `${id}|apart`;
    const hit = cache.get(key);
    const route = hit && samePoints(hit.route.points, points) ? hit.route : { points, label: halfway(points) };
    cache.set(key, { deps: [], route });
    out.set(id, route);
  }
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/canvas`
Expected: all PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Re-check the budget (scale-back rule 2)**

The perf board now has 20 separate arrows that really are spread and shifted. Run the budget with assertions active (Global Constraints, "Budget" command). If a test fails, run it once more.

- **Both pass:** record the printed numbers for ADR-0015 in the commit body and continue.
- **Either fails twice:** STOP. Do not commit this step's result as done, and do not scale back on your own. Report the numbers to the controller. Spec section 4, rule 2: "If "Don't merge" still breaks the budget, it keeps the spread attach points and drops the sideways line shift. The shift is the only board-wide step." That scale-back would change exactly:
  - `src/canvas/arrowRoutes.ts`: drop the `shiftLines` call, the `|apart` cache entries and `samePoints`.
  - `src/layout/route/apart.ts`: delete `shiftLines`, `SHIFT_STEP`, `SHIFT_TRIES`, `boundsOf`, `sharesLine` and `clashes`.
  - `src/layout/route/apart.test.ts`: delete `describe('shiftLines', ...)`.
  - `src/canvas/arrowRoutes.test.ts`: delete "moves a separate arrow off a line it would share, and only that arrow".
  - `tests/e2e/arrows.spec.ts` (Task 16): drop "Don't merge moves an arrow off a line it shares and leaves the other arrow alone".
  - `docs/adr/0015-arrow-routing-performance-budget.md` (Task 19): record the scale-back.

- [ ] **Step 6: Commit**

```bash
git add src/canvas/arrowRoutes.ts src/canvas/arrowRoutes.test.ts
git commit -m "Draw separate arrows from spread attach points and shifted lines"
```

Body: the budget numbers from Step 5 (per-run and medians for drag and open).

---

### Task 14: Route around boxes (search)

**Files:**
- Create: `src/layout/route/around.ts`
- Test: `src/layout/route/around.test.ts`

**Interfaces:**
- Consumes: `stubEnd`, `sideAxis` (Task 2); `simplify` (Task 3); `overlaps`, `Rect` from `src/layout/geometry.ts`.
- Produces (in `around.ts`):
  - `AROUND_PAD = 16`, `AROUND_LIMIT_MS = 50`, `TURN_COST = 40`, `AROUND_MARGIN = 400`
  - `interface AroundInput { source: XY; sourceSide: Side; target: XY; targetSide: Side; boxes: Rect[] }`
  - `interface AroundOptions { limitMs?: number; now?: () => number }`
  - `searchAround(input: AroundInput, opts?: AroundOptions): XY[] | null` (simplified corners from port to port, or `null` when there is no route or time ran out)

The search (spec section 6):
- **Grid:** the x and y lines of every box edge padded by 16px, plus the two stub ends, plus the edges of the search region. The region is the two stub ends' bounding box grown by 400px on every side; only boxes that touch it are obstacles, and the route stays inside it.
- **Moves:** between neighbouring grid points along x or y, never into a padded box and never through one. A route may run along a padded edge.
- **Cost:** length plus 40 per turn, including a turn into the target's stub. The state is (point, axis of arrival), so turns are counted exactly.
- **A\*:** Manhattan distance to the target stub as the estimate, a small binary heap.
- **Time limit:** the clock is read every 64 expansions, starting with the first; past `limitMs` the search returns `null`. The clock is injectable so a test can force a timeout.

- [ ] **Step 1: Write the failing tests**

Create `src/layout/route/around.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { XY } from '../../model/types';
import type { Rect } from '../geometry';
import { searchAround } from './around';

const A = { x: 0, y: 0, w: 180, h: 72 };
const B = { x: 300, y: 0, w: 180, h: 72 };
const C = { x: 600, y: 0, w: 180, h: 72 };
const from = { x: 185.5, y: 36 };
const to = { x: 594.5, y: 36 };

function cuts(points: XY[], r: Rect): boolean {
  return points.slice(1).some((q, i) => {
    const p = points[i];
    if (p.y === q.y) return r.y < p.y && p.y < r.y + r.h && Math.max(Math.min(p.x, q.x), r.x) < Math.min(Math.max(p.x, q.x), r.x + r.w);
    return r.x < p.x && p.x < r.x + r.w && Math.max(Math.min(p.y, q.y), r.y) < Math.min(Math.max(p.y, q.y), r.y + r.h);
  });
}

describe('searchAround', () => {
  it('finds a right-angled route that avoids every box in the way', () => {
    const route = searchAround({ source: from, sourceSide: 'right', target: to, targetSide: 'left', boxes: [A, B, C] });
    expect(route).not.toBeNull();
    const points = route!;
    expect(points[0]).toEqual(from);
    expect(points[points.length - 1]).toEqual(to);
    expect(points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y)).toBe(true);
    for (const box of [A, B, C]) expect(cuts(points, box)).toBe(false);
  });

  it('goes straight when nothing is in the way', () => {
    expect(searchAround({ source: from, sourceSide: 'right', target: to, targetSide: 'left', boxes: [A, C] })).toEqual([from, to]);
  });

  it('gives up with no route once the time limit passes', () => {
    let t = 0;
    const now = () => (t += 100);
    expect(searchAround({ source: from, sourceSide: 'right', target: to, targetSide: 'left', boxes: [A, B, C] }, { limitMs: 50, now })).toBeNull();
  });

  it('reports no route when an end is boxed in', () => {
    const cage = [{ x: 560, y: -100, w: 20, h: 300 }, { x: 560, y: -100, w: 400, h: 20 }, { x: 560, y: 180, w: 400, h: 20 }, { x: 940, y: -100, w: 20, h: 300 }];
    expect(searchAround({ source: from, sourceSide: 'right', target: to, targetSide: 'left', boxes: [A, C, ...cage] })).toBeNull();
  });

  it('routes across a 200-box board inside the time limit', () => {
    const boxes: Rect[] = [];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 20; c++) boxes.push({ x: c * 252, y: r * 200, w: 180, h: 72 });
    const route = searchAround({ source: { x: 5 * 252 + 185.5, y: 36 }, sourceSide: 'right', target: { x: 15 * 252 - 5.5, y: 9 * 200 + 36 }, targetSide: 'left', boxes });
    expect(route).not.toBeNull();
    for (const box of boxes) expect(cuts(route!, box)).toBe(false);
  });
});
```

The last test runs with the real clock and the real 50ms limit. It took about 7ms on the planning machine; if it fails here, the search is too slow for real boards, which is exactly what it is there to catch.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/layout/route/around.test.ts`
Expected: FAIL, because `./around` does not exist yet.

- [ ] **Step 3: Write `around.ts`**

Create `src/layout/route/around.ts`:

```ts
import type { Side, XY } from '../../model/types';
import { overlaps, type Rect } from '../geometry';
import { sideAxis, stubEnd } from './ports';
import { simplify } from './through';

export const AROUND_PAD = 16;
export const AROUND_LIMIT_MS = 50;
export const TURN_COST = 40;
export const AROUND_MARGIN = 400;

export interface AroundInput {
  source: XY;
  sourceSide: Side;
  target: XY;
  targetSide: Side;
  boxes: Rect[];
}

export interface AroundOptions {
  limitMs?: number;
  now?: () => number;
}

interface State {
  ix: number;
  iy: number;
  axis: 0 | 1;
  cost: number;
  score: number;
  from: State | null;
}

class Heap {
  private items: State[] = [];
  get size(): number {
    return this.items.length;
  }
  push(s: State): void {
    const a = this.items;
    a.push(s);
    let i = a.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (a[up].score <= a[i].score) break;
      [a[up], a[i]] = [a[i], a[up]];
      i = up;
    }
  }
  pop(): State | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].score < a[m].score) m = l;
        if (r < a.length && a[r].score < a[m].score) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const lines = (values: number[], lo: number, hi: number) => [...new Set(values.filter((v) => v >= lo && v <= hi))].sort((a, b) => a - b);

export function searchAround(input: AroundInput, opts: AroundOptions = {}): XY[] | null {
  const now = opts.now ?? (() => performance.now());
  const limit = opts.limitMs ?? AROUND_LIMIT_MS;
  const started = now();
  const s = stubEnd(input.source, input.sourceSide);
  const t = stubEnd(input.target, input.targetSide);
  const region = { x: Math.min(s.x, t.x) - AROUND_MARGIN, y: Math.min(s.y, t.y) - AROUND_MARGIN, w: Math.abs(s.x - t.x) + AROUND_MARGIN * 2, h: Math.abs(s.y - t.y) + AROUND_MARGIN * 2 };
  const walls = input.boxes
    .map((r) => ({ x: r.x - AROUND_PAD, y: r.y - AROUND_PAD, w: r.w + AROUND_PAD * 2, h: r.h + AROUND_PAD * 2 }))
    .filter((r) => overlaps(r, region, 0));
  const xs = lines([s.x, t.x, region.x, region.x + region.w, ...walls.flatMap((r) => [r.x, r.x + r.w])], region.x, region.x + region.w);
  const ys = lines([s.y, t.y, region.y, region.y + region.h, ...walls.flatMap((r) => [r.y, r.y + r.h])], region.y, region.y + region.h);
  const inside = (x: number, y: number) => walls.some((r) => r.x < x && x < r.x + r.w && r.y < y && y < r.y + r.h);
  const crosses = (lo: number, hi: number, from: number, size: number) => Math.max(lo, from) < Math.min(hi, from + size);
  const blocked = (a: XY, b: XY) =>
    walls.some((r) =>
      a.y === b.y
        ? r.y < a.y && a.y < r.y + r.h && crosses(Math.min(a.x, b.x), Math.max(a.x, b.x), r.x, r.w)
        : r.x < a.x && a.x < r.x + r.w && crosses(Math.min(a.y, b.y), Math.max(a.y, b.y), r.y, r.h),
    );
  if (inside(s.x, s.y) || inside(t.x, t.y)) return null;
  const goal = { ix: xs.indexOf(t.x), iy: ys.indexOf(t.y) };
  const endAxis = sideAxis(input.targetSide) === 'x' ? 0 : 1;
  const guess = (ix: number, iy: number) => Math.abs(xs[ix] - t.x) + Math.abs(ys[iy] - t.y);
  const best = new Map<number, number>();
  const key = (ix: number, iy: number, axis: number) => (iy * xs.length + ix) * 2 + axis;
  const open = new Heap();
  const ix0 = xs.indexOf(s.x);
  const iy0 = ys.indexOf(s.y);
  open.push({ ix: ix0, iy: iy0, axis: sideAxis(input.sourceSide) === 'x' ? 0 : 1, cost: 0, score: guess(ix0, iy0), from: null });
  let pops = 0;
  while (open.size) {
    if ((pops++ & 63) === 0 && now() - started > limit) return null;
    const cur = open.pop();
    if (!cur) break;
    if (cur.ix === goal.ix && cur.iy === goal.iy) {
      const path: XY[] = [input.target];
      for (let st: State | null = cur; st; st = st.from) path.push({ x: xs[st.ix], y: ys[st.iy] });
      path.push(input.source);
      return simplify(path.reverse());
    }
    if ((best.get(key(cur.ix, cur.iy, cur.axis)) ?? Infinity) < cur.cost) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ix = cur.ix + dx;
      const iy = cur.iy + dy;
      if (ix < 0 || iy < 0 || ix >= xs.length || iy >= ys.length) continue;
      const a = { x: xs[cur.ix], y: ys[cur.iy] };
      const b = { x: xs[ix], y: ys[iy] };
      if (inside(b.x, b.y) || blocked(a, b)) continue;
      const axis = dx !== 0 ? 0 : 1;
      const atGoal = ix === goal.ix && iy === goal.iy;
      const cost = cur.cost + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + (axis !== cur.axis ? TURN_COST : 0) + (atGoal && axis !== endAxis ? TURN_COST : 0);
      const k = key(ix, iy, axis);
      if ((best.get(k) ?? Infinity) <= cost) continue;
      best.set(k, cost);
      open.push({ ix, iy, axis, cost, score: cost + guess(ix, iy), from: cur });
    }
  }
  return null;
}
```

The stub is 22px and the padding 16px, so a stub end is always outside its own padded box. The route it returns includes both ports and both stub ends; the caller stores everything between the ports as bends.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/layout/route`
Expected: all PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/layout/route/around.ts src/layout/route/around.test.ts
git commit -m "Search a right-angled route around boxes within 50ms"
```

---

### Task 15: Menu operations on arrows

**Files:**
- Modify: `src/ops/arrowPath.ts` (imports; append four functions)
- Test: `src/ops/arrowPath.test.ts`

**Interfaces:**
- Consumes: `searchAround`, `type AroundOptions` (Task 14); `portAt`, `edgeSides` (Task 2); `simplify` (Task 3); `shaped`, `BENDS` test helpers (Task 5).
- Produces (in `src/ops/arrowPath.ts`):
  - `setSeparate(b: Board, ids: string[], separate: boolean): void`
  - `addBend(b: Board, id: string, at: XY, route: XY[]): void` (`route` is the drawn route, ports included)
  - `removeBend(b: Board, id: string, index: number): void`
  - `routeAround(b: Board, id: string, opts?: AroundOptions): boolean` (false leaves the arrow unchanged)

Decisions the spec left open, fixed here:
- **Add bend here** turns every corner of the drawn route into a bend and inserts the new one where the click projects onto the nearest segment. The new bend is collinear by nature, so it is kept rather than cleaned up; the next edit of the arrow removes it if it is still straight (ADR-0014). Every other edit cleans collinear points.
- **Remove bend** removes that bend and cleans what is left; `through` redraws the missing corner.
- **Route around** routes from the side midpoints, avoids every step and text box (group frames are not obstacles, they contain the steps), and saves the corners between the ports as bends. It returns `false` instead of throwing so the menu can route several arrows in one undo step and report only the ones that failed.

- [ ] **Step 1: Write the failing tests**

In `src/ops/arrowPath.test.ts`, change the `./arrowPath` import to:

```ts
import { addBend, reattach, removeBend, resetPath, routeAround, setBends, setSeparate } from './arrowPath';
```

and append:

```ts
describe('menu edits', () => {
  const drawn = [{ x: 185.5, y: 36 }, { x: 290, y: 36 }, { x: 290, y: 236 }, { x: 394.5, y: 236 }];

  it('adds a bend on the nearest segment and keeps every corner as a bend', () => {
    const { b, e } = shaped();
    b.edges[0].bends = [];
    addBend(b, e, { x: 296, y: 120 }, drawn);
    expect(b.edges[0].bends).toEqual([{ x: 290, y: 36 }, { x: 290, y: 120 }, { x: 290, y: 236 }]);
  });

  it('removes a bend and tidies what is left', () => {
    const { b, e } = shaped();
    b.edges[0].bends = [{ x: 300, y: 36 }, { x: 300, y: 120 }, { x: 300, y: 236 }];
    removeBend(b, e, 0);
    expect(b.edges[0].bends).toEqual([{ x: 300, y: 120 }, { x: 300, y: 236 }]);
    expect(() => removeBend(b, e, 5)).toThrow(OpError);
  });

  it('marks several arrows separate at once', () => {
    const { b, e, a } = shaped();
    const d = addStep(b, { title: 'D', x: 400, y: 500 });
    const other = connect(b, { source: a, target: d });
    setSeparate(b, [e, other], true);
    expect(b.edges.map((x) => x.separate)).toEqual([true, true]);
  });

  it('routes around a box in the way and saves the route as bends', () => {
    const b = createBoard('B');
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'In the way', x: 300, y: 0 });
    const c = addStep(b, { title: 'C', x: 600, y: 0 });
    const e = connect(b, { source: a, target: c });
    expect(routeAround(b, e)).toBe(true);
    const bends = b.edges[0].bends;
    expect(bends.length).toBeGreaterThan(1);
    expect(bends.every((p) => p.x <= 300 - 16 || p.x >= 480 + 16 || p.y <= -16 || p.y >= 72 + 16)).toBe(true);
  });

  it('leaves the arrow unchanged when the search runs out of time', () => {
    const b = createBoard('B');
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'In the way', x: 300, y: 0 });
    const c = addStep(b, { title: 'C', x: 600, y: 0 });
    const e = connect(b, { source: a, target: c });
    let t = 0;
    expect(routeAround(b, e, { now: () => (t += 100) })).toBe(false);
    expect(b.edges[0].bends).toEqual([]);
  });
});
```

`drawn` is the automatic route from `A (0, 0)` to `C (400, 200)`; a right-click at `(296, 120)` projects onto its vertical at x = 290.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ops/arrowPath.test.ts`
Expected: FAIL, the four new functions are not exported yet.

- [ ] **Step 3: Add the operations**

In `src/ops/arrowPath.ts`, replace the first line:

```ts
import { edgeSides } from '../layout/route/ports';
```

with:

```ts
import { searchAround, type AroundOptions } from '../layout/route/around';
import { edgeSides, portAt } from '../layout/route/ports';
```

and append:

```ts
export function setSeparate(b: Board, ids: string[], separate: boolean): void {
  for (const id of ids) getEdge(b, id).separate = separate;
}

function nearestOn(a: XY, b: XY, p: XY): XY {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return { x: a.x + dx * t, y: a.y + dy * t };
}

// why: the new bend sits on a straight line on purpose, so it skips collinear cleanup (ADR-0014).
export function addBend(b: Board, id: string, at: XY, route: XY[]): void {
  const e = getEdge(b, id);
  const corners = simplify(route);
  let best = { index: 0, point: corners[0], d: Infinity };
  for (let i = 0; i < corners.length - 1; i++) {
    const point = nearestOn(corners[i], corners[i + 1], at);
    const d = (point.x - at.x) ** 2 + (point.y - at.y) ** 2;
    if (d < best.d) best = { index: i, point, d };
  }
  const inner = corners.slice(1, -1);
  const bends = [...inner.slice(0, best.index), best.point, ...inner.slice(best.index)];
  e.bends = bends.filter((p, i) => i === 0 || p.x !== bends[i - 1].x || p.y !== bends[i - 1].y);
}

export function removeBend(b: Board, id: string, index: number): void {
  const e = getEdge(b, id);
  if (index < 0 || index >= e.bends.length) throw new OpError(`Arrow ${id} has no bend ${index + 1}.`);
  e.bends = simplify(e.bends.filter((_, i) => i !== index));
}

export function routeAround(b: Board, id: string, opts?: AroundOptions): boolean {
  const e = getEdge(b, id);
  const source = getNode(b, e.source);
  const target = getNode(b, e.target);
  const sides = edgeSides(b.direction, e);
  const boxes = b.nodes.filter((n) => n.kind !== 'group');
  const route = searchAround({ source: portAt(source, sides.source), sourceSide: sides.source, target: portAt(target, sides.target), targetSide: sides.target, boxes }, opts);
  if (!route) return false;
  e.bends = route.slice(1, -1);
  return true;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/ops`
Expected: all PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/ops/arrowPath.ts src/ops/arrowPath.test.ts
git commit -m "Add Don't merge, add and remove bend, and route around operations"
```

---

### Task 16: The arrow right-click menu

**Files:**
- Modify: `src/canvas/arrowRoutes.ts` (append `routeFor`)
- Modify: `src/canvas/menu/entries.tsx` (imports; append `arrowEntries` and a helper)
- Modify: `src/canvas/menu/useCanvasMenu.tsx:7` (import), `:20` (add `arrowAt` above `useCanvasMenu`), `:45-48` (arrow targets)
- Modify: `src/canvas/FlowEdge.tsx` (`data-edge` on the label)
- Test: `tests/e2e/arrows.spec.ts`

**Interfaces:**
- Consumes: `setSeparate`, `addBend`, `removeBend`, `routeAround`, `resetPath` (Tasks 7 and 15); `deleteEdges` from `src/ops/edges.ts`; `requestFocus` from `src/canvas/focusKey.ts`; `run` from `src/canvas/commands.ts`; `notify` from `src/ui/toast.ts`; the DOM hooks `[data-edge]`, `.fs-arrow-bend[data-bend]` (Tasks 8 and 9) and React Flow's `.react-flow__edge[data-id]`.
- Produces:
  - `src/canvas/arrowRoutes.ts`: `routeFor(board: Board, edgeId: string): Route | undefined`
  - `src/canvas/menu/entries.tsx`: `arrowEntries(boardId: string, edgeId: string, at: XY, bend: number | null): MenuEntry[]`
  - browser helpers `rightClickArrow(page, edgeId, at: XY)`, `edgeSelection(page)`, `pair(b)`

Behaviour (spec section 7):
- A right-click on an arrow, its label, or any of its handles selects the arrow (unless it is already in the selection) and opens the arrow menu. A right-click on a bend square also offers "Remove bend". This replaces today's early return for `.react-flow__edge` and the pane menu on labels.
- Items: Edit label, Don't merge (checkmark), Add bend here, Remove bend (only on a bend), Route around boxes, Reset path (disabled when no target arrow has bends), a separator, Delete arrow (Del).
- With several arrows selected, Don't merge, Route around boxes, Reset path and Delete arrow apply to all of them in one `changeBoard`, so one undo step. Don't merge sets every target to the opposite of the right-clicked arrow's state.
- Route around boxes toasts "No route found around the boxes." when it fails, and for several arrows "No route found around the boxes for N of M arrows."
- Edit label selects the arrow alone and focuses its toolbar label field, the same as a double-click.
- The arrow toolbar itself still opens the pane menu (it carries no `data-edge`); that is unchanged.

- [ ] **Step 1: Write the failing browser tests**

Append to `tests/e2e/arrows.spec.ts`:

```ts
async function rightClickArrow(page: Page, edgeId: string, at: XY): Promise<void> {
  const p = await toScreen(page, edgeId, at);
  await page.mouse.click(p.x, p.y, { button: 'right' });
}

const edgeSelection = (page: Page) => page.evaluate(() => window.__flowstate!.getState().edgeSelection);

function pair(b: Board): void {
  const a = addStep(b, { title: 'A', x: 0, y: 0 });
  const c = addStep(b, { title: 'B', x: 400, y: 0 });
  connect(b, { source: a, target: c, label: 'go' });
}

test('right-clicking an arrow selects it and opens the arrow menu', async ({ page, request }) => {
  const p = await seed(request, pair);
  await open(page, p);
  await resetZoom(page);
  await rightClickArrow(page, 'e3', { x: 240, y: 36 });
  expect(await edgeSelection(page)).toEqual(['e3']);
  for (const name of ['Edit label', 'Add bend here', 'Route around boxes', 'Delete arrow']) await expect(page.getByRole('menuitem', { name })).toBeVisible();
  await expect(page.getByRole('menuitemcheckbox', { name: "Don't merge" })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('menuitem', { name: 'Reset path' })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: 'Remove bend' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Paste here' })).toHaveCount(0);
});

test('right-clicking an arrow label opens the arrow menu and Edit label focuses the label', async ({ page, request }) => {
  const p = await seed(request, pair);
  await open(page, p);
  await page.locator('.fs-edge-label').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit label' }).click();
  await expect(page.getByLabel('Arrow label')).toBeFocused();
});

test('Add bend here and Remove bend from the menu, one undo step each', async ({ page, request }) => {
  const p = await seed(request, pair);
  await open(page, p);
  await resetZoom(page);
  await rightClickArrow(page, 'e3', { x: 290, y: 36 });
  await page.getByRole('menuitem', { name: 'Add bend here' }).click();
  const [bend] = (await board(page)).edges[0].bends;
  expect(bend.y).toBe(36);
  expect(bend.x).toBeCloseTo(290, 0);
  await page.locator('.fs-arrow-bend[data-bend="0"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove bend' }).click();
  expect((await board(page)).edges[0].bends).toEqual([]);
  expect(await history(page)).toBe(2);
});

test("Don't merge on two selected arrows spreads their attach points in one undo step", async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const up = addStep(b, { title: 'Up', x: 400, y: -200 });
    const down = addStep(b, { title: 'Down', x: 400, y: 200 });
    connect(b, { source: a, target: up });
    connect(b, { source: a, target: down });
  });
  await open(page, p);
  await resetZoom(page);
  await page.evaluate(() => window.__flowstate!.getState().select([], ['e4', 'e5']));
  await rightClickArrow(page, 'e4', { x: 290, y: -60 });
  await page.getByRole('menuitemcheckbox', { name: "Don't merge" }).click();
  expect((await board(page)).edges.map((e) => e.separate)).toEqual([true, true]);
  await expect(pathOf(page, 'e4')).toHaveAttribute('d', /^M185\.5 24/);
  await expect(pathOf(page, 'e5')).toHaveAttribute('d', /^M185\.5 48/);
  expect(await history(page)).toBe(1);
});

test("Don't merge moves an arrow off a line it shares and leaves the other arrow alone", async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'C', x: 400, y: 300 });
    const e = addStep(b, { title: 'E', x: 0, y: 200 });
    const f = addStep(b, { title: 'F', x: 400, y: 500 });
    connect(b, { source: a, target: c });
    connect(b, { source: e, target: f });
  });
  await open(page, p);
  await resetZoom(page);
  const shared = await pathOf(page, 'e5').getAttribute('d');
  await rightClickArrow(page, 'e6', { x: 240, y: 236 });
  await page.getByRole('menuitemcheckbox', { name: "Don't merge" }).click();
  await expect(pathOf(page, 'e6')).toHaveAttribute('d', 'M185.5 236L 286,236Q 300,236 300,250L 300,522Q 300,536 314,536L394.5 536');
  await expect(pathOf(page, 'e5')).toHaveAttribute('d', shared!);
});

test('Route around boxes takes the arrow around a box between its ends', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'In the way', x: 300, y: 0 });
    const c = addStep(b, { title: 'C', x: 600, y: 0 });
    connect(b, { source: a, target: c });
  });
  await open(page, p);
  await resetZoom(page);
  await rightClickArrow(page, 'e4', { x: 240, y: 36 });
  await page.getByRole('menuitem', { name: 'Route around boxes' }).click();
  const b = await board(page);
  const points = [{ x: 185.5, y: 36 }, ...b.edges[0].bends, { x: 594.5, y: 36 }];
  expect(points.length).toBeGreaterThan(2);
  const cutsBox = points.slice(1).some((q, i) => {
    const p0 = points[i];
    const [x0, x1] = [Math.min(p0.x, q.x), Math.max(p0.x, q.x)];
    const [y0, y1] = [Math.min(p0.y, q.y), Math.max(p0.y, q.y)];
    return x0 < 480 && x1 > 300 && y0 < 72 && y1 > 0;
  });
  expect(cutsBox).toBe(false);
});

test('Delete arrow from the menu removes it', async ({ page, request }) => {
  const p = await seed(request, pair);
  await open(page, p);
  await resetZoom(page);
  await rightClickArrow(page, 'e3', { x: 240, y: 36 });
  await page.getByRole('menuitem', { name: 'Delete arrow' }).click();
  expect((await board(page)).edges).toEqual([]);
});
```

Notes:
- `(240, 36)` is on the arrow between the two boxes, away from the label at `(290, 36)`.
- In the "off a line" test, the arrows `e5` (A to C) and `e6` (E to F) both run a vertical at x = 290 and overlap between y = 236 and 336; `(240, 236)` is on `e6`'s first leg.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx playwright test tests/e2e/arrows.spec.ts --workers=2 -g "menu|Don't merge|Route around|Delete arrow|bend here"`
Expected: FAIL. A right-click on an arrow opens no menu (today's `useCanvasMenu` returns early on `.react-flow__edge`), and a right-click on a label opens the pane menu.

- [ ] **Step 3: Compute one arrow's route on demand**

Append to `src/canvas/arrowRoutes.ts`:

```ts
export function routeFor(board: Board, edgeId: string): Route | undefined {
  return arrowRoutes(board, new Map()).get(edgeId);
}
```

It routes the whole board with a fresh cache, because a separate arrow's attach point depends on its neighbours. It runs once per menu action, never during a drag.

- [ ] **Step 4: Write the menu entries**

In `src/canvas/menu/entries.tsx`:
- After the `../../ops/arrange` import add:

```ts
import { addBend, removeBend, resetPath, routeAround, setSeparate } from '../../ops/arrowPath';
import { deleteEdges } from '../../ops/edges';
```

- Replace the `../commands` import with:

```ts
import { routeFor } from '../arrowRoutes';
import { arrangeSelection, copySelection, cutSelection, duplicateSelection, pasteClipboard, removeSelection, run } from '../commands';
import { requestFocus } from '../focusKey';
```

- Append:

```tsx
function routeAroundArrows(boardId: string, ids: string[]): void {
  const missed = run(boardId, (b) => ids.filter((id) => !routeAround(b, id)));
  if (missed?.length) notify(ids.length === 1 ? 'No route found around the boxes.' : `No route found around the boxes for ${missed.length} of ${ids.length} arrows.`);
}

export function arrowEntries(boardId: string, edgeId: string, at: XY, bend: number | null): MenuEntry[] {
  const st = flowStore.getState();
  const board = st.project.boards.find((b) => b.id === boardId);
  const edge = board?.edges.find((e) => e.id === edgeId);
  if (!board || !edge) return [];
  const ids = st.edgeSelection.includes(edgeId) ? st.edgeSelection : [edgeId];
  const shaped = board.edges.some((e) => ids.includes(e.id) && e.bends.length > 0);
  const removeEntry: MenuEntry[] = bend === null ? [] : [{ kind: 'item', label: 'Remove bend', run: () => run(boardId, (b) => removeBend(b, edgeId, bend)) }];
  return [
    {
      kind: 'item',
      label: 'Edit label',
      run: () => {
        requestFocus(`label:${edgeId}`);
        flowStore.getState().select([], [edgeId]);
      },
    },
    { kind: 'item', label: "Don't merge", checked: edge.separate, run: () => run(boardId, (b) => setSeparate(b, ids, !edge.separate)) },
    {
      kind: 'item',
      label: 'Add bend here',
      run: () => {
        const route = routeFor(board, edgeId);
        if (route) run(boardId, (b) => addBend(b, edgeId, at, route.points));
      },
    },
    ...removeEntry,
    { kind: 'item', label: 'Route around boxes', run: () => routeAroundArrows(boardId, ids) },
    { kind: 'item', label: 'Reset path', disabled: !shaped, run: () => run(boardId, (b) => resetPath(b, ids)) },
    { kind: 'sep' },
    {
      kind: 'item',
      label: 'Delete arrow',
      shortcut: 'Del',
      run: () => {
        run(boardId, (b) => deleteEdges(b, ids));
        flowStore.getState().select([]);
      },
    },
  ];
}
```

`run` wraps a single `changeBoard` in `runSafely`, so each item is one undo step and a refusal becomes a toast. When every arrow fails to route, the board is unchanged and no undo entry is made.

- [ ] **Step 5: Send arrow right-clicks to the arrow menu**

In `src/canvas/menu/useCanvasMenu.tsx`:
- Change `import { nodeEntries, paneEntries } from './entries';` to `import { arrowEntries, nodeEntries, paneEntries } from './entries';`.
- Add above `export function useCanvasMenu(`:

```ts
function arrowAt(target: Element): { edgeId: string; bend: number | null } | null {
  const edgeId = target.closest('[data-edge]')?.getAttribute('data-edge') ?? target.closest('.react-flow__edge')?.getAttribute('data-id');
  if (!edgeId) return null;
  const bend = target.closest('.fs-arrow-bend')?.getAttribute('data-bend');
  return { edgeId, bend: bend ? Number(bend) : null };
}
```

- In `onUp`, replace:

```ts
      if (e.target.closest('.react-flow__edge, .react-flow__minimap, .react-flow__controls')) return;
      const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = e.target.closest('.react-flow__node')?.getAttribute('data-id');
      const st = flowStore.getState();
```

with:

```ts
      if (e.target.closest('.react-flow__minimap, .react-flow__controls')) return;
      const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = e.target.closest('.react-flow__node')?.getAttribute('data-id');
      const st = flowStore.getState();
      const arrow = arrowAt(e.target);
      if (arrow) {
        if (!st.edgeSelection.includes(arrow.edgeId)) st.select([], [arrow.edgeId]);
        setMenu({ at: { x: e.clientX, y: e.clientY }, entries: arrowEntries(boardId, arrow.edgeId, at, arrow.bend), n: ++opens.current });
        return;
      }
```

The handles from Tasks 8 and 9 already carry `data-edge`. A right-click on a handle is not a drag: the handles only start drags for button 0.

- [ ] **Step 6: Mark the label**

In `src/canvas/FlowEdge.tsx`, add `data-edge={id}` to the label `div`:

```tsx
          <div className={`fs-edge-label nodrag nopan ${dimmed ? 'is-dimmed' : ''}`} data-edge={id} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
```

- [ ] **Step 7: Run the tests**

Run: `npx playwright test tests/e2e/arrows.spec.ts --workers=2`
Expected: all PASS.

Run: `npx playwright test tests/e2e/assists.spec.ts --workers=2`
Expected: all PASS (the existing pane and node menu tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/canvas/arrowRoutes.ts src/canvas/menu/entries.tsx src/canvas/menu/useCanvasMenu.tsx src/canvas/FlowEdge.tsx tests/e2e/arrows.spec.ts
git commit -m "Open an arrow menu on arrows, their labels and handles"
```

Body: Don't merge, add and remove bend, route around boxes, reset path and delete, applied to every selected arrow in one undo step.

---

### Task 17: The assistant's `update_arrows` tool

**Files:**
- Modify: `src/ai/schemas.ts:2` (import `SIDES`), `:79` (add `update_arrows` after `disconnect`)
- Modify: `src/ai/toolDefs.ts:12` (description after `disconnect`)
- Modify: `src/ai/executor.ts:5-11` (imports), `:162` (handler before `insert_between`)
- Modify: `src/ai/stats.ts` (`arrowsUpdated`)
- Modify: `server/chat.test.ts:91` (tool count 17 to 18)
- Test: `src/ai/executor.test.ts`, `src/ai/stats.test.ts`

**Interfaces:**
- Consumes: `reattach`, `resetPath`, `routeAround`, `setSeparate` (Tasks 7 and 15); `getEdge` from `src/ops/query.ts`; the executor's `Handler`, `ToolContext` and `setup()` test helper.
- Produces:
  - tool `update_arrows` with input `{ board?: string; links: Array<{ from: string; to: string; type?: EdgeType }>; from_side?: Side; to_side?: Side; separate?: boolean; reset_path?: boolean; route_around?: boolean }` (spec section 7)
  - `StatKey` gains `'arrowsUpdated'`, described as "N arrow(s) redrawn"

Mapping (following `connect` and `disconnect` in `src/ai/executor.ts`):
- Each link matches every arrow from `from` to `to`, or only those of `type` when given. A link that matches nothing fails with `connect`'s wording, "`s2` is not connected to `s1`.", and the whole call changes nothing.
- `from_side` and `to_side` go through `reattach` on the same step, so bends are kept. `reset_path` clears bends. `route_around` routes each arrow and fails the call if one cannot be routed. `separate` sets or clears "Don't merge".
- A call with nothing to change fails with a message that lists the options.
- The whole call is one `ctx.changeBoard`, so one undo step, like every other tool.
- There is no way to pass bends; zod drops unknown keys, so an attempt is ignored.

- [ ] **Step 1: Write the failing tests**

In `src/ai/executor.test.ts`, add `import { connect } from '../ops/edges';` after the `applyTidy` import, and insert this block just before `describe('board pinning', () => {`:

```ts
describe('update_arrows', () => {
  const BENDS = [{ x: 300, y: 36 }, { x: 300, y: 236 }];
  const shaped = (b: Board) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: 400, y: 200 });
    connect(b, { source: a, target: c });
    connect(b, { source: a, target: c, type: 'dependency' });
    b.edges[0].bends = BENDS;
  };

  it('moves ends to other sides, keeps the bends and marks arrows separate in one undo step', async () => {
    const { run, active, store } = setup(shaped);
    const before = store.getState().past.length;
    const out = await run('update_arrows', { links: [{ from: 's1', to: 's2', type: 'flow' }], from_side: 'bottom', to_side: 'top', separate: true });
    expect(out).toMatchObject({ ok: true, stats: { arrowsUpdated: 1 }, touched: ['s1', 's2'] });
    expect(active().edges[0]).toMatchObject({ sourceSide: 'bottom', targetSide: 'top', separate: true, bends: BENDS });
    expect(active().edges[1]).toMatchObject({ sourceSide: null, separate: false });
    expect(store.getState().past.length).toBe(before + 1);
  });

  it('matches every arrow between the pair when no type is given', async () => {
    const { run, active } = setup(shaped);
    await run('update_arrows', { links: [{ from: 's1', to: 's2' }], separate: true });
    expect(active().edges.map((e) => e.separate)).toEqual([true, true]);
  });

  it('resets a hand-shaped arrow and routes another around a step in the way', async () => {
    const { run, active } = setup((b) => {
      shaped(b);
      addStep(b, { title: 'In the way', x: 800, y: 0 });
      const e = addStep(b, { title: 'E', x: 1100, y: 0 });
      connect(b, { source: 's1', target: e });
    });
    await run('update_arrows', { links: [{ from: 's1', to: 's2', type: 'flow' }], reset_path: true });
    expect(active().edges[0].bends).toEqual([]);
    const out = await run('update_arrows', { links: [{ from: 's1', to: 's6' }], route_around: true });
    expect(out.ok).toBe(true);
    expect(active().edges[2].bends.length).toBeGreaterThan(0);
  });

  it('refuses an unknown pair or an empty change and leaves the board untouched', async () => {
    const { run, store } = setup(shaped);
    const before = store.getState().project;
    expect((await run('update_arrows', { links: [{ from: 's2', to: 's1' }], separate: true })).content).toContain('s2 is not connected to s1.');
    expect((await run('update_arrows', { links: [{ from: 's1', to: 's2' }] })).content).toMatch(/Say what to change/);
    expect(store.getState().project).toBe(before);
  });

  it('cannot place bends', async () => {
    const { run, active } = setup(shaped);
    const out = await run('update_arrows', { links: [{ from: 's1', to: 's2', type: 'dependency' }], bends: [{ x: 0, y: 0 }], separate: true });
    expect(out.ok).toBe(true);
    expect(active().edges[1]).toMatchObject({ separate: true, bends: [] });
  });
});
```

Ids: `A` is `s1`, `B` is `s2`, the flow arrow `e3`, the dependency arrow `e4`; in the third test the blocking step is `s5`, `E` is `s6` and the new arrow is the third edge.

In `src/ai/stats.test.ts`, add inside `describe('stats', ...)`:

```ts
  it('describes redrawn arrows', () => {
    expect(describeStats({ arrowsUpdated: 1 })).toBe('1 arrow redrawn');
    expect(describeStats({ arrowsAdded: 1, arrowsUpdated: 2 })).toBe('1 arrow added, 2 arrows redrawn');
  });
```

In `server/chat.test.ts` line 91, change `toHaveLength(17)` to `toHaveLength(18)`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ai server/chat.test.ts`
Expected: FAIL. `update_arrows` comes back as `Unknown tool "update_arrows".`, `describeStats` ignores `arrowsUpdated`, and the server still sends 17 tools.

- [ ] **Step 3: Add the schema**

In `src/ai/schemas.ts`, change line 2 to:

```ts
import { ACTORS, EDGE_TYPES, FLAG_KINDS, SHAPES, SIDES, STATUSES } from '../model/types';
```

and after the `disconnect` entry add:

```ts
  update_arrows: z.object({
    board,
    links: z.array(z.object({ from: id, to: id, type: z.enum(EDGE_TYPES).optional() })).min(1),
    from_side: z.enum(SIDES).optional().describe('Side of the "from" step the arrow leaves.'),
    to_side: z.enum(SIDES).optional().describe('Side of the "to" step the arrow enters.'),
    separate: z.boolean().optional().describe('true: the arrow gets its own line instead of sharing one. false: it may share again.'),
    reset_path: z.boolean().optional().describe('true: drop hand-drawn bends and route the arrow automatically.'),
    route_around: z.boolean().optional().describe('true: find a path around the steps in the way and keep it.'),
  }),
```

- [ ] **Step 4: Describe the tool**

In `src/ai/toolDefs.ts`, after the `disconnect` description add:

```ts
  update_arrows:
    'Change how existing arrows are drawn without adding or removing any. from_side and to_side move where each arrow leaves and enters its steps. separate true gives each arrow its own line instead of sharing one with other arrows. reset_path drops hand-drawn bends, and route_around finds a path around the steps in the way. You cannot place bends.',
```

- [ ] **Step 5: Add the stat**

In `src/ai/stats.ts`:
- In `StatKey`, after `| 'arrowsRemoved'` add `| 'arrowsUpdated'`.
- In `PHRASES`, after the `arrowsRemoved` entry add:

```ts
  ['arrowsUpdated', (n) => `${plural(n, 'arrow', 'arrows')} redrawn`],
```

- [ ] **Step 6: Add the handler**

In `src/ai/executor.ts`:
- After the `../ops/arrange` import add `import { reattach, resetPath, routeAround, setSeparate } from '../ops/arrowPath';`.
- Change `import { findEdge } from '../ops/query';` to `import { findEdge, getEdge } from '../ops/query';`.
- In `handlers`, before `insert_between:` add:

```ts
  update_arrows: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const { from_side, to_side, separate, reset_path, route_around } = input;
      if (!from_side && !to_side && separate === undefined && !reset_path && !route_around) {
        throw new OpError('Say what to change: from_side, to_side, separate, reset_path or route_around.');
      }
      const ids = input.links.flatMap((l) => {
        const found = b.edges.filter((e) => e.source === l.from && e.target === l.to && (!l.type || e.type === l.type));
        if (!found.length) throw new OpError(`${l.from} is not connected to ${l.to}.`);
        return found.map((e) => e.id);
      });
      for (const id of ids) {
        const e = getEdge(b, id);
        if (from_side) reattach(b, id, 'source', e.source, from_side);
        if (to_side) reattach(b, id, 'target', e.target, to_side);
        if (reset_path) resetPath(b, [id]);
        if (route_around && !routeAround(b, id)) throw new OpError(`No route found around the steps for ${e.source} -> ${e.target}.`);
      }
      if (separate !== undefined) setSeparate(b, ids, separate);
      return { result: { updated: ids }, touched: input.links.flatMap((l) => [l.from, l.to]), stats: { arrowsUpdated: ids.length } };
    }),

```

A throw inside `changeBoard` discards the whole draft, which is what makes a bad link leave the board untouched.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/ai server`
Expected: all PASS, including `src/ai/toolDefs.test.ts` (one schema and description per tool, no em dashes).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/ai/schemas.ts src/ai/toolDefs.ts src/ai/executor.ts src/ai/executor.test.ts src/ai/stats.ts src/ai/stats.test.ts server/chat.test.ts
git commit -m "Let the assistant move arrow ends, separate arrows and route around steps"
```

---

### Task 18: Board summary markers and the Tidy prompt line

**Files:**
- Modify: `src/analysis/summary.ts:51` (arrow line)
- Modify: `src/ai/systemPrompt.ts:10` (one line after the tidy line)
- Test: `src/analysis/summary.test.ts`, `src/ai/toolDefs.test.ts`

**Interfaces:**
- Consumes: `BoardEdge.separate`, `BoardEdge.bends` (Task 1).
- Produces: arrow lines in the board summary end their type and label with ` separate` and/or ` hand-shaped` when those apply, before any flags; `SYSTEM_PROMPT` contains "Tidy resets hand-shaped arrows".

- [ ] **Step 1: Write the failing tests**

In `src/analysis/summary.test.ts`, add `import { connect } from '../ops/edges';` before the `../ops/flags` import, and add inside `describe('summarizeBoard', ...)`:

```ts
  it('marks separate and hand-shaped arrows', () => {
    const project = createProject('P');
    const b = project.boards[0];
    const s1 = addStep(b, { title: 'A', x: 0, y: 0 });
    const s2 = addStep(b, { title: 'B', x: 400, y: 0 });
    const s3 = addStep(b, { title: 'C', x: 400, y: 200 });
    connect(b, { source: s1, target: s2 });
    connect(b, { source: s1, target: s3 });
    b.edges[0].separate = true;
    b.edges[1].bends = [{ x: 300, y: 36 }];
    const text = summarizeBoard(project, b.id);
    expect(text).toContain('e4: s1 -> s2 flow separate');
    expect(text).toContain('e5: s1 -> s3 flow hand-shaped');
  });
```

In `src/ai/toolDefs.test.ts`, add inside `describe('tool definitions', ...)`:

```ts
  it('tells the assistant that Tidy resets hand-shaped arrows', () => {
    expect(SYSTEM_PROMPT).toContain('Tidy resets hand-shaped arrows');
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/analysis/summary.test.ts src/ai/toolDefs.test.ts`
Expected: FAIL on both new tests. The existing exact-match summary test keeps passing, because arrows without either marker print as before.

- [ ] **Step 3: Add the markers**

In `src/analysis/summary.ts`, replace:

```ts
      lines.push(`${e.id}: ${e.source} -> ${e.target} ${e.type}${e.label ? ` ${q(e.label)}` : ''}${describeFlags(e.flags)}`);
```

with:

```ts
      const drawn = `${e.separate ? ' separate' : ''}${e.bends.length ? ' hand-shaped' : ''}`;
      lines.push(`${e.id}: ${e.source} -> ${e.target} ${e.type}${e.label ? ` ${q(e.label)}` : ''}${drawn}${describeFlags(e.flags)}`);
```

- [ ] **Step 4: Add the prompt line**

In `src/ai/systemPrompt.ts`, after the line that starts `- Never supply coordinates;`, add:

```
- Tidy resets hand-shaped arrows (marked hand-shaped in the summary) to automatic routes.
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/analysis src/ai`
Expected: all PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/analysis/summary.ts src/analysis/summary.test.ts src/ai/systemPrompt.ts src/ai/toolDefs.test.ts
git commit -m "Mark separate and hand-shaped arrows for the assistant"
```

---

### Task 19: ADRs, docs and full verification

**Files:**
- Create: `docs/adr/0014-flowstate-routes-its-own-arrows.md`, `docs/adr/0015-arrow-routing-performance-budget.md`
- Modify: `docs/adr/README.md` (two index rows)
- Modify: `README.md` (Keys table, Known limits)
- Modify: `PROJECT_STATUS.md`

**Interfaces:**
- Consumes: the controller's notes from Task 6, the budget numbers in the Task 13 commit body, the Task 11 playtest findings, `BASELINE` in `tests/e2e/perf.spec.ts`.
- Produces: the decision records and living docs for this feature.

- [ ] **Step 1: Write ADR 0014**

Create `docs/adr/0014-flowstate-routes-its-own-arrows.md`, following the format of `docs/adr/0005-undo-ignored-during-open-transactions.md`:

```markdown
# 0014: Flowstate routes its own arrows

Status: Accepted (2026-09-27)

## Context
The arrow routing spec (`docs/superpowers/specs/2026-09-27-arrow-routing-design.md`) needs arrows that attach to any side dot, stay off shared lines when marked "Don't merge", and keep bends the user placed. React Flow's smooth-step edge draws from two handle positions only: it has no bends, and one edge cannot see the others. Existing boards had to look the same after the change.

## Decision
- Pure modules in `src/layout/route/` compute each arrow's corner points from board data, and `FlowEdge` draws them. React Flow still receives `sourceHandle` and `targetHandle`, so it still decides whether an edge renders.
- Automatic arrows use `elbow.ts`, a line-for-line port of `getPoints` in `@xyflow/system`. An arrow starts `PORT_OUTSET` (5.5px) outside its box, where React Flow anchored it at device pixel ratio 1.
- `src/canvas/arrowRoutes.ts` caches each route on the arrow and its two boxes, so a drag re-routes only the arrows attached to moving boxes.
- Bends are absolute canvas points. A segment drag and "Add bend here" turn every corner of the drawn route into bends. "Add bend here" keeps its new point although it is collinear, until the next edit of that arrow; every other edit removes collinear points.
- "Don't merge": separate ends on one side are spread evenly, ordered by their other end. With shared arrows on that side, each separate end takes the half of the side that faces its other end. Only automatic separate arrows shift off shared lines; hand-shaped ones are drawn through their bends as placed.
- Handles draw in a `ViewportPortal` above the nodes, because the end circles sit on the side dots, and show only while the arrow is the only selected item. Handle drags listen on `window`, because a segment that lines up with its neighbour vanishes mid-drag along with its bar.

Rejected:
- React Flow's reconnectable edges: they move ends only, and their anchors sit under the node layer, beside the side dots.
- Computing paths inside `FlowEdge` from React Flow's handle positions: no board-wide view for "Don't merge", and no cache shared across edges.
- A routing library: a new dependency for orthogonal routes with user bends, which small pure modules cover.

## Consequences
- A React Flow upgrade can change `getSmoothStepPath`. `src/layout/route/elbow.test.ts` compares `elbow.ts` with the installed version for all 16 side pairs and fails if they drift.
- `PORT_OUTSET` depends on the `.fs-handle` size and border. At device pixel ratio 2, React Flow's own anchor would sit 0.5px further out, which is not visible. `tests/e2e/arrows.spec.ts` checks the anchor against the real dot.
- Arrows to a free text box still do not render, because text boxes have no side dots.
- Tidy clears every bend (one undo restores them). The assistant is told so, and cannot place bends.
```

- [ ] **Step 2: Write ADR 0015**

Create `docs/adr/0015-arrow-routing-performance-budget.md`:

```markdown
# 0015: Arrow routing is held to a measured drag and load budget

Status: Accepted (2026-09-27)

## Context
The arrow routing spec (section 4) makes performance a hard requirement. On a board of 200 steps, 200 arrows and 20 separate arrows, routing may add at most 2ms to the p95 drag frame, and opening a 200-arrow board may take at most 10% longer. The spec also defines two scale-back steps if the budget is missed, each needing an ADR.

## Decision
- `tests/e2e/perf.spec.ts` builds that board (`routingBoard`), measures three drags and three page opens after a warm-up, and compares their medians with `BASELINE`, measured before any routing change on the development machine: drag p95 33.4ms, open 478ms.
- The budget assertions run when `PERF_BUDGET` is set, because the baselines belong to one machine. The plan's checkpoints and final verification ran them.
- Frame times land on the 60Hz grid (about 16.7, 33.4 or 50ms), so the 2ms margin means the drag must not drop to a slower frame cadence.
- Only separate arrows trigger the board-wide pass, and it compares an arrow only with arrows whose bounding box comes within 30px of its own.
- No scale-back was needed. After drawing (slice 1) the medians were 33.4ms and 481ms; with "Don't merge" (slice 3) they were 33.4ms and 478ms.

Rejected:
- Always enforcing the budget: the baselines would fail on any other machine.
- Timing only the routing functions in unit tests: that misses the rendering cost the user feels.

## Consequences
- A change to routing reruns the budget before merging: `PERF_BUDGET=1 npx playwright test tests/e2e/perf.spec.ts -g "routing budget" --workers=1`.
- On a new machine, re-measure as in the arrow routing plan's Task 0 and update `BASELINE`.
```

Before saving, replace the numbers with the recorded ones:
- `33.4ms` and `478ms` in the first bullet: the `BASELINE` values in `tests/e2e/perf.spec.ts`.
- The last Decision bullet: the medians from the Task 6 notes (slice 1) and the Task 13 commit body (slice 3).
- If a scale-back was taken, replace the last Decision bullet with the matching text below, filled with the recorded numbers, and add the scale-back to Consequences:
  - Step 1: "Scale-back step 1 was taken after slice 1 (drag p95 median Xms, open Yms): automatic arrows without `separate` are drawn with React Flow's `getSmoothStepPath` again, and only edited or separate arrows use our routes."
  - Step 2: "Scale-back step 2 was taken after "Don't merge" (drag p95 median Xms, open Yms): separate arrows keep their spread attach points, and the sideways line shift was removed."

Add both rows to `docs/adr/README.md`:

```markdown
| [0014](0014-flowstate-routes-its-own-arrows.md) | Flowstate routes its own arrows | Accepted |
| [0015](0015-arrow-routing-performance-budget.md) | Arrow routing is held to a measured drag and load budget | Accepted |
```

- [ ] **Step 3: Update the README**

In `README.md`:
- In the Keys table, after the row `| Ctrl+drag, Ctrl+Shift+drag | Drop a copy, or copy in a straight line |`, add:

```markdown
| Drag an arrow's end circle to a side dot | Attach that end there, on the same step or another |
| Drag an arrow's bar or square (Alt: no snapping) | Reshape the arrow; each drag is one undo |
| Right-click an arrow or its label | Don't merge, add or remove a bend, route around boxes, reset the path |
```

- Under "Known limits", add:

```markdown
- Tidy (L) resets hand-shaped arrows to automatic routes; one Ctrl+Z brings them back.
```

- [ ] **Step 4: Update PROJECT_STATUS**

In `PROJECT_STATUS.md`:
- Set `**As of:**` to 2026-09-27.
- Under "Complete", add: "Arrow routing: attach an arrow to any side dot, "Don't merge" for its own line, hand-shaped arrows with segment bars and bend squares, route around boxes, an arrow right-click menu, and the assistant's `update_arrows`, within the measured drag and load budget (ADR 0014, ADR 0015). Built on `feat/arrow-routing`; awaiting the final playtest and merge."
- Under "In flight", add: "Final playtest of arrow routing ("Don't merge", route around boxes, the arrow menu, the assistant's `update_arrows`), then merge `feat/arrow-routing`."
- Under "Layout assists follow-ups", delete "The `XY` type is defined three times." (Task 1 fixed it) and change "Right-clicking the node toolbar or an edge label opens the pane menu." to "Right-clicking the node toolbar or the arrow toolbar opens the pane menu."
- Under "Ideas and deferred", add each Task 11 finding that was parked rather than fixed, one line each.
- Add a Timeline row: `| 2026-09-27 | Arrow routing specced, planned and built on `feat/arrow-routing` |`

- [ ] **Step 5: Full verification**

Run each and read the output:

```bash
npm run typecheck
npx vitest run
npm run build
```

Expected: no type errors; every unit test passes (about 375, up from 296 before this plan); the build succeeds.

Then the browser suites, one at a time, two workers at most:

```bash
npx playwright test tests/e2e/arrows.spec.ts --workers=2
npx playwright test tests/e2e/assists.spec.ts --workers=2
npx playwright test tests/e2e/interactions.spec.ts tests/e2e/keyboard.spec.ts --workers=2
npx playwright test tests/e2e/canvas.spec.ts tests/e2e/workspace.spec.ts tests/e2e/export.spec.ts tests/e2e/smoke.spec.ts --workers=2
npx playwright test tests/e2e/chat.spec.ts tests/e2e/live.spec.ts --workers=2
npx playwright test tests/e2e/perf.spec.ts --workers=1
```

Expected: all PASS, with `live.spec.ts` skipped (never set `LIVE_API`). If a worker crashes with 0xC0000409, rerun that suite once.

Then the budget with assertions active (Global Constraints, "Budget" command). Expected: both routing budget tests PASS.

- [ ] **Step 6: Runtime smoke test**

1. Check whether a dev server is already listening on 5173 (PowerShell: `Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue`). If so, use it and leave it running. Otherwise start `npm run dev` in the background and stop only that process at the end.
2. Open http://localhost:5173, create two steps and an arrow, drag its end to another side, drag a segment, undo each.
3. Right-click the arrow: Don't merge, Add bend here, drag the new bend, Remove bend, Reset path.
4. Put a step between two connected steps and use Route around boxes.
5. Do not send a chat message unless the user approves spending API credit; if not approved, say that the assistant tool was verified by `src/ai/executor.test.ts` only.

- [ ] **Step 7: Ask for the final human playtest**

Send the user this list and wait for the answer before calling the feature done:
1. Mark two arrows leaving the same side "Don't merge". Do they spread apart without crossing at the box?
2. Mark an arrow that shares a line "Don't merge". Does it move off the line, and does the other arrow stay put?
3. Use Route around boxes on an arrow that runs under a step. Is the route sensible? On a crowded board, does it ever say it found no route when one obviously exists?
4. Select several arrows and use Reset path or Don't merge from the menu. Is it one Ctrl+Z?
5. Right-click an arrow's label. Is it the arrow menu?
6. If you approve the API cost: ask the assistant "attach the arrow from A to B to the bottom of A" and "give the arrows out of C their own lines".
7. Anything that looks wrong on your existing boards?

- [ ] **Step 8: Commit**

```bash
git add docs/adr/0014-flowstate-routes-its-own-arrows.md docs/adr/0015-arrow-routing-performance-budget.md docs/adr/README.md README.md PROJECT_STATUS.md
git commit -m "docs: ADRs 0014 and 0015 and status for arrow routing"
```

Do not push. Pushing and merging `feat/arrow-routing` need the user's explicit go-ahead.
