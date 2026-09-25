# Flowstate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local, keyboard-first infinite-canvas flowchart app for redesigning processes into agentic workflows, with a Claude chat that can make any edit a human can.

**Architecture:** Vite + React SPA with the board held in a Zustand store as an immutable `Project`. Every mutation runs through pure operations in `src/ops/` (called from the keyboard, mouse, and the AI tool executor alike). A small Hono server on `127.0.0.1` stores projects as JSON files and proxies Claude streaming calls so the API key never reaches the browser. The AI agent loop runs in the browser and applies each tool call as it arrives.

**Tech Stack:** Node 24, TypeScript (strict), React 19, Vite 8, `@xyflow/react` 12, `elkjs` 0.12, Zustand 5, Immer 11, zod 4, Hono 4 + `@hono/node-server` 2, `@anthropic-ai/sdk` 0.128, `html-to-image`, `lucide-react`, `@fontsource-variable/inter`, Vitest 5, Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-25-flowstate-design.md`

## Global Constraints

- Node 24+, ESM (`"type": "module"`), TypeScript `strict: true`.
- Every package install is prefixed with `sfw` (for example `sfw npm install zod`).
- Never use em dashes anywhere: code, comments, UI copy, docs, commit messages.
- Comments are a last resort: at most three lines, never restating the code.
- Commit messages carry no `Co-Authored-By` lines.
- Models: `claude-sonnet-5` (default) and `claude-opus-5-5` only.
- The Anthropic API key lives only in `.env` and is read only by the server. The server binds `127.0.0.1`.
- Durations are working time: `1d` = 8h = 480 minutes, `1w` = 5d = 2400 minutes.
- IDs per board, from `board.nextId`: steps `s#`, text `t#`, groups `g#`, edges `e#`, lanes `l#`, flags `f#`. Board ids are `b` + nanoid(10). Project ids are nanoid(10), matching `/^[A-Za-z0-9_-]{1,64}$/`.
- Every board mutation goes through a function in `src/ops/` invoked via `store.change` or `store.changeBoard`. UI components never mutate a `Project` directly.
- Colours come only from CSS custom properties in `src/ui/theme.css`, defined for light and dark themes.
- Undo history is capped at 200 entries. A drag, a title-typing session, a tidy, and a whole AI turn are one entry each.
- No modal dialogs for everyday editing. The floating toolbar and inline editors are the editing surface.
- Default step sizes (w x h): process 180x72, decision 150x110, terminal 160x56, data 180x72, document 180x80, database 140x90, preparation 180x72, connector 48x48, sticky 180x140. Text 220x44. Group minimum 240x160.
- Layout gaps: `GAP_MAIN = 72` along the flow direction, `GAP_CROSS = 40` across it. Default lane thickness 240.
- Dev ports: web 5173, API 8787. E2E ports: web 5174, API 8788, workspace `.e2e-workspace`.

## Review Focus

1. **No API key on first run.** `/api/chat` answers 503 with "ANTHROPIC_API_KEY is not set. Add it to .env and restart the dev server.", and the chat shows that text instead of spinning. Pinned in Task 17 and Task 18.
2. **Rework loops.** Business processes loop back ("rejected, return to Review"). The critical path must ignore loop-closing arrows, report how many it ignored, and never hang. Pinned in Task 7.
3. **The AI references a step that does not exist** (a stale id, or a title instead of an id). The tool returns a readable error naming valid options, the board is unchanged, and Claude can retry. Pinned in Task 16.
4. **User edits while an AI turn is running.** Canvas edits during a turn succeed, land in the turn's single undo entry, and later AI tool calls on a step the user deleted return "Unknown step" rather than crashing the loop. Pinned in Task 18.
5. **Autosave fails** (server stopped, file locked by antivirus on Windows). The status shows "Save failed, retrying", the save retries, nothing is silently lost, and a corrupt project file is never overwritten. Pinned in Task 9 and Task 10.

## File Map

```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, playwright.config.ts, index.html, .env.example, .gitignore, README.md
docs/adr/          0001 to 0003
server/
  main.ts          process entry: env, storage dir, Anthropic client, listen on 127.0.0.1
  app.ts           createApp(deps): Hono routes and error mapping
  storage.ts       file-backed project storage with atomic writes
  chat.ts          /api/chat SSE proxy to Claude
src/
  main.tsx, App.tsx, boot.ts
  model/           types.ts, factory.ts, duration.ts, migrate.ts
  layout/          geometry.ts, place.ts, tidy.ts, elkClient.ts, tidyBoard.ts
  ops/             errors.ts, query.ts, run.ts, steps.ts, edges.ts, structure.ts, lanes.ts, groups.ts, flags.ts, text.ts, clipboard.ts, board.ts, testkit.ts
  analysis/        criticalPath.ts, summary.ts
  store/           store.ts, autosave.ts
  api/             projects.ts
  canvas/          Canvas.tsx, toFlow.ts, ShapeSvg.tsx, labels.tsx, StepNode.tsx, StepTitle.tsx, TextNode.tsx, GroupNode.tsx, LaneNode.tsx,
                   FlowEdge.tsx, FlagBadges.tsx, FlagList.tsx, AddHandles.tsx, FloatingToolbar.tsx, EdgeToolbar.tsx, useKeyboard.ts,
                   navigate.ts, viewport.ts, useThemeColors.ts, reveal.ts, cursor.ts, focusKey.ts, safe.ts, canvas.css
  ui/              theme.css, theme.ts, ui.css, toast.ts, Toasts.tsx, controls.tsx, Popover.tsx, TopBar.tsx, ProjectMenu.tsx, BoardTabs.tsx,
                   FlagsButton.tsx, CriticalPathButton.tsx, ExportMenu.tsx, Palette.tsx, ZoomBar.tsx, CanvasArea.tsx
  io/              download.ts, exportImage.ts, exportJson.ts
  ai/              schemas.ts, toolDefs.ts, systemPrompt.ts, stats.ts, executor.ts, storeContext.ts
  chat/            sse.ts, agentLoop.ts, context.ts, chatStore.ts, send.ts, Composer.tsx, ChatPanel.tsx, useChatShortcuts.ts, chat.css
tests/e2e/         fixtures.ts, global-setup.ts, *.spec.ts
```

---

### Task 1: Project scaffold, dev servers, test tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `index.html`, `.gitignore`, `.env.example`
- Create: `server/app.ts`, `server/main.ts`, `server/app.test.ts`
- Create: `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`
- Test: `server/app.test.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: `createApp(deps: AppDeps): Hono` in `server/app.ts` (Task 9 and Task 16 extend `AppDeps`). `npm run dev`, `npm test`, `npm run test:e2e`, `npm run typecheck` scripts.

- [ ] **Step 1: Write `package.json` and install dependencies**

```json
{
  "name": "flowstate",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "concurrently -k -n web,api -c cyan,magenta \"vite\" \"tsx watch server/main.ts\"",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

Run:
```bash
sfw npm install react react-dom @xyflow/react elkjs zustand immer zod nanoid lucide-react html-to-image hono @hono/node-server @anthropic-ai/sdk @fontsource-variable/inter
sfw npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node vitest @playwright/test tsx concurrently
npx playwright install chromium
```

- [ ] **Step 2: Write config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "server", "tests", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.FLOWSTATE_API_PORT ?? '8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
```

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:5174', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npx concurrently -k "vite --port 5174 --strictPort" "tsx server/main.ts"',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    env: { FLOWSTATE_API_PORT: '8788', FLOWSTATE_WORKSPACE: '.e2e-workspace' },
  },
});
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flowstate</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:
```
node_modules/
dist/
workspace/
.e2e-workspace/
.env
test-results/
playwright-report/
```

`.env.example`:
```
ANTHROPIC_API_KEY=
```

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

- [ ] **Step 3: Write the failing server test**

`server/app.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('createApp', () => {
  it('answers the health check', async () => {
    const res = await createApp({}).request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `npx vitest run server/app.test.ts`
Expected: FAIL, cannot resolve `./app`.

- [ ] **Step 5: Implement the server skeleton**

`server/app.ts`:
```ts
import { Hono } from 'hono';

export type AppDeps = Record<string, never>;

export function createApp(_deps: AppDeps): Hono {
  const app = new Hono();
  app.get('/api/health', (c) => c.json({ ok: true }));
  return app;
}
```

`server/main.ts`:
```ts
import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { createApp } from './app';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.FLOWSTATE_API_PORT ?? 8787);
const app = createApp({});

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`Flowstate API on http://127.0.0.1:${port}`);
});
```

- [ ] **Step 6: Run the server test and watch it pass**

Run: `npx vitest run server/app.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the React entry and the e2e smoke test**

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx`:
```tsx
export function App() {
  return <div className="app">Flowstate</div>;
}
```

`tests/e2e/smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test('app loads and the API is reachable through the proxy', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Flowstate');
  const health = await request.get('/api/health');
  expect(await health.json()).toEqual({ ok: true });
});
```

- [ ] **Step 8: Run e2e and typecheck**

Run: `npx playwright test tests/e2e/smoke.spec.ts` then `npm run typecheck`
Expected: 1 passed; typecheck exits 0. If `tsc` from TypeScript 7 rejects an option above, adjust `tsconfig.json` to its error message; do not add ignores.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Scaffold Vite React app, Hono API server, Vitest and Playwright"
```

---

### Task 2: Board model, factories, durations, migration

**Files:**
- Create: `src/model/types.ts`, `src/model/factory.ts`, `src/model/duration.ts`, `src/model/migrate.ts`
- Test: `src/model/duration.test.ts`, `src/model/factory.test.ts`, `src/model/migrate.test.ts`

**Interfaces:**
- Produces (used by every later task):
  - Types `Shape, Actor, Status, NodeKind, EdgeType, Side, FlagKind, Flag, BoardNode, BoardEdge, Lane, Board, Project, Direction` and arrays `SHAPES, ACTORS, STATUSES, EDGE_TYPES, FLAG_KINDS, SIDES`, constant `SCHEMA_VERSION = 1`.
  - `SHAPE_SIZE: Record<Shape, { w: number; h: number }>`, `TEXT_SIZE`, `GROUP_MIN`, `LANE_SIZE = 240`.
  - `newId(): string`, `createBoard(name: string): Board`, `createProject(name?: string): Project`, `allocId(board: Board, prefix: IdPrefix): string`, `makeNode(board: Board, kind: NodeKind, init?: Partial<BoardNode>): BoardNode`, `makeFlag(board: Board, kind: FlagKind, text: string): Flag`.
  - `parseDuration(input: string): number | null` (throws `DurationError` on invalid text), `formatDuration(minutes: number): string`.
  - `migrateProject(raw: unknown): Project` (throws `ProjectFormatError`).

- [ ] **Step 1: Write the types**

`src/model/types.ts`:
```ts
export const SCHEMA_VERSION = 1;

export const SHAPES = ['process', 'decision', 'terminal', 'data', 'document', 'database', 'preparation', 'connector', 'sticky'] as const;
export const ACTORS = ['person', 'system', 'agent'] as const;
export const STATUSES = ['idea', 'planned', 'active', 'done'] as const;
export const EDGE_TYPES = ['flow', 'dependency', 'handoff'] as const;
export const FLAG_KINDS = ['blocker', 'warning', 'question'] as const;
export const SIDES = ['top', 'right', 'bottom', 'left'] as const;

export type Shape = (typeof SHAPES)[number];
export type Actor = (typeof ACTORS)[number];
export type Status = (typeof STATUSES)[number];
export type EdgeType = (typeof EDGE_TYPES)[number];
export type FlagKind = (typeof FLAG_KINDS)[number];
export type Side = (typeof SIDES)[number];
export type NodeKind = 'step' | 'text' | 'group';
export type Direction = 'LR' | 'TB';

export interface Flag {
  id: string;
  kind: FlagKind;
  text: string;
  resolved: boolean;
}

export interface BoardNode {
  id: string;
  kind: NodeKind;
  shape: Shape;
  actor: Actor | null;
  title: string;
  note: string;
  owner: string;
  durationMin: number | null;
  status: Status | null;
  replaces: string;
  laneId: string | null;
  groupId: string | null;
  flags: Flag[];
  color: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardEdge {
  id: string;
  source: string;
  target: string;
  sourceSide: Side | null;
  targetSide: Side | null;
  type: EdgeType;
  label: string;
  flags: Flag[];
}

export interface Lane {
  id: string;
  name: string;
  order: number;
  height: number;
}

export interface Board {
  id: string;
  name: string;
  direction: Direction;
  nodes: BoardNode[];
  edges: BoardEdge[];
  lanes: Lane[];
  nextId: number;
}

export interface Project {
  id: string;
  name: string;
  schemaVersion: number;
  boards: Board[];
}
```

- [ ] **Step 2: Write failing tests for durations**

`src/model/duration.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DurationError, formatDuration, parseDuration } from './duration';

describe('parseDuration', () => {
  it.each([
    ['30m', 30],
    ['2h', 120],
    ['1.5h', 90],
    ['1d', 480],
    ['1w', 2400],
    ['1d 2h', 600],
    ['2 hours 15 mins', 135],
    ['3 days', 1440],
    ['  45 min ', 45],
  ])('parses %s', (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes);
  });

  it('returns null for empty input', () => {
    expect(parseDuration('   ')).toBeNull();
  });

  it.each(['abc', '5', '2x', 'h2', '-3h'])('rejects %s', (input) => {
    expect(() => parseDuration(input)).toThrow(DurationError);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0m'],
    [45, '45m'],
    [90, '1h 30m'],
    [480, '1d'],
    [540, '1d 1h'],
    [2400, '1w'],
    [2890, '1w 1d'],
  ])('formats %d', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `npx vitest run src/model/duration.test.ts`
Expected: FAIL, cannot resolve `./duration`.

- [ ] **Step 4: Implement durations**

`src/model/duration.ts`:
```ts
export class DurationError extends Error {}

const UNIT_MINUTES: Record<string, number> = { m: 1, h: 60, d: 480, w: 2400 };
const TOKEN = /(\d+(?:\.\d+)?)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?|w|wks?|weeks?)\b/gy;

export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  let total = 0;
  let index = 0;
  TOKEN.lastIndex = 0;
  while (index < text.length) {
    TOKEN.lastIndex = index;
    const match = TOKEN.exec(text);
    if (!match) throw invalid(input);
    total += Number(match[1]) * UNIT_MINUTES[match[2][0]];
    index = TOKEN.lastIndex;
    while (text[index] === ' ' || text[index] === ',') index++;
  }
  return Math.round(total);
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m';
  const parts: string[] = [];
  let rest = Math.round(minutes);
  for (const [unit, size] of [['w', 2400], ['d', 480], ['h', 60], ['m', 1]] as const) {
    if (rest >= size && parts.length < 2) {
      parts.push(`${Math.floor(rest / size)}${unit}`);
      rest %= size;
    }
  }
  return parts.join(' ');
}

function invalid(input: string): DurationError {
  return new DurationError(`Cannot read duration "${input}". Use forms like 30m, 2h, 1.5d, 1w.`);
}
```

- [ ] **Step 5: Run and watch it pass**

Run: `npx vitest run src/model/duration.test.ts`
Expected: PASS.

- [ ] **Step 6: Write failing tests for factories and migration**

`src/model/factory.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { allocId, createBoard, createProject, makeFlag, makeNode, SHAPE_SIZE } from './factory';

describe('factory', () => {
  it('creates a project with one empty board', () => {
    const p = createProject('Claims');
    expect(p.name).toBe('Claims');
    expect(p.schemaVersion).toBe(1);
    expect(p.boards).toHaveLength(1);
    expect(p.boards[0].nodes).toEqual([]);
    expect(p.id).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(p.boards[0].id).toMatch(/^b[A-Za-z0-9_-]{10}$/);
  });

  it('allocates sequential ids with prefixes from one counter', () => {
    const b = createBoard('B');
    expect(allocId(b, 's')).toBe('s1');
    expect(allocId(b, 'e')).toBe('e2');
    expect(b.nextId).toBe(3);
  });

  it('makes steps sized by shape with defaults', () => {
    const b = createBoard('B');
    const n = makeNode(b, 'step', { shape: 'decision', title: 'Approve?' });
    expect(n).toMatchObject({ id: 's1', kind: 'step', shape: 'decision', title: 'Approve?', actor: null, flags: [] });
    expect({ w: n.w, h: n.h }).toEqual(SHAPE_SIZE.decision);
  });

  it('prefixes text and group ids', () => {
    const b = createBoard('B');
    expect(makeNode(b, 'text').id).toBe('t1');
    expect(makeNode(b, 'group').id).toBe('g2');
  });

  it('makes flags', () => {
    const b = createBoard('B');
    expect(makeFlag(b, 'blocker', 'No API')).toEqual({ id: 'f1', kind: 'blocker', text: 'No API', resolved: false });
  });
});
```

`src/model/migrate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createProject } from './factory';
import { migrateProject, ProjectFormatError } from './migrate';

describe('migrateProject', () => {
  it('accepts a current project unchanged', () => {
    const p = createProject();
    expect(migrateProject(structuredClone(p))).toEqual(p);
  });

  it.each([null, 42, 'x', {}, { schemaVersion: 1 }, { schemaVersion: 1, id: 'a', boards: 'no' }])('rejects %j', (raw) => {
    expect(() => migrateProject(raw)).toThrow(ProjectFormatError);
  });

  it('rejects projects from a newer schema', () => {
    const p = { ...createProject(), schemaVersion: 99 };
    expect(() => migrateProject(p)).toThrow(/newer Flowstate/);
  });
});
```

- [ ] **Step 7: Run and watch them fail**

Run: `npx vitest run src/model`
Expected: FAIL, cannot resolve `./factory` and `./migrate`.

- [ ] **Step 8: Implement factories and migration**

`src/model/factory.ts`:
```ts
import { nanoid } from 'nanoid';
import { SCHEMA_VERSION, type Board, type BoardNode, type Flag, type FlagKind, type NodeKind, type Project, type Shape } from './types';

export type IdPrefix = 's' | 't' | 'g' | 'e' | 'l' | 'f';

export const SHAPE_SIZE: Record<Shape, { w: number; h: number }> = {
  process: { w: 180, h: 72 },
  decision: { w: 150, h: 110 },
  terminal: { w: 160, h: 56 },
  data: { w: 180, h: 72 },
  document: { w: 180, h: 80 },
  database: { w: 140, h: 90 },
  preparation: { w: 180, h: 72 },
  connector: { w: 48, h: 48 },
  sticky: { w: 180, h: 140 },
};
export const TEXT_SIZE = { w: 220, h: 44 };
export const GROUP_MIN = { w: 240, h: 160 };
export const LANE_SIZE = 240;

const KIND_PREFIX: Record<NodeKind, IdPrefix> = { step: 's', text: 't', group: 'g' };

export function newId(): string {
  return nanoid(10);
}

export function createBoard(name: string): Board {
  return { id: `b${newId()}`, name, direction: 'LR', nodes: [], edges: [], lanes: [], nextId: 1 };
}

export function createProject(name = 'Untitled project'): Project {
  return { id: newId(), name, schemaVersion: SCHEMA_VERSION, boards: [createBoard('Board 1')] };
}

export function allocId(board: Board, prefix: IdPrefix): string {
  return `${prefix}${board.nextId++}`;
}

export function makeNode(board: Board, kind: NodeKind, init: Partial<BoardNode> = {}): BoardNode {
  const shape = init.shape ?? 'process';
  const size = kind === 'text' ? TEXT_SIZE : kind === 'group' ? GROUP_MIN : SHAPE_SIZE[shape];
  return {
    kind,
    shape,
    actor: null,
    title: '',
    note: '',
    owner: '',
    durationMin: null,
    status: null,
    replaces: '',
    laneId: null,
    groupId: null,
    flags: [],
    color: null,
    x: 0,
    y: 0,
    w: size.w,
    h: size.h,
    ...init,
    id: allocId(board, KIND_PREFIX[kind]),
  };
}

export function makeFlag(board: Board, kind: FlagKind, text: string): Flag {
  return { id: allocId(board, 'f'), kind, text, resolved: false };
}
```

`src/model/migrate.ts`:
```ts
import { SCHEMA_VERSION, type Project } from './types';

export class ProjectFormatError extends Error {}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Record<number, Migration> = {};

export function migrateProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') throw new ProjectFormatError('Not a Flowstate project file.');
  let data = raw as Record<string, unknown>;
  if (typeof data.schemaVersion !== 'number') throw new ProjectFormatError('Not a Flowstate project file.');
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new ProjectFormatError(`This project was saved by a newer Flowstate (schema ${data.schemaVersion}).`);
  }
  while ((data.schemaVersion as number) < SCHEMA_VERSION) {
    const version = data.schemaVersion as number;
    const step = MIGRATIONS[version];
    if (!step) throw new ProjectFormatError(`No migration from schema ${version}.`);
    data = { ...step(data), schemaVersion: version + 1 };
  }
  if (typeof data.id !== 'string' || typeof data.name !== 'string' || !Array.isArray(data.boards) || data.boards.length === 0) {
    throw new ProjectFormatError('Project file is missing required fields.');
  }
  return data as unknown as Project;
}
```

- [ ] **Step 9: Run all model tests**

Run: `npx vitest run src/model`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/model
git commit -m "Add board model, factories, duration parsing, project migration"
```

---

### Task 3: Placement geometry

Local placement used by ops so small edits never disturb the rest of a hand-arranged board.

**Files:**
- Create: `src/layout/geometry.ts`, `src/layout/place.ts`
- Test: `src/layout/place.test.ts`

**Interfaces:**
- Consumes: `Board`, `BoardNode` from Task 2; `GROUP_MIN`, `LANE_SIZE`.
- Produces:
  - `GAP_MAIN = 72`, `GAP_CROSS = 40`, `type Rect = { x: number; y: number; w: number; h: number }`, `overlaps(a: Rect, b: Rect, pad?: number): boolean`, `axes(board): Axes` where `Axes = { main: 'x'|'y'; cross: 'x'|'y'; mainSize: 'w'|'h'; crossSize: 'w'|'h' }`.
  - `positionAfter(board, anchor, node)`, `positionBefore(board, anchor, node)`, `positionBeside(board, anchor, node, dir: 1 | -1)`, `positionAtEnd(board, node)`, `nudgeFree(board, node, prefer?: 1 | -1, along?: 'cross' | 'main')`, `shiftDownstream(board, rootId, delta, exclude?: Set<string>)`, `ensureGap(board, fromId, toId, exclude?: Set<string>)` (exclude defaults to `{fromId}`), `laneBands(board): LaneBand[]` with `LaneBand = { id: string; start: number; size: number }`, `placeInLane(board, node, laneId)`, `laneAt(board, crossCenter): string | null`, `fitGroup(board, groupId)`, `boundsOf(nodes): Rect | null`.

- [ ] **Step 1: Write the failing tests**

`src/layout/place.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createBoard, makeNode } from '../model/factory';
import type { Board, BoardNode } from '../model/types';
import { ensureGap, fitGroup, GAP_CROSS, GAP_MAIN, laneAt, laneBands, nudgeFree, overlaps, placeInLane, positionAfter, positionAtEnd, positionBeside, shiftDownstream } from './place';

function add(b: Board, init: Partial<BoardNode>): BoardNode {
  const n = makeNode(b, 'step', init);
  b.nodes.push(n);
  return n;
}

function link(b: Board, source: string, target: string) {
  b.edges.push({ id: `e${b.nextId++}`, source, target, sourceSide: null, targetSide: null, type: 'flow', label: '', flags: [] });
}

describe('placement', () => {
  it('places after an anchor, centred on its cross axis (LR)', () => {
    const b = createBoard('B');
    const a = add(b, { x: 0, y: 0 });
    const n = makeNode(b, 'step', { shape: 'decision' });
    positionAfter(b, a, n);
    expect(n.x).toBe(a.w + GAP_MAIN);
    expect(n.y).toBe((a.h - n.h) / 2);
  });

  it('places after an anchor along y when the board is TB', () => {
    const b = createBoard('B');
    b.direction = 'TB';
    const a = add(b, { x: 0, y: 0 });
    const n = makeNode(b, 'step');
    positionAfter(b, a, n);
    expect(n.y).toBe(a.h + GAP_MAIN);
    expect(n.x).toBe(0);
  });

  it('places beside an anchor on the cross axis', () => {
    const b = createBoard('B');
    const a = add(b, { x: 0, y: 0 });
    const n = makeNode(b, 'step');
    positionBeside(b, a, n, 1);
    expect(n.x).toBe(0);
    expect(n.y).toBe(a.h + GAP_CROSS);
  });

  it('places at the end of the board', () => {
    const b = createBoard('B');
    const first = makeNode(b, 'step');
    positionAtEnd(b, first);
    expect([first.x, first.y]).toEqual([0, 0]);
    b.nodes.push(first);
    add(b, { x: 400, y: 100 });
    const n = makeNode(b, 'step');
    positionAtEnd(b, n);
    expect(n.x).toBe(400 + 180 + GAP_MAIN);
    expect(n.y).toBe(100);
  });

  it('nudges off occupied space, alternating sides', () => {
    const b = createBoard('B');
    add(b, { x: 0, y: 0 });
    const n = makeNode(b, 'step', { x: 0, y: 0 });
    nudgeFree(b, n);
    expect(n.y).toBe(72 + GAP_CROSS);
    add(b, { x: 0, y: 72 + GAP_CROSS });
    const m = makeNode(b, 'step', { x: 0, y: 0 });
    nudgeFree(b, m);
    expect(m.y).toBe(-(72 + GAP_CROSS));
    expect(b.nodes.some((o) => overlaps(o, m))).toBe(false);
  });

  it('shifts downstream nodes and survives cycles', () => {
    const b = createBoard('B');
    const a = add(b, { x: 0 });
    const c = add(b, { x: 300 });
    const d = add(b, { x: 600 });
    link(b, a.id, c.id);
    link(b, c.id, d.id);
    link(b, d.id, c.id);
    shiftDownstream(b, c.id, 100);
    expect([a.x, c.x, d.x]).toEqual([0, 400, 700]);
  });

  it('ensureGap pushes the target only when too close', () => {
    const b = createBoard('B');
    const a = add(b, { x: 0 });
    const c = add(b, { x: 100 });
    link(b, a.id, c.id);
    ensureGap(b, a.id, c.id);
    expect(c.x).toBe(180 + GAP_MAIN);
    ensureGap(b, a.id, c.id);
    expect(c.x).toBe(180 + GAP_MAIN);
  });

  it('computes lane bands in order and finds lanes by position', () => {
    const b = createBoard('B');
    b.lanes = [
      { id: 'l2', name: 'Ops', order: 1, height: 300 },
      { id: 'l1', name: 'Customer', order: 0, height: 240 },
    ];
    expect(laneBands(b)).toEqual([
      { id: 'l1', start: 0, size: 240 },
      { id: 'l2', start: 240, size: 300 },
    ]);
    expect(laneAt(b, 100)).toBe('l1');
    expect(laneAt(b, 400)).toBe('l2');
    expect(laneAt(b, 900)).toBeNull();
    const n = makeNode(b, 'step');
    placeInLane(b, n, 'l2');
    expect(n.laneId).toBe('l2');
    expect(n.y).toBe(240 + (300 - 72) / 2);
  });

  it('fits a group around its members with padding', () => {
    const b = createBoard('B');
    const g = makeNode(b, 'group', { x: 0, y: 0 });
    b.nodes.push(g);
    add(b, { x: 100, y: 100, groupId: g.id });
    add(b, { x: 400, y: 200, groupId: g.id });
    fitGroup(b, g.id);
    expect(g).toMatchObject({ x: 100 - 32, y: 100 - 48, w: 400 + 180 - 100 + 64, h: 200 + 72 - 100 + 48 + 32 });
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/layout/place.test.ts`
Expected: FAIL, cannot resolve `./place`.

- [ ] **Step 3: Implement geometry and placement**

`src/layout/geometry.ts`:
```ts
import type { Board } from '../model/types';

export const GAP_MAIN = 72;
export const GAP_CROSS = 40;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Axes {
  main: 'x' | 'y';
  cross: 'x' | 'y';
  mainSize: 'w' | 'h';
  crossSize: 'w' | 'h';
}

export function axes(board: Board): Axes {
  return board.direction === 'LR'
    ? { main: 'x', cross: 'y', mainSize: 'w', crossSize: 'h' }
    : { main: 'y', cross: 'x', mainSize: 'h', crossSize: 'w' };
}

export function overlaps(a: Rect, b: Rect, pad = 16): boolean {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
```

`src/layout/place.ts`:
```ts
import { GROUP_MIN } from '../model/factory';
import type { Board, BoardNode } from '../model/types';
import { axes, boundsOf, GAP_CROSS, GAP_MAIN, overlaps } from './geometry';

export { axes, boundsOf, GAP_CROSS, GAP_MAIN, overlaps } from './geometry';
export type { Axes, Rect } from './geometry';

export interface LaneBand {
  id: string;
  start: number;
  size: number;
}

const GROUP_PAD = 32;
const GROUP_HEADER = 16;

export function positionAfter(board: Board, anchor: BoardNode, node: BoardNode): void {
  const ax = axes(board);
  node[ax.main] = anchor[ax.main] + anchor[ax.mainSize] + GAP_MAIN;
  node[ax.cross] = anchor[ax.cross] + (anchor[ax.crossSize] - node[ax.crossSize]) / 2;
}

export function positionBefore(board: Board, anchor: BoardNode, node: BoardNode): void {
  const ax = axes(board);
  node[ax.main] = anchor[ax.main] - GAP_MAIN - node[ax.mainSize];
  node[ax.cross] = anchor[ax.cross] + (anchor[ax.crossSize] - node[ax.crossSize]) / 2;
}

export function positionBeside(board: Board, anchor: BoardNode, node: BoardNode, dir: 1 | -1): void {
  const ax = axes(board);
  node[ax.main] = anchor[ax.main] + (anchor[ax.mainSize] - node[ax.mainSize]) / 2;
  node[ax.cross] = dir === 1 ? anchor[ax.cross] + anchor[ax.crossSize] + GAP_CROSS : anchor[ax.cross] - GAP_CROSS - node[ax.crossSize];
}

export function positionAtEnd(board: Board, node: BoardNode): void {
  const ax = axes(board);
  const others = board.nodes.filter((n) => n.kind !== 'group' && n.id !== node.id);
  if (others.length === 0) {
    node.x = 0;
    node.y = 0;
    return;
  }
  const last = others.reduce((a, b) => (b[ax.main] + b[ax.mainSize] > a[ax.main] + a[ax.mainSize] ? b : a));
  positionAfter(board, last, node);
}

export function nudgeFree(board: Board, node: BoardNode, prefer: 1 | -1 = 1, along: 'cross' | 'main' = 'cross'): void {
  const ax = axes(board);
  const coord = along === 'cross' ? ax.cross : ax.main;
  const size = along === 'cross' ? ax.crossSize : ax.mainSize;
  const obstacles = board.nodes.filter((n) => n.id !== node.id && n.kind !== 'group');
  const start = node[coord];
  const step = node[size] + (along === 'cross' ? GAP_CROSS : GAP_MAIN);
  for (let i = 0; i < 400; i++) {
    const ring = Math.ceil(i / 2);
    const sign = i % 2 === 1 ? prefer : -prefer;
    node[coord] = start + ring * step * sign;
    if (!obstacles.some((o) => overlaps(node, o))) return;
  }
  node[coord] = start;
}

export function shiftDownstream(board: Board, rootId: string, delta: number, exclude: Set<string> = new Set()): void {
  const ax = axes(board);
  const seen = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || exclude.has(id)) continue;
    seen.add(id);
    for (const e of board.edges) if (e.source === id && e.type !== 'handoff') queue.push(e.target);
  }
  const groups = new Set<string>();
  for (const n of board.nodes) {
    if (!seen.has(n.id)) continue;
    n[ax.main] += delta;
    if (n.groupId) groups.add(n.groupId);
  }
  for (const g of groups) fitGroup(board, g);
}

export function ensureGap(board: Board, fromId: string, toId: string, exclude: Set<string> = new Set([fromId])): void {
  const ax = axes(board);
  const from = board.nodes.find((n) => n.id === fromId)!;
  const to = board.nodes.find((n) => n.id === toId)!;
  const needed = from[ax.main] + from[ax.mainSize] + GAP_MAIN - to[ax.main];
  if (needed > 0) shiftDownstream(board, toId, needed, exclude);
}

export function laneBands(board: Board): LaneBand[] {
  let start = 0;
  return [...board.lanes]
    .sort((a, b) => a.order - b.order)
    .map((lane) => {
      const band = { id: lane.id, start, size: lane.height };
      start += lane.height;
      return band;
    });
}

export function laneAt(board: Board, crossCenter: number): string | null {
  const band = laneBands(board).find((b) => crossCenter >= b.start && crossCenter < b.start + b.size);
  return band?.id ?? null;
}

export function placeInLane(board: Board, node: BoardNode, laneId: string): void {
  const ax = axes(board);
  const band = laneBands(board).find((b) => b.id === laneId);
  if (!band) return;
  node.laneId = laneId;
  node[ax.cross] = band.start + (band.size - node[ax.crossSize]) / 2;
}

export function fitGroup(board: Board, groupId: string): void {
  const group = board.nodes.find((n) => n.id === groupId);
  if (!group) return;
  const box = boundsOf(board.nodes.filter((n) => n.groupId === groupId));
  if (!box) return;
  group.x = box.x - GROUP_PAD;
  group.y = box.y - GROUP_PAD - GROUP_HEADER;
  group.w = Math.max(GROUP_MIN.w, box.w + GROUP_PAD * 2);
  group.h = Math.max(GROUP_MIN.h, box.h + GROUP_PAD * 2 + GROUP_HEADER);
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/layout/place.test.ts`
Expected: PASS. If the group-fit expectation differs, the test arithmetic is the spec: x and y padding 32, extra 16 header on top.

- [ ] **Step 5: Commit**

```bash
git add src/layout
git commit -m "Add local placement geometry for incremental layout"
```

---

### Task 4: Core ops: steps and arrows

**Files:**
- Create: `src/ops/errors.ts`, `src/ops/query.ts`, `src/ops/run.ts`, `src/ops/steps.ts`, `src/ops/edges.ts`, `src/ops/lanes.ts` (minimal, completed in Task 6), `src/ops/groups.ts` (minimal, completed in Task 6), `src/ops/testkit.ts`
- Test: `src/ops/steps.test.ts`

**Interfaces:**
- Consumes: Task 2 model, Task 3 placement.
- Produces:
  - `class OpError extends Error`.
  - `getNode(b, id): BoardNode` (throws `OpError('Unknown step "id".')`), `getEdge(b, id): BoardEdge`, `findEdge(b, source, target, type?): BoardEdge | undefined`, `flowPreds(b, id): string[]`, `flowSuccs(b, id): string[]`.
  - `runOp<R>(board: Board, fn: (draft: Board) => R): { board: Board; result: R }`.
  - `interface StepFields { title?; shape?; actor?: Actor | null; owner?; durationMin?: number | null; note?; status?: Status | null; replaces?; color?: string | null }`, `cleanFields(f: StepFields): StepFields`.
  - `interface AddStepArgs extends StepFields { x?; y?; after?; before?; edgeType?: EdgeType; edgeLabel?; laneId?: string | null; groupId?: string | null }`, `addStep(b, args?): string`.
  - `type StepUpdate = { id: string; laneId?: string | null } & StepFields`, `updateSteps(b, updates): string[]`.
  - `deleteSteps(b, ids, opts?: { reconnect?: boolean }): { deleted: string[]; reconnected: number }`.
  - `setPositions(b, positions: Record<string, { x: number; y: number }>): void`, `resizeNode(b, id, rect: Rect): void`.
  - `interface ConnectArgs { source; target; type?: EdgeType; label?; sourceSide?: Side | null; targetSide?: Side | null }`, `connect(b, args): string` (idempotent per source, target, type), `disconnect(b, { source, target, type? }): number`, `deleteEdges(b, ids): void`, `updateEdge(b, id, patch: { type?: EdgeType; label?: string }): void`.
  - `assertLane(b, laneId): void`, `syncLane(b, node): void` in `lanes.ts`; `addToGroup(b, ids, groupId, moveInto?: boolean): void` in `groups.ts`.
  - Test helpers `chain(titles, board?)`, `node(b, id)`, `byTitle(b, title)`, `links(b, type?)` in `testkit.ts`.

- [ ] **Step 1: Write the error, query and run helpers**

`src/ops/errors.ts`:
```ts
export class OpError extends Error {}
```

`src/ops/query.ts`:
```ts
import type { Board, BoardEdge, BoardNode, EdgeType } from '../model/types';
import { OpError } from './errors';

export function getNode(b: Board, id: string): BoardNode {
  const n = b.nodes.find((x) => x.id === id);
  if (!n) throw new OpError(`Unknown step "${id}".`);
  return n;
}

export function getEdge(b: Board, id: string): BoardEdge {
  const e = b.edges.find((x) => x.id === id);
  if (!e) throw new OpError(`Unknown arrow "${id}".`);
  return e;
}

export function findEdge(b: Board, source: string, target: string, type?: EdgeType): BoardEdge | undefined {
  return b.edges.find((e) => e.source === source && e.target === target && (!type || e.type === type));
}

export function flowPreds(b: Board, id: string): string[] {
  return b.edges.filter((e) => e.target === id && e.type === 'flow').map((e) => e.source);
}

export function flowSuccs(b: Board, id: string): string[] {
  return b.edges.filter((e) => e.source === id && e.type === 'flow').map((e) => e.target);
}
```

`src/ops/run.ts`:
```ts
import { produce } from 'immer';
import type { Board } from '../model/types';

export function runOp<R>(board: Board, fn: (draft: Board) => R): { board: Board; result: R } {
  let result!: R;
  const next = produce(board, (draft) => {
    result = fn(draft as Board);
  });
  return { board: next, result };
}
```

- [ ] **Step 2: Write the test kit and the failing tests**

`src/ops/testkit.ts`:
```ts
import { createBoard } from '../model/factory';
import type { Board, BoardNode, EdgeType } from '../model/types';
import { addStep } from './steps';

export function chain(titles: string[], board: Board = createBoard('Test')): { b: Board; ids: string[] } {
  const ids: string[] = [];
  for (const title of titles) {
    ids.push(addStep(board, ids.length ? { title, after: ids[ids.length - 1] } : { title, x: 0, y: 0 }));
  }
  return { b: board, ids };
}

export function node(b: Board, id: string): BoardNode {
  const n = b.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`No node ${id}`);
  return n;
}

export function byTitle(b: Board, title: string): BoardNode {
  const n = b.nodes.find((x) => x.title === title);
  if (!n) throw new Error(`No node titled ${title}`);
  return n;
}

export function links(b: Board, type?: EdgeType): string[] {
  const title = (id: string) => node(b, id).title;
  return b.edges
    .filter((e) => !type || e.type === type)
    .map((e) => `${title(e.source)}>${title(e.target)}`)
    .sort();
}
```

`src/ops/steps.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createBoard, makeNode } from '../model/factory';
import { GAP_MAIN } from '../layout/place';
import { connect, deleteEdges, disconnect, updateEdge } from './edges';
import { OpError } from './errors';
import { runOp } from './run';
import { addStep, deleteSteps, resizeNode, setPositions, updateSteps } from './steps';
import { byTitle, chain, links, node } from './testkit';

describe('addStep', () => {
  it('places the first step at the origin', () => {
    const b = createBoard('B');
    const id = addStep(b, { title: '  Start  ' });
    expect(id).toBe('s1');
    expect(node(b, id)).toMatchObject({ x: 0, y: 0, title: 'Start' });
  });

  it('adds after an anchor and connects it with a label', () => {
    const { b, ids } = chain(['A']);
    const id = addStep(b, { title: 'B', after: ids[0], edgeLabel: 'Yes' });
    expect(links(b)).toEqual(['A>B']);
    expect(b.edges[0].label).toBe('Yes');
    expect(node(b, id).x).toBe(180 + GAP_MAIN);
  });

  it('adds before an anchor and connects into it', () => {
    const { b, ids } = chain(['A']);
    addStep(b, { title: 'Z', before: ids[0] });
    expect(links(b)).toEqual(['Z>A']);
    expect(byTitle(b, 'Z').x).toBeLessThan(0);
  });

  it('respects explicit coordinates without nudging', () => {
    const b = createBoard('B');
    addStep(b, { title: 'A', x: 0, y: 0 });
    const id = addStep(b, { title: 'B', x: 0, y: 0 });
    expect(node(b, id)).toMatchObject({ x: 0, y: 0 });
  });

  it('nudges automatic placement off existing steps', () => {
    const { b, ids } = chain(['A', 'B']);
    const c = addStep(b, { title: 'C', after: ids[0] });
    expect(links(b)).toEqual(['A>B', 'A>C']);
    expect(node(b, c).y).not.toBe(node(b, ids[1]).y);
  });

  it('rejects unknown anchors and leaves the board untouched', () => {
    const { b } = chain(['A']);
    expect(() => runOp(b, (d) => addStep(d, { after: 's99' }))).toThrow('Unknown step "s99".');
    expect(b.nodes).toHaveLength(1);
  });
});

describe('updateSteps', () => {
  it('updates fields, trimming text', () => {
    const { b, ids } = chain(['A']);
    updateSteps(b, [{ id: ids[0], title: ' Review ', actor: 'agent', durationMin: 90, owner: 'Intake Agent' }]);
    expect(node(b, ids[0])).toMatchObject({ title: 'Review', actor: 'agent', durationMin: 90, owner: 'Intake Agent' });
  });

  it('resizes to the new shape default, keeping the centre', () => {
    const { b, ids } = chain(['A']);
    updateSteps(b, [{ id: ids[0], shape: 'decision' }]);
    const n = node(b, ids[0]);
    expect({ w: n.w, h: n.h }).toEqual({ w: 150, h: 110 });
    expect(n.x + n.w / 2).toBe(90);
    expect(n.y + n.h / 2).toBe(36);
  });

  it('can clear nullable fields', () => {
    const { b, ids } = chain(['A']);
    updateSteps(b, [{ id: ids[0], durationMin: 30, status: 'active' }]);
    updateSteps(b, [{ id: ids[0], durationMin: null, status: null }]);
    expect(node(b, ids[0])).toMatchObject({ durationMin: null, status: null });
  });
});

describe('deleteSteps', () => {
  it('removes steps and their arrows', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    const out = deleteSteps(b, [ids[1]]);
    expect(out).toEqual({ deleted: [ids[1]], reconnected: 0 });
    expect(b.nodes.map((n) => n.title)).toEqual(['A', 'C']);
    expect(b.edges).toEqual([]);
  });

  it('reconnects across a deleted step', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    deleteSteps(b, [ids[1]], { reconnect: true });
    expect(links(b)).toEqual(['A>C']);
  });

  it('reconnects across a deleted chain', () => {
    const { b, ids } = chain(['A', 'B', 'C', 'D']);
    const out = deleteSteps(b, [ids[1], ids[2]], { reconnect: true });
    expect(links(b)).toEqual(['A>D']);
    expect(out.reconnected).toBe(1);
  });

  it('reconnects a deleted branch point without duplicating arrows', () => {
    const { b, ids } = chain(['A', 'B', 'D']);
    const c = addStep(b, { title: 'C', after: ids[0] });
    connect(b, { source: c, target: ids[2] });
    deleteSteps(b, [ids[1]], { reconnect: true });
    expect(links(b)).toEqual(['A>C', 'A>D', 'C>D']);
  });

  it('reconnects every input of a deleted join to its output', () => {
    const { b, ids } = chain(['A', 'J', 'D']);
    const c = addStep(b, { title: 'C', x: 0, y: 300 });
    connect(b, { source: c, target: ids[1] });
    deleteSteps(b, [ids[1]], { reconnect: true });
    expect(links(b)).toEqual(['A>D', 'C>D']);
  });

  it('clears membership when a group is deleted', () => {
    const { b, ids } = chain(['A']);
    const g = makeNode(b, 'group', { title: 'G' });
    b.nodes.push(g);
    node(b, ids[0]).groupId = g.id;
    deleteSteps(b, [g.id]);
    expect(node(b, ids[0]).groupId).toBeNull();
  });
});

describe('arrows', () => {
  it('connect is idempotent per type and returns the existing id', () => {
    const { b, ids } = chain(['A', 'B']);
    const first = b.edges[0].id;
    expect(connect(b, { source: ids[0], target: ids[1] })).toBe(first);
    const dep = connect(b, { source: ids[0], target: ids[1], type: 'dependency' });
    expect(dep).not.toBe(first);
    expect(b.edges).toHaveLength(2);
  });

  it('rejects self loops and group endpoints', () => {
    const { b, ids } = chain(['A']);
    expect(() => connect(b, { source: ids[0], target: ids[0] })).toThrow(OpError);
    const g = makeNode(b, 'group');
    b.nodes.push(g);
    expect(() => connect(b, { source: ids[0], target: g.id })).toThrow(/Groups cannot be connected/);
  });

  it('disconnects and reports missing arrows', () => {
    const { b, ids } = chain(['A', 'B']);
    expect(disconnect(b, { source: ids[0], target: ids[1] })).toBe(1);
    expect(() => disconnect(b, { source: ids[0], target: ids[1] })).toThrow(/not connected/);
  });

  it('updates and deletes arrows by id', () => {
    const { b } = chain(['A', 'B']);
    const id = b.edges[0].id;
    updateEdge(b, id, { type: 'handoff', label: ' docs ' });
    expect(b.edges[0]).toMatchObject({ type: 'handoff', label: 'docs' });
    deleteEdges(b, [id]);
    expect(b.edges).toEqual([]);
  });
});

describe('geometry ops', () => {
  it('sets positions and resizes', () => {
    const { b, ids } = chain(['A']);
    setPositions(b, { [ids[0]]: { x: 10, y: 20 } });
    resizeNode(b, ids[0], { x: 10, y: 20, w: 300, h: 10 });
    expect(node(b, ids[0])).toMatchObject({ x: 10, y: 20, w: 300, h: 24 });
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `npx vitest run src/ops/steps.test.ts`
Expected: FAIL, cannot resolve `./steps`.

- [ ] **Step 4: Implement edges, minimal lanes and groups, and steps**

`src/ops/edges.ts`:
```ts
import { allocId } from '../model/factory';
import type { Board, EdgeType, Side } from '../model/types';
import { OpError } from './errors';
import { findEdge, getEdge, getNode } from './query';

export interface ConnectArgs {
  source: string;
  target: string;
  type?: EdgeType;
  label?: string;
  sourceSide?: Side | null;
  targetSide?: Side | null;
}

export function connect(b: Board, args: ConnectArgs): string {
  const source = getNode(b, args.source);
  const target = getNode(b, args.target);
  if (source.kind === 'group' || target.kind === 'group') {
    throw new OpError('Groups cannot be connected. Connect the steps inside them.');
  }
  if (source.id === target.id) throw new OpError(`Cannot connect ${source.id} to itself.`);
  const type = args.type ?? 'flow';
  const existing = findEdge(b, source.id, target.id, type);
  if (existing) {
    if (args.label) existing.label = args.label.trim();
    return existing.id;
  }
  const id = allocId(b, 'e');
  b.edges.push({
    id,
    source: source.id,
    target: target.id,
    sourceSide: args.sourceSide ?? null,
    targetSide: args.targetSide ?? null,
    type,
    label: (args.label ?? '').trim(),
    flags: [],
  });
  return id;
}

export function disconnect(b: Board, args: { source: string; target: string; type?: EdgeType }): number {
  const before = b.edges.length;
  b.edges = b.edges.filter((e) => !(e.source === args.source && e.target === args.target && (!args.type || e.type === args.type)));
  const removed = before - b.edges.length;
  if (removed === 0) throw new OpError(`${args.source} is not connected to ${args.target}.`);
  return removed;
}

export function deleteEdges(b: Board, ids: string[]): void {
  for (const id of ids) getEdge(b, id);
  const doomed = new Set(ids);
  b.edges = b.edges.filter((e) => !doomed.has(e.id));
}

export function updateEdge(b: Board, id: string, patch: { type?: EdgeType; label?: string }): void {
  const e = getEdge(b, id);
  if (patch.type) e.type = patch.type;
  if (patch.label !== undefined) e.label = patch.label.trim();
}
```

`src/ops/lanes.ts` (Task 6 adds the remaining lane ops to this file):
```ts
import { axes, laneAt } from '../layout/place';
import type { Board, BoardNode } from '../model/types';
import { OpError } from './errors';

export function assertLane(b: Board, laneId: string): void {
  if (!b.lanes.some((l) => l.id === laneId)) {
    const known = b.lanes.map((l) => `${l.id} "${l.name}"`).join(', ') || 'none';
    throw new OpError(`Unknown lane "${laneId}". Lanes: ${known}.`);
  }
}

export function syncLane(b: Board, node: BoardNode): void {
  if (b.lanes.length === 0 || node.kind !== 'step') return;
  const ax = axes(b);
  node.laneId = laneAt(b, node[ax.cross] + node[ax.crossSize] / 2);
}
```

`src/ops/groups.ts` (Task 6 adds `groupSteps` and `ungroup` to this file):
```ts
import { axes, fitGroup, nudgeFree, positionAfter } from '../layout/place';
import type { Board, BoardNode } from '../model/types';
import { OpError } from './errors';
import { getNode } from './query';

function inside(n: BoardNode, g: BoardNode): boolean {
  return n.x >= g.x && n.y >= g.y && n.x + n.w <= g.x + g.w && n.y + n.h <= g.y + g.h;
}

export function addToGroup(b: Board, ids: string[], groupId: string, moveInto = false): void {
  const group = getNode(b, groupId);
  if (group.kind !== 'group') throw new OpError(`"${groupId}" is not a group.`);
  const ax = axes(b);
  const members = b.nodes.filter((n) => n.groupId === groupId);
  const oldGroups = new Set<string>();
  for (const id of ids) {
    const n = getNode(b, id);
    if (n.kind === 'group') throw new OpError('Groups cannot be nested.');
    if (n.groupId && n.groupId !== groupId) oldGroups.add(n.groupId);
    if (moveInto && members.length > 0 && !inside(n, group)) {
      const last = members.reduce((a, c) => (c[ax.main] + c[ax.mainSize] > a[ax.main] + a[ax.mainSize] ? c : a));
      positionAfter(b, last, n);
      nudgeFree(b, n);
    }
    n.groupId = groupId;
    members.push(n);
  }
  fitGroup(b, groupId);
  for (const g of oldGroups) fitGroup(b, g);
}
```

`src/ops/steps.ts`:
```ts
import { makeNode, SHAPE_SIZE } from '../model/factory';
import type { Actor, Board, EdgeType, Shape, Status } from '../model/types';
import { fitGroup, nudgeFree, placeInLane, positionAfter, positionAtEnd, positionBefore, type Rect } from '../layout/place';
import { connect } from './edges';
import { addToGroup } from './groups';
import { assertLane, syncLane } from './lanes';
import { findEdge, flowPreds, flowSuccs, getNode } from './query';

export interface StepFields {
  title?: string;
  shape?: Shape;
  actor?: Actor | null;
  owner?: string;
  durationMin?: number | null;
  note?: string;
  status?: Status | null;
  replaces?: string;
  color?: string | null;
}

export interface AddStepArgs extends StepFields {
  x?: number;
  y?: number;
  after?: string;
  before?: string;
  edgeType?: EdgeType;
  edgeLabel?: string;
  laneId?: string | null;
  groupId?: string | null;
}

export type StepUpdate = { id: string; laneId?: string | null } & StepFields;

export function cleanFields(fields: StepFields): StepFields {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    out[key] = typeof value === 'string' && key !== 'color' ? value.trim() : value;
  }
  return out as StepFields;
}

export function addStep(b: Board, args: AddStepArgs = {}): string {
  const { x, y, after, before, edgeType = 'flow', edgeLabel = '', laneId, groupId, ...fields } = args;
  const anchor = after ? getNode(b, after) : before ? getNode(b, before) : null;
  const node = makeNode(b, 'step', cleanFields(fields));
  let explicit = false;
  if (anchor && after) positionAfter(b, anchor, node);
  else if (anchor) positionBefore(b, anchor, node);
  else if (x !== undefined && y !== undefined) {
    node.x = x;
    node.y = y;
    explicit = true;
  } else positionAtEnd(b, node);
  if (laneId) {
    assertLane(b, laneId);
    placeInLane(b, node, laneId);
  }
  if (!explicit) nudgeFree(b, node, 1, laneId ? 'main' : 'cross');
  if (!laneId) syncLane(b, node);
  b.nodes.push(node);
  if (after) connect(b, { source: after, target: node.id, type: edgeType, label: edgeLabel });
  else if (before) connect(b, { source: node.id, target: before, type: edgeType, label: edgeLabel });
  if (groupId) addToGroup(b, [node.id], groupId);
  return node.id;
}

export function updateSteps(b: Board, updates: StepUpdate[]): string[] {
  for (const { id, laneId, ...fields } of updates) {
    const n = getNode(b, id);
    const clean = cleanFields(fields);
    if (clean.shape && clean.shape !== n.shape && n.kind === 'step') {
      const size = SHAPE_SIZE[clean.shape];
      const cx = n.x + n.w / 2;
      const cy = n.y + n.h / 2;
      n.w = size.w;
      n.h = size.h;
      n.x = cx - size.w / 2;
      n.y = cy - size.h / 2;
    }
    Object.assign(n, clean);
    if (laneId === null) n.laneId = null;
    else if (laneId) {
      assertLane(b, laneId);
      placeInLane(b, n, laneId);
      nudgeFree(b, n, 1, 'main');
    }
    if (n.groupId) fitGroup(b, n.groupId);
  }
  return updates.map((u) => u.id);
}

export function deleteSteps(b: Board, ids: string[], opts: { reconnect?: boolean } = {}): { deleted: string[]; reconnected: number } {
  for (const id of ids) getNode(b, id);
  const doomed = new Set(ids);
  let reconnected = 0;
  if (opts.reconnect) {
    const reach = (start: string, dir: 'in' | 'out'): string[] => {
      const found = new Set<string>();
      const seen = new Set<string>();
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const next of dir === 'in' ? flowPreds(b, cur) : flowSuccs(b, cur)) {
          if (doomed.has(next)) stack.push(next);
          else found.add(next);
        }
      }
      return [...found];
    };
    for (const id of ids) {
      const succs = reach(id, 'out');
      for (const p of reach(id, 'in')) {
        for (const s of succs) {
          if (p !== s && !findEdge(b, p, s, 'flow')) {
            connect(b, { source: p, target: s });
            reconnected++;
          }
        }
      }
    }
  }
  b.edges = b.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target));
  for (const n of b.nodes) if (n.groupId && doomed.has(n.groupId)) n.groupId = null;
  b.nodes = b.nodes.filter((n) => !doomed.has(n.id));
  return { deleted: ids, reconnected };
}

export function setPositions(b: Board, positions: Record<string, { x: number; y: number }>): void {
  const groups = new Set<string>();
  for (const n of b.nodes) {
    const p = positions[n.id];
    if (!p) continue;
    n.x = p.x;
    n.y = p.y;
    syncLane(b, n);
    if (n.groupId) groups.add(n.groupId);
  }
  for (const g of groups) if (!positions[g]) fitGroup(b, g);
}

export function resizeNode(b: Board, id: string, rect: Rect): void {
  const n = getNode(b, id);
  n.x = rect.x;
  n.y = rect.y;
  n.w = Math.max(24, rect.w);
  n.h = Math.max(24, rect.h);
}
```

- [ ] **Step 5: Run and watch it pass**

Run: `npx vitest run src/ops/steps.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ops
git commit -m "Add core board ops for steps and arrows"
```

---

### Task 5: Structural ops: insert between, parallel branches, moves, side and sibling steps

**Files:**
- Create: `src/ops/structure.ts`
- Test: `src/ops/structure.test.ts`

**Interfaces:**
- Consumes: Task 4 (`getNode`, `connect`, `cleanFields`, `addStep`, `StepFields`, `flowPreds`, `syncLane`, `assertLane`, `addToGroup`), Task 3 placement.
- Produces:
  - `insertBetween(b, from: string, to: string, fields: StepFields): string`.
  - `type BranchItem = { existing: string } | StepFields`, `branchParallel(b, from: string, branches: BranchItem[][], joinAt?: string): string[][]`.
  - `spliceOut(b, id): void`.
  - `interface MoveArgs { ids: string[]; relation?: 'after' | 'before' | 'above' | 'below'; anchor?: string; laneId?: string; groupId?: string }`, `moveSteps(b, args): string[]`.
  - `addStepOnSide(b, id, side: Side): string`, `addNext(b, id): string`, `addSibling(b, id): string`.

- [ ] **Step 1: Write the failing tests**

`src/ops/structure.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { GAP_CROSS, GAP_MAIN, overlaps } from '../layout/place';
import { makeNode } from '../model/factory';
import { addStep } from './steps';
import { addNext, addSibling, addStepOnSide, branchParallel, insertBetween, moveSteps } from './structure';
import { byTitle, chain, links, node } from './testkit';

describe('insertBetween', () => {
  it('rewires A>B into A>X>B and makes room downstream', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    const cBefore = node(b, ids[2]).x;
    const x = insertBetween(b, ids[0], ids[1], { title: 'X' });
    expect(links(b)).toEqual(['A>X', 'B>C', 'X>B']);
    const X = node(b, x);
    const B = node(b, ids[1]);
    expect(B.x).toBeGreaterThanOrEqual(X.x + X.w + GAP_MAIN);
    expect(X.y).toBe(B.y);
    expect(node(b, ids[2]).x - cBefore).toBe(B.x - (180 + GAP_MAIN));
  });

  it('keeps the arrow type and puts the label on the first segment', () => {
    const { b, ids } = chain(['A', 'B']);
    b.edges[0].label = 'Yes';
    b.edges[0].type = 'dependency';
    insertBetween(b, ids[0], ids[1], { title: 'X' });
    const first = b.edges.find((e) => e.source === ids[0])!;
    const second = b.edges.find((e) => e.target === ids[1])!;
    expect(first).toMatchObject({ type: 'dependency', label: 'Yes' });
    expect(second).toMatchObject({ type: 'dependency', label: '' });
  });

  it('refuses when the steps are not connected', () => {
    const { b, ids } = chain(['A', 'B']);
    const c = addStep(b, { title: 'C', x: 900, y: 0 });
    expect(() => insertBetween(b, ids[0], c, { title: 'X' })).toThrow(/not connected/);
  });
});

describe('branchParallel', () => {
  it('creates new branches that rejoin, replacing the direct arrow', () => {
    const { b, ids } = chain(['A', 'D']);
    const out = branchParallel(b, ids[0], [[{ title: 'B' }], [{ title: 'C' }]], ids[1]);
    expect(out).toHaveLength(2);
    expect(links(b)).toEqual(['A>B', 'A>C', 'B>D', 'C>D']);
    const B = byTitle(b, 'B');
    const C = byTitle(b, 'C');
    const D = byTitle(b, 'D');
    expect(overlaps(B, C)).toBe(false);
    expect(D.x).toBeGreaterThanOrEqual(Math.max(B.x + B.w, C.x + C.w) + GAP_MAIN);
  });

  it('splits existing steps off into parallel paths', () => {
    const { b, ids } = chain(['Kickoff', 'Research', 'Plan', 'Decision']);
    branchParallel(b, ids[0], [[{ existing: ids[1] }], [{ existing: ids[2] }]], ids[3]);
    expect(links(b)).toEqual(['Kickoff>Plan', 'Kickoff>Research', 'Plan>Decision', 'Research>Decision']);
    expect(overlaps(byTitle(b, 'Research'), byTitle(b, 'Plan'))).toBe(false);
  });

  it('chains multi-step branches without a join', () => {
    const { b, ids } = chain(['A']);
    branchParallel(b, ids[0], [[{ title: 'X1' }, { title: 'X2' }]]);
    expect(links(b)).toEqual(['A>X1', 'X1>X2']);
  });

  it('handles a branch that rejoins upstream of the split', () => {
    const { b, ids } = chain(['A', 'B']);
    branchParallel(b, ids[1], [[{ title: 'Rework' }]], ids[0]);
    expect(links(b)).toEqual(['A>B', 'B>Rework', 'Rework>A']);
  });

  it('validates input', () => {
    const { b, ids } = chain(['A', 'B']);
    expect(() => branchParallel(b, ids[0], [[]])).toThrow(/at least one step/);
    expect(() => branchParallel(b, ids[0], [[{ existing: ids[0] }]])).toThrow(/cannot be both/);
    expect(() => branchParallel(b, ids[0], [[{ existing: ids[1] }], [{ existing: ids[1] }]])).toThrow(/only appear once/);
  });
});

describe('moveSteps', () => {
  it('moves below an anchor', () => {
    const { b, ids } = chain(['A']);
    const z = addStep(b, { title: 'Z', x: 900, y: 900 });
    moveSteps(b, { ids: [z], relation: 'below', anchor: ids[0] });
    expect(node(b, z)).toMatchObject({ x: 0, y: 72 + GAP_CROSS });
  });

  it('moves after an anchor', () => {
    const { b, ids } = chain(['A']);
    const z = addStep(b, { title: 'Z', x: 900, y: 900 });
    moveSteps(b, { ids: [z], relation: 'after', anchor: ids[0] });
    expect(node(b, z)).toMatchObject({ x: 180 + GAP_MAIN, y: 0 });
  });

  it('moves into a lane', () => {
    const { b, ids } = chain(['A']);
    b.lanes = [{ id: 'l9', name: 'Ops', order: 0, height: 240 }];
    moveSteps(b, { ids, laneId: 'l9' });
    expect(node(b, ids[0])).toMatchObject({ laneId: 'l9', y: (240 - 72) / 2 });
  });

  it('moves into a group and refits it', () => {
    const { b, ids } = chain(['A', 'B']);
    const g = makeNode(b, 'group', { title: 'G' });
    b.nodes.push(g);
    node(b, ids[0]).groupId = g.id;
    moveSteps(b, { ids: [ids[1]], groupId: g.id });
    expect(node(b, ids[1]).groupId).toBe(g.id);
    expect(g.x + g.w).toBeGreaterThanOrEqual(node(b, ids[1]).x + 180);
  });

  it('requires a destination', () => {
    const { b, ids } = chain(['A']);
    expect(() => moveSteps(b, { ids })).toThrow(/Say where to move/);
  });
});

describe('side and sibling steps', () => {
  it('adds on the forward side as a connected next step', () => {
    const { b, ids } = chain(['A']);
    node(b, ids[0]).actor = 'agent';
    const n = addStepOnSide(b, ids[0], 'right');
    expect(links(b)).toEqual(['A>']);
    expect(node(b, n).actor).toBe('agent');
  });

  it('adds on the backward side as a predecessor', () => {
    const { b, ids } = chain(['A']);
    addStepOnSide(b, ids[0], 'left');
    expect(links(b)).toEqual(['>A']);
  });

  it('adds on a cross side with arrow sides set', () => {
    const { b, ids } = chain(['A']);
    const n = addStepOnSide(b, ids[0], 'bottom');
    expect(node(b, n).y).toBe(72 + GAP_CROSS);
    expect(b.edges[0]).toMatchObject({ source: ids[0], target: n, sourceSide: 'bottom', targetSide: 'top' });
  });

  it('addNext chains forward and addSibling branches from the parent', () => {
    const { b, ids } = chain(['A', 'B']);
    const next = addNext(b, ids[1]);
    expect(node(b, next).x).toBe(2 * (180 + GAP_MAIN));
    const sib = addSibling(b, ids[1]);
    expect(links(b)).toEqual(['A>', 'A>B', 'B>']);
    expect(node(b, sib).y).toBeGreaterThan(node(b, ids[1]).y);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/ops/structure.test.ts`
Expected: FAIL, cannot resolve `./structure`.

- [ ] **Step 3: Implement structural ops**

`src/ops/structure.ts`:
```ts
import { makeNode } from '../model/factory';
import type { Board, BoardNode, Side } from '../model/types';
import { axes, ensureGap, fitGroup, GAP_MAIN, nudgeFree, placeInLane, positionAfter, positionBefore, positionBeside } from '../layout/place';
import { connect } from './edges';
import { OpError } from './errors';
import { addToGroup } from './groups';
import { assertLane, syncLane } from './lanes';
import { getNode, flowPreds } from './query';
import { addStep, cleanFields, type StepFields } from './steps';

export type BranchItem = { existing: string } | StepFields;

export interface MoveArgs {
  ids: string[];
  relation?: 'after' | 'before' | 'above' | 'below';
  anchor?: string;
  laneId?: string;
  groupId?: string;
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function isExisting(item: BranchItem): item is { existing: string } {
  return 'existing' in item;
}

function pushStep(b: Board, fields: StepFields): string {
  const n = makeNode(b, 'step', cleanFields(fields));
  b.nodes.push(n);
  return n.id;
}

export function insertBetween(b: Board, from: string, to: string, fields: StepFields): string {
  const fromNode = getNode(b, from);
  const toNode = getNode(b, to);
  const edge = b.edges.find((e) => e.source === from && e.target === to && e.type !== 'handoff');
  if (!edge) throw new OpError(`${from} is not connected to ${to}. Connect them first, or add the step with "after".`);
  const { id: edgeId, type, label } = edge;
  const ax = axes(b);
  const node = makeNode(b, 'step', cleanFields(fields));
  node[ax.main] = fromNode[ax.main] + fromNode[ax.mainSize] + GAP_MAIN;
  node[ax.cross] = toNode[ax.cross] + (toNode[ax.crossSize] - node[ax.crossSize]) / 2;
  node.laneId = toNode.laneId;
  b.nodes.push(node);
  b.edges = b.edges.filter((e) => e.id !== edgeId);
  connect(b, { source: from, target: node.id, type, label });
  connect(b, { source: node.id, target: to, type });
  ensureGap(b, node.id, to, new Set([node.id, from]));
  nudgeFree(b, node);
  return node.id;
}

export function spliceOut(b: Board, id: string): void {
  const preds = flowPreds(b, id);
  const succs = b.edges.filter((e) => e.source === id && e.type === 'flow').map((e) => e.target);
  b.edges = b.edges.filter((e) => !(e.type === 'flow' && (e.source === id || e.target === id)));
  for (const p of preds) for (const s of succs) if (p !== s) connect(b, { source: p, target: s });
}

export function branchParallel(b: Board, from: string, branches: BranchItem[][], joinAt?: string): string[][] {
  const fromNode = getNode(b, from);
  if (joinAt) getNode(b, joinAt);
  if (branches.length === 0 || branches.some((br) => br.length === 0)) throw new OpError('Each branch needs at least one step.');
  const existing = branches.flat().filter(isExisting).map((i) => i.existing);
  for (const id of existing) {
    getNode(b, id);
    if (id === from || id === joinAt) throw new OpError(`${id} cannot be both the branch point or join and a step inside a branch.`);
  }
  if (new Set(existing).size !== existing.length) throw new OpError('A step can only appear once across branches.');

  for (const id of existing) spliceOut(b, id);
  if (joinAt) b.edges = b.edges.filter((e) => !(e.source === from && e.target === joinAt && e.type === 'flow'));

  const ids = branches.map((branch) => branch.map((item) => (isExisting(item) ? item.existing : pushStep(b, item))));
  for (const branch of ids) {
    let prev: BoardNode = fromNode;
    for (const id of branch) {
      const n = getNode(b, id);
      positionAfter(b, prev, n);
      nudgeFree(b, n);
      syncLane(b, n);
      prev = n;
    }
    connect(b, { source: from, target: branch[0] });
    for (let i = 1; i < branch.length; i++) connect(b, { source: branch[i - 1], target: branch[i] });
    if (joinAt) connect(b, { source: branch[branch.length - 1], target: joinAt });
  }
  if (joinAt) {
    const exclude = new Set([from, ...ids.flat()]);
    for (const branch of ids) ensureGap(b, branch[branch.length - 1], joinAt, exclude);
  }
  return ids;
}

export function moveSteps(b: Board, args: MoveArgs): string[] {
  const nodes = args.ids.map((id) => getNode(b, id));
  if (args.relation && args.anchor) {
    const anchor = getNode(b, args.anchor);
    if (args.ids.includes(anchor.id)) throw new OpError('A step cannot be moved relative to itself.');
    let prev = anchor;
    for (const n of nodes) {
      if (args.relation === 'after') positionAfter(b, prev, n);
      else if (args.relation === 'before') positionBefore(b, prev, n);
      else positionBeside(b, prev, n, args.relation === 'below' ? 1 : -1);
      nudgeFree(b, n, args.relation === 'above' ? -1 : 1);
      syncLane(b, n);
      prev = n;
    }
  } else if (args.laneId) {
    assertLane(b, args.laneId);
    for (const n of nodes) {
      placeInLane(b, n, args.laneId);
      nudgeFree(b, n, 1, 'main');
    }
  } else if (args.groupId) {
    addToGroup(b, args.ids, args.groupId, true);
  } else {
    throw new OpError('Say where to move: a relation with an anchor step, a lane, or a group.');
  }
  const groups = new Set(nodes.map((n) => n.groupId).filter((g): g is string => !!g));
  for (const g of groups) fitGroup(b, g);
  return args.ids;
}

export function addStepOnSide(b: Board, id: string, side: Side): string {
  const anchor = getNode(b, id);
  const ax = axes(b);
  const forward: Side = ax.main === 'x' ? 'right' : 'bottom';
  const backward: Side = ax.main === 'x' ? 'left' : 'top';
  if (side === forward) return addStep(b, { after: id, actor: anchor.actor });
  if (side === backward) return addStep(b, { before: id, actor: anchor.actor });
  const node = makeNode(b, 'step', { actor: anchor.actor });
  const dir = side === 'bottom' || side === 'right' ? 1 : -1;
  positionBeside(b, anchor, node, dir);
  nudgeFree(b, node, dir);
  syncLane(b, node);
  b.nodes.push(node);
  connect(b, { source: id, target: node.id, sourceSide: side, targetSide: OPPOSITE[side] });
  return node.id;
}

export function addNext(b: Board, id: string): string {
  return addStepOnSide(b, id, axes(b).main === 'x' ? 'right' : 'bottom');
}

export function addSibling(b: Board, id: string): string {
  const anchor = getNode(b, id);
  const node = makeNode(b, 'step', { actor: anchor.actor });
  positionBeside(b, anchor, node, 1);
  nudgeFree(b, node, 1);
  syncLane(b, node);
  b.nodes.push(node);
  const parent = flowPreds(b, id)[0];
  if (parent) connect(b, { source: parent, target: node.id });
  return node.id;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/ops`
Expected: PASS (both op test files).

- [ ] **Step 5: Commit**

```bash
git add src/ops
git commit -m "Add structural ops: insert between, parallel branches, moves, side steps"
```

---

### Task 6: Annotation ops: lanes, groups, flags, text, clipboard

**Files:**
- Modify: `src/ops/lanes.ts`, `src/ops/groups.ts` (append functions)
- Create: `src/ops/flags.ts`, `src/ops/text.ts`, `src/ops/clipboard.ts`, `src/ops/board.ts`
- Test: `src/ops/annotations.test.ts`

**Interfaces:**
- Produces:
  - `setLanes(b, names: string[]): string[]`, `renameLane(b, id, name)`, `resizeLane(b, id, height)`.
  - `groupSteps(b, ids: string[], title: string): string`, `ungroup(b, groupId)`.
  - `addFlag(b, targetId, kind: FlagKind, text: string): string`, `setFlagResolved(b, flagId, resolved: boolean)`, `updateFlagText(b, flagId, text)`, `removeFlag(b, flagId)`, `openFlags(b): OpenFlag[]` with `OpenFlag = { flag: Flag; hostId: string; hostKind: 'node' | 'edge' }`.
  - `addText(b, args: { text: string; x?: number; y?: number; near?: string }): string`.
  - `interface Clip { nodes: BoardNode[]; edges: BoardEdge[] }`, `copySubgraph(b, ids): Clip`, `pasteSubgraph(b, clip, dx, dy): string[]`.
  - `setDirection(b, direction: Direction)`, `renameBoard(b, name)` in `board.ts`.

- [ ] **Step 1: Write the failing tests**

`src/ops/annotations.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { makeNode } from '../model/factory';
import { copySubgraph, pasteSubgraph } from './clipboard';
import { addFlag, openFlags, removeFlag, setFlagResolved, updateFlagText } from './flags';
import { groupSteps, ungroup } from './groups';
import { renameLane, resizeLane, setLanes } from './lanes';
import { addStep } from './steps';
import { addText } from './text';
import { byTitle, chain, links, node } from './testkit';

describe('lanes', () => {
  it('creates lanes in order', () => {
    const { b } = chain([]);
    const ids = setLanes(b, ['Customer', ' Ops ']);
    expect(b.lanes).toEqual([
      { id: ids[0], name: 'Customer', order: 0, height: 240 },
      { id: ids[1], name: 'Ops', order: 1, height: 240 },
    ]);
  });

  it('keeps lane ids by name, reorders, and moves members with their band', () => {
    const { b } = chain([]);
    const [cust, ops] = setLanes(b, ['Customer', 'Ops']);
    const s = addStep(b, { title: 'A', laneId: ops });
    const yBefore = node(b, s).y;
    const again = setLanes(b, ['ops', 'Customer', 'Legal']);
    expect(again[0]).toBe(ops);
    expect(again[1]).toBe(cust);
    expect(node(b, s).y).toBe(yBefore - 240);
  });

  it('clears membership of removed lanes and rejects duplicates', () => {
    const { b } = chain([]);
    const [cust] = setLanes(b, ['Customer']);
    const s = addStep(b, { title: 'A', laneId: cust });
    setLanes(b, ['Ops']);
    expect(node(b, s).laneId).toBeNull();
    expect(() => setLanes(b, ['A', 'a'])).toThrow(/Duplicate lane/);
  });

  it('renames and resizes lanes', () => {
    const { b } = chain([]);
    const [id] = setLanes(b, ['X']);
    renameLane(b, id, 'Finance');
    resizeLane(b, id, 50);
    expect(b.lanes[0]).toMatchObject({ name: 'Finance', height: 120 });
  });
});

describe('groups', () => {
  it('groups steps and fits the frame', () => {
    const { b, ids } = chain(['A', 'B']);
    const g = groupSteps(b, ids, 'Intake');
    expect(node(b, g)).toMatchObject({ kind: 'group', title: 'Intake' });
    expect(ids.every((id) => node(b, id).groupId === g)).toBe(true);
    expect(node(b, g).x).toBeLessThan(0);
  });

  it('rejects empty and nested groups, and ungroups', () => {
    const { b, ids } = chain(['A']);
    expect(() => groupSteps(b, [], 'X')).toThrow(/at least one/);
    const g = groupSteps(b, ids, 'G');
    expect(() => groupSteps(b, [g], 'H')).toThrow(/cannot be nested/);
    ungroup(b, g);
    expect(node(b, ids[0]).groupId).toBeNull();
    expect(b.nodes.some((n) => n.id === g)).toBe(false);
  });
});

describe('flags', () => {
  it('flags steps and arrows, resolves, edits, removes, and lists open flags', () => {
    const { b, ids } = chain(['A', 'B']);
    const f1 = addFlag(b, ids[0], 'blocker', 'No API access');
    const f2 = addFlag(b, b.edges[0].id, 'question', 'Who approves?');
    expect(openFlags(b).map((o) => [o.flag.id, o.hostKind])).toEqual([[f1, 'node'], [f2, 'edge']]);
    setFlagResolved(b, f1, true);
    updateFlagText(b, f2, 'Who signs off?');
    expect(openFlags(b).map((o) => o.flag.text)).toEqual(['Who signs off?']);
    removeFlag(b, f2);
    expect(b.edges[0].flags).toEqual([]);
  });

  it('rejects unknown targets and flags', () => {
    const { b } = chain(['A']);
    expect(() => addFlag(b, 's99', 'warning', 'x')).toThrow(/Unknown step or arrow/);
    expect(() => removeFlag(b, 'f99')).toThrow(/Unknown flag/);
  });
});

describe('text', () => {
  it('adds free text above a step', () => {
    const { b, ids } = chain(['A']);
    const t = addText(b, { text: 'Note', near: ids[0] });
    expect(node(b, t)).toMatchObject({ kind: 'text', title: 'Note' });
    expect(node(b, t).y).toBeLessThan(0);
  });
});

describe('clipboard', () => {
  it('copies internal arrows only and remaps ids and groups', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    const g = groupSteps(b, [ids[0], ids[1]], 'G');
    addFlag(b, ids[0], 'warning', 'Risk');
    const clip = copySubgraph(b, [g]);
    expect(clip.nodes.map((n) => n.title)).toEqual(['A', 'B', 'G']);
    expect(clip.edges).toHaveLength(1);
    const pasted = pasteSubgraph(b, clip, 40, 40);
    expect(pasted).toHaveLength(3);
    const newGroup = pasted.map((id) => node(b, id)).find((n) => n.kind === 'group')!;
    const copies = pasted.map((id) => node(b, id)).filter((n) => n.kind === 'step');
    expect(copies.every((n) => n.groupId === newGroup.id)).toBe(true);
    expect(links(b).filter((l) => l === 'A>B')).toHaveLength(2);
    expect(copies[0].flags[0].id).not.toBe(byTitle(b, 'A').flags[0].id);
  });

  it('ignores the clip when nothing is selected', () => {
    const { b } = chain(['A']);
    expect(pasteSubgraph(b, copySubgraph(b, []), 10, 10)).toEqual([]);
    const lone = makeNode(b, 'text', { title: 'x' });
    b.nodes.push(lone);
    expect(copySubgraph(b, [lone.id]).nodes).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/ops/annotations.test.ts`
Expected: FAIL, missing exports.

- [ ] **Step 3: Implement**

Append to `src/ops/lanes.ts` (add `allocId` and `LANE_SIZE` to its imports from `../model/factory`, and `laneBands` to the `../layout/place` import):
```ts
export function setLanes(b: Board, names: string[]): string[] {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  const lowered = clean.map((n) => n.toLowerCase());
  if (new Set(lowered).size !== lowered.length) throw new OpError('Duplicate lane names.');
  const ax = axes(b);
  const oldStart = new Map(laneBands(b).map((band) => [band.id, band.start]));
  const byName = new Map(b.lanes.map((l) => [l.name.toLowerCase(), l]));
  b.lanes = clean.map((name, order) => {
    const found = byName.get(name.toLowerCase());
    return found ? { id: found.id, name, order, height: found.height } : { id: allocId(b, 'l'), name, order, height: LANE_SIZE };
  });
  const newStart = new Map(laneBands(b).map((band) => [band.id, band.start]));
  for (const n of b.nodes) {
    if (!n.laneId) continue;
    const before = oldStart.get(n.laneId);
    const after = newStart.get(n.laneId);
    if (after === undefined || before === undefined) n.laneId = null;
    else n[ax.cross] += after - before;
  }
  return b.lanes.map((l) => l.id);
}

export function renameLane(b: Board, id: string, name: string): void {
  assertLane(b, id);
  b.lanes.find((l) => l.id === id)!.name = name.trim();
}

export function resizeLane(b: Board, id: string, height: number): void {
  assertLane(b, id);
  const ax = axes(b);
  const lane = b.lanes.find((l) => l.id === id)!;
  const delta = Math.max(120, height) - lane.height;
  const below = new Set(b.lanes.filter((l) => l.order > lane.order).map((l) => l.id));
  lane.height += delta;
  for (const n of b.nodes) if (n.laneId && below.has(n.laneId)) n[ax.cross] += delta;
}
```

Append to `src/ops/groups.ts` (add `makeNode` import from `../model/factory`):
```ts
export function groupSteps(b: Board, ids: string[], title: string): string {
  if (ids.length === 0) throw new OpError('A group needs at least one step.');
  for (const id of ids) if (getNode(b, id).kind === 'group') throw new OpError('Groups cannot be nested.');
  const group = makeNode(b, 'group', { title: title.trim() });
  b.nodes.push(group);
  addToGroup(b, ids, group.id);
  return group.id;
}

export function ungroup(b: Board, groupId: string): void {
  const group = getNode(b, groupId);
  if (group.kind !== 'group') throw new OpError(`"${groupId}" is not a group.`);
  for (const n of b.nodes) if (n.groupId === groupId) n.groupId = null;
  b.nodes = b.nodes.filter((n) => n.id !== groupId);
}
```

`src/ops/flags.ts`:
```ts
import { makeFlag } from '../model/factory';
import type { Board, Flag, FlagKind } from '../model/types';
import { OpError } from './errors';

export interface OpenFlag {
  flag: Flag;
  hostId: string;
  hostKind: 'node' | 'edge';
}

function host(b: Board, targetId: string): { flags: Flag[] } {
  const found = b.nodes.find((n) => n.id === targetId) ?? b.edges.find((e) => e.id === targetId);
  if (!found) throw new OpError(`Unknown step or arrow "${targetId}".`);
  return found;
}

function locate(b: Board, flagId: string): { owner: { flags: Flag[] }; flag: Flag } {
  for (const owner of [...b.nodes, ...b.edges]) {
    const flag = owner.flags.find((f) => f.id === flagId);
    if (flag) return { owner, flag };
  }
  throw new OpError(`Unknown flag "${flagId}".`);
}

export function addFlag(b: Board, targetId: string, kind: FlagKind, text: string): string {
  const owner = host(b, targetId);
  const flag = makeFlag(b, kind, text.trim());
  owner.flags.push(flag);
  return flag.id;
}

export function setFlagResolved(b: Board, flagId: string, resolved: boolean): void {
  locate(b, flagId).flag.resolved = resolved;
}

export function updateFlagText(b: Board, flagId: string, text: string): void {
  locate(b, flagId).flag.text = text.trim();
}

export function removeFlag(b: Board, flagId: string): void {
  const { owner } = locate(b, flagId);
  owner.flags = owner.flags.filter((f) => f.id !== flagId);
}

export function openFlags(b: Board): OpenFlag[] {
  const out: OpenFlag[] = [];
  for (const n of b.nodes) for (const flag of n.flags) if (!flag.resolved) out.push({ flag, hostId: n.id, hostKind: 'node' });
  for (const e of b.edges) for (const flag of e.flags) if (!flag.resolved) out.push({ flag, hostId: e.id, hostKind: 'edge' });
  return out;
}
```

`src/ops/text.ts`:
```ts
import { makeNode } from '../model/factory';
import type { Board } from '../model/types';
import { nudgeFree, positionAtEnd, positionBeside } from '../layout/place';
import { getNode } from './query';

export function addText(b: Board, args: { text: string; x?: number; y?: number; near?: string }): string {
  const node = makeNode(b, 'text', { title: args.text.trim() });
  if (args.near) {
    positionBeside(b, getNode(b, args.near), node, -1);
    nudgeFree(b, node, -1);
  } else if (args.x !== undefined && args.y !== undefined) {
    node.x = args.x;
    node.y = args.y;
  } else {
    positionAtEnd(b, node);
    nudgeFree(b, node);
  }
  b.nodes.push(node);
  return node.id;
}
```

`src/ops/clipboard.ts`:
```ts
import { allocId, makeNode } from '../model/factory';
import type { Board, BoardEdge, BoardNode, Flag } from '../model/types';

export interface Clip {
  nodes: BoardNode[];
  edges: BoardEdge[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function copySubgraph(b: Board, ids: string[]): Clip {
  const picked = new Set(ids);
  for (const n of b.nodes) if (n.groupId && picked.has(n.groupId)) picked.add(n.id);
  return {
    nodes: clone(b.nodes.filter((n) => picked.has(n.id))),
    edges: clone(b.edges.filter((e) => picked.has(e.source) && picked.has(e.target))),
  };
}

export function pasteSubgraph(b: Board, clip: Clip, dx: number, dy: number): string[] {
  const idMap = new Map<string, string>();
  const freshFlags = (flags: Flag[]) => flags.map((f) => ({ ...f, id: allocId(b, 'f') }));
  const laneIds = new Set(b.lanes.map((l) => l.id));
  const created: BoardNode[] = [];
  for (const src of clip.nodes) {
    const copy = makeNode(b, src.kind, { ...src, x: src.x + dx, y: src.y + dy, flags: [] });
    copy.flags = freshFlags(src.flags);
    copy.laneId = src.laneId && laneIds.has(src.laneId) ? src.laneId : null;
    idMap.set(src.id, copy.id);
    created.push(copy);
  }
  for (const copy of created) copy.groupId = copy.groupId ? (idMap.get(copy.groupId) ?? null) : null;
  b.nodes.push(...created);
  for (const e of clip.edges) {
    b.edges.push({ ...e, id: allocId(b, 'e'), source: idMap.get(e.source)!, target: idMap.get(e.target)!, flags: freshFlags(e.flags) });
  }
  return created.map((n) => n.id);
}
```

`src/ops/board.ts`:
```ts
import type { Board, Direction } from '../model/types';

export function setDirection(b: Board, direction: Direction): void {
  b.direction = direction;
}

export function renameBoard(b: Board, name: string): void {
  b.name = name.trim() || b.name;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/ops`
Expected: PASS. Note `copySubgraph` in the clipboard test returns nodes in board order, so `['A', 'B', 'G']` holds because the group node is pushed after the steps.

- [ ] **Step 5: Commit**

```bash
git add src/ops
git commit -m "Add lanes, groups, flags, free text and clipboard ops"
```

---

### Task 7: Analysis: critical path and board summary

**Files:**
- Create: `src/analysis/criticalPath.ts`, `src/analysis/summary.ts`
- Test: `src/analysis/criticalPath.test.ts`, `src/analysis/summary.test.ts`

**Interfaces:**
- Consumes: Task 2 model, `formatDuration`, Task 4 test kit.
- Produces:
  - `interface CriticalPathResult { nodeIds: string[]; edgeIds: string[]; totalMin: number; ignoredEdgeIds: string[]; missingDuration: string[] }`, `criticalPath(board): CriticalPathResult`.
  - `summarizeBoard(project: Project, boardId: string): string`.

- [ ] **Step 1: Write the failing tests**

`src/analysis/criticalPath.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { connect } from '../ops/edges';
import { addStep } from '../ops/steps';
import { branchParallel } from '../ops/structure';
import { byTitle, chain } from '../ops/testkit';
import { criticalPath } from './criticalPath';

function setDur(b: ReturnType<typeof chain>['b'], title: string, minutes: number | null) {
  byTitle(b, title).durationMin = minutes;
}

describe('criticalPath', () => {
  it('is empty for an empty board', () => {
    const { b } = chain([]);
    expect(criticalPath(b)).toEqual({ nodeIds: [], edgeIds: [], totalMin: 0, ignoredEdgeIds: [], missingDuration: [] });
  });

  it('picks the longest parallel branch', () => {
    const { b, ids } = chain(['Start', 'End']);
    branchParallel(b, ids[0], [[{ title: 'Fast' }], [{ title: 'Slow' }]], ids[1]);
    setDur(b, 'Start', 60);
    setDur(b, 'Fast', 30);
    setDur(b, 'Slow', 480);
    setDur(b, 'End', 60);
    const cp = criticalPath(b);
    expect(cp.nodeIds.map((id) => b.nodes.find((n) => n.id === id)!.title)).toEqual(['Start', 'Slow', 'End']);
    expect(cp.totalMin).toBe(600);
    expect(cp.edgeIds).toHaveLength(2);
  });

  it('counts dependency arrows and ignores handoffs', () => {
    const { b, ids } = chain(['A', 'B']);
    const c = addStep(b, { title: 'C', x: 0, y: 300, durationMin: 1000 });
    connect(b, { source: c, target: ids[1], type: 'dependency' });
    const d = addStep(b, { title: 'D', x: 0, y: 600, durationMin: 5000 });
    connect(b, { source: d, target: ids[0], type: 'handoff' });
    const cp = criticalPath(b);
    expect(cp.nodeIds).toEqual([d]);
    expect(cp.totalMin).toBe(5000);
    byTitle(b, 'D').durationMin = 1;
    expect(criticalPath(b).nodeIds).toEqual([c, ids[1]]);
  });

  it('ignores loop-closing arrows instead of hanging', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    connect(b, { source: ids[2], target: ids[1], label: 'Rework' });
    const cp = criticalPath(b);
    expect(cp.nodeIds).toEqual(ids);
    expect(cp.ignoredEdgeIds).toHaveLength(1);
  });

  it('falls back to the longest chain when durations are missing and reports them', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    const cp = criticalPath(b);
    expect(cp.nodeIds).toEqual(ids);
    expect(cp.missingDuration).toEqual(ids);
  });
});
```

`src/analysis/summary.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createBoard, createProject } from '../model/factory';
import { addFlag } from '../ops/flags';
import { groupSteps } from '../ops/groups';
import { setLanes } from '../ops/lanes';
import { addStep } from '../ops/steps';
import { addText } from '../ops/text';
import { summarizeBoard } from './summary';

describe('summarizeBoard', () => {
  it('describes steps, arrows, lanes, groups, flags and other boards', () => {
    const project = createProject('P');
    const b = project.boards[0];
    b.name = 'Future v1';
    const other = createBoard('Current');
    project.boards.push(other);
    const [lane] = setLanes(b, ['Intake']);
    const s1 = addStep(b, { title: 'Collect "docs"', actor: 'agent', owner: 'Intake Agent', durationMin: 30, laneId: lane });
    const s2 = addStep(b, { title: 'Review', after: s1, edgeLabel: 'ok', status: 'planned', note: 'Human check' });
    addFlag(b, s2, 'blocker', 'No reviewer');
    groupSteps(b, [s1, s2], 'Phase 1');
    addText(b, { text: 'Draft', x: 0, y: -200 });

    expect(summarizeBoard(project, b.id)).toBe(
      [
        `Board "Future v1" (id ${b.id}, direction LR). Other boards: "Current".`,
        'Lanes: l1 "Intake"',
        'Groups:',
        'g6 "Phase 1": s2, s3',
        'Steps:',
        's2 [process|agent] "Collect \\"docs\\"" owner="Intake Agent" dur=30m lane=l1',
        's3 [process] "Review" status=planned lane=l1 note="Human check" flags=[blocker f5 "No reviewer"]',
        'Text notes:',
        't7 "Draft"',
        'Arrows:',
        'e4: s2 -> s3 flow "ok"',
      ].join('\n'),
    );
  });

  it('marks an empty board', () => {
    const project = createProject();
    expect(summarizeBoard(project, project.boards[0].id)).toContain('Steps: none');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/analysis`
Expected: FAIL, missing modules.

- [ ] **Step 3: Implement**

`src/analysis/criticalPath.ts`:
```ts
import type { Board, BoardEdge } from '../model/types';

export interface CriticalPathResult {
  nodeIds: string[];
  edgeIds: string[];
  totalMin: number;
  ignoredEdgeIds: string[];
  missingDuration: string[];
}

function backEdges(ids: string[], edges: BoardEdge[]): Set<string> {
  const out = new Map<string, BoardEdge[]>();
  const hasIncoming = new Set<string>();
  for (const e of edges) {
    out.set(e.source, [...(out.get(e.source) ?? []), e]);
    hasIncoming.add(e.target);
  }
  const color = new Map<string, 1 | 2>();
  const back = new Set<string>();
  const roots = [...ids.filter((id) => !hasIncoming.has(id)), ...ids];
  for (const root of roots) {
    if (color.has(root)) continue;
    color.set(root, 1);
    const stack: Array<{ id: string; i: number }> = [{ id: root, i: 0 }];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const list = out.get(top.id) ?? [];
      if (top.i < list.length) {
        const e = list[top.i++];
        const c = color.get(e.target);
        if (c === 1) back.add(e.id);
        else if (c === undefined) {
          color.set(e.target, 1);
          stack.push({ id: e.target, i: 0 });
        }
      } else {
        color.set(top.id, 2);
        stack.pop();
      }
    }
  }
  return back;
}

export function criticalPath(board: Board): CriticalPathResult {
  const steps = board.nodes.filter((n) => n.kind === 'step');
  const byId = new Map(steps.map((s) => [s.id, s]));
  const edges = board.edges.filter((e) => e.type !== 'handoff' && byId.has(e.source) && byId.has(e.target));
  const ignored = backEdges(steps.map((s) => s.id), edges);
  const dag = edges.filter((e) => !ignored.has(e.id));

  const incoming = new Map<string, BoardEdge[]>();
  const outgoing = new Map<string, BoardEdge[]>();
  const indegree = new Map(steps.map((s) => [s.id, 0]));
  for (const e of dag) {
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), e]);
    outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e]);
    indegree.set(e.target, indegree.get(e.target)! + 1);
  }
  const queue = steps.filter((s) => indegree.get(s.id) === 0).map((s) => s.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of outgoing.get(id) ?? []) {
      indegree.set(e.target, indegree.get(e.target)! - 1);
      if (indegree.get(e.target) === 0) queue.push(e.target);
    }
  }

  const score = new Map<string, { dist: number; hops: number }>();
  const via = new Map<string, BoardEdge>();
  const better = (a: { dist: number; hops: number }, b: { dist: number; hops: number }) =>
    a.dist > b.dist || (a.dist === b.dist && a.hops > b.hops);
  let end: string | undefined;
  for (const id of order) {
    let best = { dist: 0, hops: 0 };
    let bestEdge: BoardEdge | undefined;
    for (const e of incoming.get(id) ?? []) {
      const s = score.get(e.source)!;
      if (!bestEdge || better(s, best)) {
        best = s;
        bestEdge = e;
      }
    }
    score.set(id, { dist: best.dist + (byId.get(id)!.durationMin ?? 0), hops: best.hops + 1 });
    if (bestEdge) via.set(id, bestEdge);
    if (!end || better(score.get(id)!, score.get(end)!)) end = id;
  }
  if (!end) return { nodeIds: [], edgeIds: [], totalMin: 0, ignoredEdgeIds: [], missingDuration: [] };

  const nodeIds = [end];
  const edgeIds: string[] = [];
  for (let cur = end; via.has(cur); ) {
    const e = via.get(cur)!;
    edgeIds.unshift(e.id);
    cur = e.source;
    nodeIds.unshift(cur);
  }
  return {
    nodeIds,
    edgeIds,
    totalMin: score.get(end)!.dist,
    ignoredEdgeIds: [...ignored],
    missingDuration: nodeIds.filter((id) => byId.get(id)!.durationMin === null),
  };
}
```

`src/analysis/summary.ts`:
```ts
import { formatDuration } from '../model/duration';
import type { BoardNode, Flag, Project } from '../model/types';

const q = (s: string) => JSON.stringify(s);

function describeFlags(flags: Flag[]): string {
  if (flags.length === 0) return '';
  const items = flags.map((f) => `${f.kind} ${f.id} ${q(f.text)}${f.resolved ? ' (resolved)' : ''}`);
  return ` flags=[${items.join('; ')}]`;
}

function describeStep(n: BoardNode): string {
  const parts = [n.id, `[${n.shape}${n.actor ? `|${n.actor}` : ''}]`, q(n.title || '(untitled)')];
  if (n.owner) parts.push(`owner=${q(n.owner)}`);
  if (n.durationMin !== null) parts.push(`dur=${formatDuration(n.durationMin)}`);
  if (n.status) parts.push(`status=${n.status}`);
  if (n.laneId) parts.push(`lane=${n.laneId}`);
  if (n.note) parts.push(`note=${q(n.note)}`);
  if (n.replaces) parts.push(`replaces=${q(n.replaces)}`);
  return parts.join(' ') + describeFlags(n.flags);
}

export function summarizeBoard(project: Project, boardId: string): string {
  const b = project.boards.find((x) => x.id === boardId);
  if (!b) return `No board ${boardId}.`;
  const others = project.boards.filter((x) => x.id !== b.id).map((x) => q(x.name));
  const lines = [`Board ${q(b.name)} (id ${b.id}, direction ${b.direction}).${others.length ? ` Other boards: ${others.join(', ')}.` : ''}`];
  if (b.lanes.length) {
    const lanes = [...b.lanes].sort((a, c) => a.order - c.order);
    lines.push(`Lanes: ${lanes.map((l) => `${l.id} ${q(l.name)}`).join(', ')}`);
  }
  const groups = b.nodes.filter((n) => n.kind === 'group');
  if (groups.length) {
    lines.push('Groups:');
    for (const g of groups) {
      const members = b.nodes.filter((n) => n.groupId === g.id).map((n) => n.id);
      lines.push(`${g.id} ${q(g.title)}: ${members.join(', ') || '(empty)'}`);
    }
  }
  const steps = b.nodes.filter((n) => n.kind === 'step');
  lines.push(steps.length ? 'Steps:' : 'Steps: none');
  for (const s of steps) lines.push(describeStep(s));
  const texts = b.nodes.filter((n) => n.kind === 'text');
  if (texts.length) {
    lines.push('Text notes:');
    for (const t of texts) lines.push(`${t.id} ${q(t.title)}`);
  }
  if (b.edges.length) {
    lines.push('Arrows:');
    for (const e of b.edges) {
      lines.push(`${e.id}: ${e.source} -> ${e.target} ${e.type}${e.label ? ` ${q(e.label)}` : ''}${describeFlags(e.flags)}`);
    }
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/analysis`
Expected: PASS. If the summary test's ids differ, trace the id allocation order in the test (lane `l1`, steps `s2`, `s3`, edge `e4`, flag `f5`, group `g6`, text `t7`) before touching the implementation; the order is the contract.

- [ ] **Step 5: Commit**

```bash
git add src/analysis
git commit -m "Add critical path analysis and LLM board summary"
```

---

### Task 8: Tidy (ELK auto-layout) with lane-aware placement

**Files:**
- Create: `src/layout/tidy.ts`, `src/layout/elkClient.ts`
- Modify: `src/ops/board.ts` (add `applyTidy`)
- Test: `src/layout/tidy.test.ts`

**Interfaces:**
- Consumes: Task 3 (`axes`, `laneBands`, `GAP_CROSS`, `GAP_MAIN`, `overlaps`, `fitGroup`), Task 4 test kit.
- Produces:
  - `interface TidyResult { positions: Record<string, { x: number; y: number }>; laneHeights: Record<string, number> }`, `computeTidy(elk: ELK, board: Board): Promise<TidyResult>`.
  - `applyTidy(b: Board, result: TidyResult): void` in `src/ops/board.ts`.
  - `getElk(): ELK` in `src/layout/elkClient.ts` (browser only, Web Worker backed).

- [ ] **Step 1: Write the failing tests**

`src/layout/tidy.test.ts`:
```ts
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { applyTidy } from '../ops/board';
import { setLanes } from '../ops/lanes';
import { addStep } from '../ops/steps';
import { addText } from '../ops/text';
import { branchParallel } from '../ops/structure';
import { byTitle, chain } from '../ops/testkit';
import { laneBands, overlaps } from './place';
import { computeTidy } from './tidy';

const elk = new ELK();

function scramble(b: ReturnType<typeof chain>['b']) {
  b.nodes.forEach((n, i) => {
    n.x = ((i * 7919) % 13) * 37;
    n.y = ((i * 104729) % 11) * 29;
  });
}

function noOverlaps(b: ReturnType<typeof chain>['b']) {
  const steps = b.nodes.filter((n) => n.kind === 'step');
  for (const a of steps) for (const c of steps) if (a !== c) expect(overlaps(a, c, 0), `${a.title}/${c.title}`).toBe(false);
}

describe('computeTidy', () => {
  it('lays a chain out left to right', async () => {
    const { b } = chain(['A', 'B', 'C']);
    scramble(b);
    applyTidy(b, await computeTidy(elk, b));
    const [A, B, C] = ['A', 'B', 'C'].map((t) => byTitle(b, t));
    expect(A.x).toBeLessThan(B.x);
    expect(B.x).toBeLessThan(C.x);
    noOverlaps(b);
  });

  it('lays a chain out top to bottom when direction is TB', async () => {
    const { b } = chain(['A', 'B']);
    b.direction = 'TB';
    scramble(b);
    applyTidy(b, await computeTidy(elk, b));
    expect(byTitle(b, 'A').y).toBeLessThan(byTitle(b, 'B').y);
  });

  it('separates parallel branches', async () => {
    const { b, ids } = chain(['A', 'D']);
    branchParallel(b, ids[0], [[{ title: 'B' }], [{ title: 'C' }]], ids[1]);
    scramble(b);
    applyTidy(b, await computeTidy(elk, b));
    expect(byTitle(b, 'B').x).toBe(byTitle(b, 'C').x);
    noOverlaps(b);
  });

  it('keeps lane members inside their bands and grows crowded lanes', async () => {
    const { b } = chain([]);
    const [ops, legal] = setLanes(b, ['Ops', 'Legal']);
    const a = addStep(b, { title: 'A', laneId: ops });
    for (const t of ['B', 'C', 'D']) addStep(b, { title: t, after: a, laneId: ops });
    addStep(b, { title: 'E', after: a, laneId: legal });
    applyTidy(b, await computeTidy(elk, b));
    const bands = laneBands(b);
    for (const n of b.nodes) {
      const band = bands.find((x) => x.id === n.laneId)!;
      expect(n.y).toBeGreaterThanOrEqual(band.start);
      expect(n.y + n.h).toBeLessThanOrEqual(band.start + band.size);
    }
    expect(b.lanes.find((l) => l.id === ops)!.height).toBeGreaterThan(240);
    noOverlaps(b);
  });

  it('leaves free text where it is', async () => {
    const { b, ids } = chain(['A', 'B']);
    const t = addText(b, { text: 'note', x: 999, y: 999 });
    applyTidy(b, await computeTidy(elk, b));
    expect(b.nodes.find((n) => n.id === t)).toMatchObject({ x: 999, y: 999 });
    expect(ids).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/layout/tidy.test.ts`
Expected: FAIL, cannot resolve `./tidy`.

- [ ] **Step 3: Implement**

`src/layout/tidy.ts`:
```ts
import type { ELK, ElkNode } from 'elkjs/lib/elk-api';
import type { Board, BoardNode } from '../model/types';
import { axes, GAP_CROSS, GAP_MAIN, laneBands } from './place';

export interface TidyResult {
  positions: Record<string, { x: number; y: number }>;
  laneHeights: Record<string, number>;
}

const LANE_PAD = 32;
const ROW_CLEARANCE = 24;
const BELOW_LANES = 80;

export async function computeTidy(elk: ELK, board: Board): Promise<TidyResult> {
  const nodes = board.nodes.filter((n) => n.kind === 'step');
  const ids = new Set(nodes.map((n) => n.id));
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': board.direction === 'LR' ? 'RIGHT' : 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(GAP_MAIN),
      'elk.spacing.nodeNode': String(GAP_CROSS),
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': '120',
    },
    children: nodes.map((n) => ({ id: n.id, width: n.w, height: n.h })),
    edges: board.edges
      .filter((e) => e.type !== 'handoff' && ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const out = await elk.layout(graph);
  const positions: TidyResult['positions'] = {};
  for (const c of out.children ?? []) positions[c.id] = { x: c.x ?? 0, y: c.y ?? 0 };
  const laneHeights: TidyResult['laneHeights'] = {};
  if (board.lanes.length) arrangeLanes(board, nodes, positions, laneHeights);
  return { positions, laneHeights };
}

function arrangeLanes(board: Board, nodes: BoardNode[], positions: TidyResult['positions'], laneHeights: TidyResult['laneHeights']): void {
  const ax = axes(board);
  const bands = laneBands(board);
  let start = 0;
  for (const band of bands) {
    const members = nodes.filter((n) => n.laneId === band.id).sort((a, b) => positions[a.id][ax.main] - positions[b.id][ax.main]);
    const rowSize = members.length ? Math.max(...members.map((m) => m[ax.crossSize])) : 0;
    const rowEnds: number[] = [];
    const rowOf = new Map<string, number>();
    for (const m of members) {
      const p = positions[m.id];
      let row = rowEnds.findIndex((end) => end + ROW_CLEARANCE <= p[ax.main]);
      if (row === -1) {
        row = rowEnds.length;
        rowEnds.push(0);
      }
      rowEnds[row] = p[ax.main] + m[ax.mainSize];
      rowOf.set(m.id, row);
    }
    const content = rowEnds.length * rowSize + Math.max(0, rowEnds.length - 1) * GAP_CROSS;
    const size = Math.max(band.size, content + LANE_PAD * 2);
    const offset = start + (size - content) / 2;
    for (const m of members) {
      positions[m.id][ax.cross] = offset + rowOf.get(m.id)! * (rowSize + GAP_CROSS) + (rowSize - m[ax.crossSize]) / 2;
    }
    laneHeights[band.id] = size;
    start += size;
  }
  const laneIds = new Set(bands.map((b) => b.id));
  const free = nodes.filter((n) => !n.laneId || !laneIds.has(n.laneId));
  if (free.length) {
    const minCross = Math.min(...free.map((n) => positions[n.id][ax.cross]));
    for (const n of free) positions[n.id][ax.cross] += start + BELOW_LANES - minCross;
  }
}
```

Append to `src/ops/board.ts` (add imports `import { fitGroup } from '../layout/place';` and `import type { TidyResult } from '../layout/tidy';`):
```ts
export function applyTidy(b: Board, result: TidyResult): void {
  for (const n of b.nodes) {
    const p = result.positions[n.id];
    if (p) {
      n.x = p.x;
      n.y = p.y;
    }
  }
  for (const lane of b.lanes) {
    const h = result.laneHeights[lane.id];
    if (h) lane.height = h;
  }
  for (const g of b.nodes) if (g.kind === 'group') fitGroup(b, g.id);
}
```

`src/layout/elkClient.ts`:
```ts
import ElkConstructor, { type ELK } from 'elkjs/lib/elk-api';
import workerUrl from 'elkjs/lib/elk-worker.min.js?url';

let instance: ELK | null = null;

export function getElk(): ELK {
  instance ??= new ElkConstructor({ workerUrl });
  return instance;
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/layout`
Expected: PASS. `elkClient.ts` is exercised in the browser in Task 13; if Vite cannot resolve the `?url` import of the worker file, run `npm ls elkjs` and check `node_modules/elkjs/lib/` for the worker filename before changing the approach.

- [ ] **Step 5: Commit**

```bash
git add src/layout src/ops/board.ts
git commit -m "Add ELK tidy layout with lane-aware rows"
```

---

### Task 9: Store: history, transactions, selection, boards, autosave

**Files:**
- Create: `src/store/store.ts`, `src/store/autosave.ts`, `src/layout/tidyBoard.ts`
- Test: `src/store/store.test.ts`, `src/store/autosave.test.ts`

**Interfaces:**
- Consumes: Task 2 model, Task 6 `Clip`, Task 8 `computeTidy`, `applyTidy`, `getElk`.
- Produces:
  - `type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'`, `interface HistoryEntry { id: number; project: Project }`.
  - `FlowState` fields: `project, activeBoardId, splitBoardId, selection, edgeSelection, past, future, tx, criticalPath, glow, saveStatus, clipboard, chatOpen, editingId, editSeed, exporting`.
  - `FlowActions`: `loadProject(p)`, `change<R>(fn: (draft: Project) => R): R`, `changeBoard<R>(fn: (b: Board) => R, boardId?: string): R`, `begin()`, `commit(): number | null`, `undo()`, `redo()`, `undoEntry(id): boolean`, `select(nodeIds, edgeIds?)`, `setActiveBoard(id)`, `setSplitBoard(id | null)`, `addBoard(name, activate?): string`, `deleteBoard(id)`, `toggleCriticalPath()`, `markGlow(ids)`, `setSaveStatus(s)`, `setClipboard(c)`, `setChatOpen(open)`, `setEditing(id: string | null, seed?: string)` (seed is the first typed character, or null), `setExporting(v)`.
  - `type FlowStore = FlowState & FlowActions`, `createFlowStore(initial?: Project): StoreApi<FlowStore>`, singleton `flowStore`, hook `useFlow<T>(selector: (s: FlowStore) => T): T`, selector `selectActiveBoard(s): Board`.
  - `interface AutosaveHandle { stop(): void; flush(): Promise<void> }` (`flush` waits for any in-flight save, saves pending changes, and throws if saving failed), `startAutosave(store, save: (p: Project) => Promise<unknown>, delayMs?: number, retryMs?: number): AutosaveHandle`.
  - `tidyBoard(store, boardId, elk?): Promise<void>` in `src/layout/tidyBoard.ts`.

- [ ] **Step 1: Write the failing store tests**

`src/store/store.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { addStep, deleteSteps } from '../ops/steps';
import { createFlowStore } from './store';

function setup() {
  const store = createFlowStore();
  const s = () => store.getState();
  return { store, s };
}

describe('flow store history', () => {
  it('records each change and undoes and redoes it', () => {
    const { s } = setup();
    const id = s().changeBoard((b) => addStep(b, { title: 'A' }));
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(s().project.boards[0].nodes).toHaveLength(0);
    s().redo();
    expect(s().project.boards[0].nodes[0].id).toBe(id);
  });

  it('groups a transaction into one entry, including nested ones', () => {
    const { s } = setup();
    s().begin();
    s().changeBoard((b) => addStep(b, { title: 'A' }));
    s().begin();
    s().changeBoard((b) => addStep(b, { title: 'B' }));
    expect(s().commit()).toBeNull();
    const entry = s().commit();
    expect(entry).toBeTypeOf('number');
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(s().project.boards[0].nodes).toHaveLength(0);
  });

  it('records nothing for an empty transaction', () => {
    const { s } = setup();
    s().begin();
    expect(s().commit()).toBeNull();
    expect(s().past).toHaveLength(0);
  });

  it('undoes a specific entry only while it is the latest', () => {
    const { s } = setup();
    s().begin();
    s().changeBoard((b) => addStep(b, { title: 'AI' }));
    const entry = s().commit()!;
    s().changeBoard((b) => addStep(b, { title: 'Me' }));
    expect(s().undoEntry(entry)).toBe(false);
    s().undo();
    expect(s().undoEntry(entry)).toBe(true);
    expect(s().project.boards[0].nodes).toHaveLength(0);
  });

  it('caps history at 200 entries', () => {
    const { s } = setup();
    for (let i = 0; i < 205; i++) s().changeBoard((b) => addStep(b, { title: `S${i}` }));
    expect(s().past).toHaveLength(200);
  });

  it('leaves state untouched when an op throws', () => {
    const { s } = setup();
    const before = s().project;
    expect(() => s().changeBoard((b) => addStep(b, { after: 's99' }))).toThrow('Unknown step');
    expect(s().project).toBe(before);
    expect(s().past).toHaveLength(0);
  });

  it('drops selection of nodes that no longer exist', () => {
    const { s } = setup();
    const id = s().changeBoard((b) => addStep(b, { title: 'A' }));
    s().select([id]);
    s().changeBoard((b) => deleteSteps(b, [id]));
    expect(s().selection).toEqual([]);
  });
});

describe('flow store boards', () => {
  it('adds boards with unique names and activates them', () => {
    const { s } = setup();
    const a = s().addBoard('Future');
    const b = s().addBoard('Future');
    expect(s().activeBoardId).toBe(b);
    expect(s().project.boards.map((x) => x.name)).toEqual(['Board 1', 'Future', 'Future 2']);
    expect(a).not.toBe(b);
  });

  it('refuses to delete the last board and repairs the active board on delete and undo', () => {
    const { s } = setup();
    expect(() => s().deleteBoard(s().activeBoardId)).toThrow(/at least one board/);
    const added = s().addBoard('Temp');
    s().deleteBoard(added);
    expect(s().activeBoardId).toBe(s().project.boards[0].id);
    s().undo();
    s().setActiveBoard(added);
    s().undo();
    expect(s().project.boards).toHaveLength(1);
    expect(s().activeBoardId).toBe(s().project.boards[0].id);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/store/store.test.ts`
Expected: FAIL, cannot resolve `./store`.

- [ ] **Step 3: Implement the store**

`src/store/store.ts`:
```ts
import { produce } from 'immer';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createBoard, createProject } from '../model/factory';
import type { Board, Project } from '../model/types';
import type { Clip } from '../ops/clipboard';
import { OpError } from '../ops/errors';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface HistoryEntry {
  id: number;
  project: Project;
}

export interface FlowState {
  project: Project;
  activeBoardId: string;
  splitBoardId: string | null;
  selection: string[];
  edgeSelection: string[];
  past: HistoryEntry[];
  future: HistoryEntry[];
  tx: { base: Project; depth: number } | null;
  criticalPath: boolean;
  glow: Record<string, number>;
  saveStatus: SaveStatus;
  clipboard: Clip | null;
  chatOpen: boolean;
  editingId: string | null;
  editSeed: string | null;
  exporting: boolean;
}

export interface FlowActions {
  loadProject(project: Project): void;
  change<R>(fn: (draft: Project) => R): R;
  changeBoard<R>(fn: (board: Board) => R, boardId?: string): R;
  begin(): void;
  commit(): number | null;
  undo(): void;
  redo(): void;
  undoEntry(id: number): boolean;
  select(nodeIds: string[], edgeIds?: string[]): void;
  setActiveBoard(id: string): void;
  setSplitBoard(id: string | null): void;
  addBoard(name: string, activate?: boolean): string;
  deleteBoard(id: string): void;
  toggleCriticalPath(): void;
  markGlow(ids: string[]): void;
  setSaveStatus(status: SaveStatus): void;
  setClipboard(clip: Clip | null): void;
  setChatOpen(open: boolean): void;
  setEditing(id: string | null, seed?: string): void;
  setExporting(value: boolean): void;
}

export type FlowStore = FlowState & FlowActions;

const HISTORY_CAP = 200;
const GLOW_MS = 2000;
let entrySeq = 0;

function pushCapped(list: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const next = [...list, entry];
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
}

function uniqueName(project: Project, name: string): string {
  const taken = new Set(project.boards.map((b) => b.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
}

function repaired(state: FlowState, project: Project): Partial<FlowState> {
  const boards = new Set(project.boards.map((b) => b.id));
  const activeBoardId = boards.has(state.activeBoardId) ? state.activeBoardId : project.boards[0].id;
  const splitBoardId = state.splitBoardId && boards.has(state.splitBoardId) && state.splitBoardId !== activeBoardId ? state.splitBoardId : null;
  const board = project.boards.find((b) => b.id === activeBoardId)!;
  const nodeIds = new Set(board.nodes.map((n) => n.id));
  const edgeIds = new Set(board.edges.map((e) => e.id));
  const selection = state.selection.filter((id) => nodeIds.has(id));
  const edgeSelection = state.edgeSelection.filter((id) => edgeIds.has(id));
  return {
    project,
    activeBoardId,
    splitBoardId,
    selection: selection.length === state.selection.length ? state.selection : selection,
    edgeSelection: edgeSelection.length === state.edgeSelection.length ? state.edgeSelection : edgeSelection,
  };
}

export function createFlowStore(initial: Project = createProject()): StoreApi<FlowStore> {
  return createStore<FlowStore>()((set, get) => ({
    project: initial,
    activeBoardId: initial.boards[0].id,
    splitBoardId: null,
    selection: [],
    edgeSelection: [],
    past: [],
    future: [],
    tx: null,
    criticalPath: false,
    glow: {},
    saveStatus: 'idle',
    clipboard: null,
    chatOpen: true,
    editingId: null,
    editSeed: null,
    exporting: false,

    loadProject(project) {
      set({
        project,
        activeBoardId: project.boards[0].id,
        splitBoardId: null,
        selection: [],
        edgeSelection: [],
        past: [],
        future: [],
        tx: null,
        glow: {},
        editingId: null,
        saveStatus: 'saved',
      });
    },

    change<R>(fn: (draft: Project) => R): R {
      const state = get();
      let result!: R;
      const next = produce(state.project, (draft) => {
        result = fn(draft as Project);
      });
      if (next !== state.project) {
        set({
          ...repaired(state, next),
          ...(state.tx ? {} : { past: pushCapped(state.past, { id: ++entrySeq, project: state.project }), future: [] }),
        });
      }
      return result;
    },

    changeBoard<R>(fn: (board: Board) => R, boardId?: string): R {
      const id = boardId ?? get().activeBoardId;
      return get().change((p) => {
        const board = p.boards.find((b) => b.id === id);
        if (!board) throw new OpError(`Unknown board "${id}".`);
        return fn(board);
      });
    },

    begin() {
      const { tx, project } = get();
      set({ tx: tx ? { ...tx, depth: tx.depth + 1 } : { base: project, depth: 1 } });
    },

    commit() {
      const { tx, project, past } = get();
      if (!tx) return null;
      if (tx.depth > 1) {
        set({ tx: { ...tx, depth: tx.depth - 1 } });
        return null;
      }
      if (project === tx.base) {
        set({ tx: null });
        return null;
      }
      const id = ++entrySeq;
      set({ tx: null, past: pushCapped(past, { id, project: tx.base }), future: [] });
      return id;
    },

    undo() {
      while (get().tx) get().commit();
      const state = get();
      const entry = state.past[state.past.length - 1];
      if (!entry) return;
      set({
        ...repaired(state, entry.project),
        past: state.past.slice(0, -1),
        future: [...state.future, { id: entry.id, project: state.project }],
        editingId: null,
      });
    },

    redo() {
      const state = get();
      const entry = state.future[state.future.length - 1];
      if (!entry) return;
      set({
        ...repaired(state, entry.project),
        future: state.future.slice(0, -1),
        past: pushCapped(state.past, { id: entry.id, project: state.project }),
        editingId: null,
      });
    },

    undoEntry(id) {
      const { past, tx } = get();
      if (tx || past[past.length - 1]?.id !== id) return false;
      get().undo();
      return true;
    },

    select(nodeIds, edgeIds = []) {
      set({ selection: nodeIds, edgeSelection: edgeIds });
    },

    setActiveBoard(id) {
      const state = get();
      if (!state.project.boards.some((b) => b.id === id)) return;
      set({ activeBoardId: id, selection: [], edgeSelection: [], editingId: null, splitBoardId: state.splitBoardId === id ? null : state.splitBoardId });
    },

    setSplitBoard(id) {
      set({ splitBoardId: id === get().activeBoardId ? null : id });
    },

    addBoard(name, activate = true) {
      const board = createBoard(uniqueName(get().project, name.trim() || 'Board'));
      get().change((p) => {
        p.boards.push(board);
      });
      if (activate) get().setActiveBoard(board.id);
      return board.id;
    },

    deleteBoard(id) {
      if (get().project.boards.length <= 1) throw new OpError('A project needs at least one board.');
      get().change((p) => {
        p.boards = p.boards.filter((b) => b.id !== id);
      });
    },

    toggleCriticalPath() {
      set({ criticalPath: !get().criticalPath });
    },

    markGlow(ids) {
      if (ids.length === 0) return;
      const stamp = Date.now();
      set({ glow: { ...get().glow, ...Object.fromEntries(ids.map((id) => [id, stamp])) } });
      setTimeout(() => {
        const glow = { ...get().glow };
        for (const id of ids) if (glow[id] === stamp) delete glow[id];
        set({ glow });
      }, GLOW_MS);
    },

    setSaveStatus(saveStatus) {
      set({ saveStatus });
    },
    setClipboard(clipboard) {
      set({ clipboard });
    },
    setChatOpen(chatOpen) {
      set({ chatOpen });
    },
    setEditing(editingId, seed) {
      set({ editingId, editSeed: seed ?? null });
    },
    setExporting(exporting) {
      set({ exporting });
    },
  }));
}

export const flowStore = createFlowStore();

export function useFlow<T>(selector: (s: FlowStore) => T): T {
  return useStore(flowStore, selector);
}

export function selectActiveBoard(s: FlowStore): Board {
  return s.project.boards.find((b) => b.id === s.activeBoardId) ?? s.project.boards[0];
}
```

- [ ] **Step 4: Run and watch the store tests pass**

Run: `npx vitest run src/store/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing autosave tests**

`src/store/autosave.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../model/factory';
import { addStep } from '../ops/steps';
import type { Project } from '../model/types';
import { startAutosave } from './autosave';
import { createFlowStore } from './store';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('startAutosave', () => {
  it('saves once, 500ms after the last of several quick changes', async () => {
    const store = createFlowStore();
    const save = vi.fn(async (_p: Project) => {});
    startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    expect(store.getState().saveStatus).toBe('saving');
    await vi.advanceTimersByTimeAsync(300);
    store.getState().changeBoard((b) => addStep(b, { title: 'B' }));
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].boards[0].nodes).toHaveLength(2);
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('reports errors and retries until the save succeeds', async () => {
    const store = createFlowStore();
    const save = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(undefined);
    startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getState().saveStatus).toBe('error');
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('does not save a project that was just loaded', async () => {
    const store = createFlowStore();
    const save = vi.fn(async () => {});
    startAutosave(store, save);
    store.getState().loadProject(createProject('Other'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });

  it('flushes pending changes immediately', async () => {
    const store = createFlowStore();
    const save = vi.fn(async (_p: Project) => {});
    const handle = startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    await handle.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('stops when disposed', async () => {
    const store = createFlowStore();
    const save = vi.fn(async () => {});
    const handle = startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    handle.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run and watch it fail**

Run: `npx vitest run src/store/autosave.test.ts`
Expected: FAIL, cannot resolve `./autosave`.

- [ ] **Step 7: Implement autosave and the tidy action**

`src/store/autosave.ts`:
```ts
import type { StoreApi } from 'zustand/vanilla';
import type { Project } from '../model/types';
import type { FlowStore } from './store';

export interface AutosaveHandle {
  stop(): void;
  flush(): Promise<void>;
}

export function startAutosave(store: StoreApi<FlowStore>, save: (p: Project) => Promise<unknown>, delayMs = 500, retryMs = 3000): AutosaveHandle {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving = false;
  let inflight: Promise<void> = Promise.resolve();
  let saved = store.getState().project;

  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  };

  async function run() {
    timer = undefined;
    const project = store.getState().project;
    if (project === saved) return;
    if (saving) return schedule(delayMs);
    saving = true;
    store.getState().setSaveStatus('saving');
    try {
      const pending = save(project);
      inflight = pending.then(
        () => undefined,
        () => undefined,
      );
      await pending;
      saved = project;
      store.getState().setSaveStatus(store.getState().project === saved ? 'saved' : 'saving');
    } catch {
      store.getState().setSaveStatus('error');
      schedule(retryMs);
      return;
    } finally {
      saving = false;
    }
    if (store.getState().project !== saved && !timer) schedule(delayMs);
  }

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.project === prev.project) return;
    if (state.project.id !== prev.project.id) {
      saved = state.project;
      clearTimeout(timer);
      return;
    }
    if (state.saveStatus !== 'error' && state.saveStatus !== 'saving') store.getState().setSaveStatus('saving');
    schedule(delayMs);
  });

  return {
    stop() {
      unsubscribe();
      clearTimeout(timer);
    },
    async flush() {
      clearTimeout(timer);
      timer = undefined;
      await inflight;
      await run();
      if (store.getState().saveStatus === 'error') throw new Error('Could not save the current project.');
    },
  };
}
```

`src/layout/tidyBoard.ts`:
```ts
import type { ELK } from 'elkjs/lib/elk-api';
import type { StoreApi } from 'zustand/vanilla';
import { applyTidy } from '../ops/board';
import type { FlowStore } from '../store/store';
import { getElk } from './elkClient';
import { computeTidy } from './tidy';

export async function tidyBoard(store: StoreApi<FlowStore>, boardId: string, elk: ELK = getElk()): Promise<void> {
  const board = store.getState().project.boards.find((b) => b.id === boardId);
  if (!board) return;
  const result = await computeTidy(elk, board);
  store.getState().changeBoard((b) => applyTidy(b, result), boardId);
}
```

- [ ] **Step 8: Run all unit tests**

Run: `npx vitest run`
Expected: PASS. `tidyBoard` is covered end to end in Task 13.

- [ ] **Step 9: Commit**

```bash
git add src/store src/layout/tidyBoard.ts
git commit -m "Add store with undo transactions, board management and autosave"
```

---

### Task 10: Project storage API and client

**Files:**
- Create: `server/storage.ts`, `src/api/projects.ts`
- Modify: `server/app.ts` (full replacement below), `server/main.ts` (full replacement below), `server/app.test.ts` (full replacement below), `src/model/types.ts` (append `ProjectMeta`)
- Test: `server/storage.test.ts`, `server/app.test.ts`

**Interfaces:**
- Consumes: `migrateProject`, `ProjectFormatError`, `createProject`.
- Produces:
  - `interface ProjectMeta { id: string; name: string; updatedAt: number }` in `src/model/types.ts`.
  - `class StorageError extends Error { status: 400 | 404 | 422 }`, `interface Storage { list(): Promise<ProjectMeta[]>; load(id): Promise<Project>; save(raw: unknown): Promise<void>; remove(id): Promise<void> }`, `createFileStorage(dir: string, fs?: { rename: (from: string, to: string) => Promise<void> }): Storage`.
  - `AppDeps = { storage: Storage }` (Task 16 adds `anthropic`).
  - HTTP: `GET /api/projects`, `GET/PUT/DELETE /api/projects/:id`.
  - Client: `listProjects(): Promise<ProjectMeta[]>`, `fetchProject(id): Promise<Project>`, `saveProject(p): Promise<void>`, `deleteProject(id): Promise<void>`.

- [ ] **Step 1: Append `ProjectMeta` to `src/model/types.ts`**

```ts
export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}
```

- [ ] **Step 2: Write the failing storage tests**

`server/storage.test.ts`:
```ts
import { mkdtemp, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/model/factory';
import { createFileStorage, StorageError } from './storage';

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'flowstate-'));
}

describe('file storage', () => {
  it('saves, lists newest first, loads and removes', async () => {
    const dir = await tempDir();
    const storage = createFileStorage(dir);
    const a = createProject('A');
    const b = createProject('B');
    await storage.save(a);
    await new Promise((r) => setTimeout(r, 20));
    await storage.save(b);
    expect((await storage.list()).map((m) => m.name)).toEqual(['B', 'A']);
    expect(await storage.load(a.id)).toEqual(a);
    await storage.remove(a.id);
    expect((await storage.list()).map((m) => m.id)).toEqual([b.id]);
    expect((await readdir(dir)).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('rejects bad ids, missing projects and invalid bodies', async () => {
    const storage = createFileStorage(await tempDir());
    await expect(storage.load('../etc/passwd')).rejects.toMatchObject({ status: 400 });
    await expect(storage.load('nope')).rejects.toMatchObject({ status: 404 });
    await expect(storage.save({ hello: 'world' })).rejects.toMatchObject({ status: 400 });
  });

  it('reports a corrupt file without touching it and still lists it', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'broken.json'), '{ not json', 'utf8');
    const storage = createFileStorage(dir);
    await expect(storage.load('broken')).rejects.toMatchObject({ status: 422 });
    expect((await storage.list()).map((m) => m.name)).toEqual(['broken (unreadable)']);
    expect(await readFile(join(dir, 'broken.json'), 'utf8')).toBe('{ not json');
  });

  it('retries a locked rename on Windows-style EPERM', async () => {
    const dir = await tempDir();
    let failures = 2;
    const flaky = vi.fn(async (from: string, to: string) => {
      if (failures-- > 0) throw Object.assign(new Error('locked'), { code: 'EPERM' });
      return rename(from, to);
    });
    const storage = createFileStorage(dir, { rename: flaky });
    const p = createProject('Locked');
    await storage.save(p);
    expect(flaky).toHaveBeenCalledTimes(3);
    expect(await storage.load(p.id)).toEqual(p);
  });

  it('gives up after repeated lock failures and cleans the temp file', async () => {
    const dir = await tempDir();
    const locked = vi.fn(async () => {
      throw Object.assign(new Error('locked'), { code: 'EBUSY' });
    });
    const storage = createFileStorage(dir, { rename: locked });
    await expect(storage.save(createProject())).rejects.toThrow('locked');
    expect(await readdir(dir)).toEqual([]);
  });

  it('exposes StorageError', () => {
    expect(new StorageError('x', 404).status).toBe(404);
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `npx vitest run server/storage.test.ts`
Expected: FAIL, cannot resolve `./storage`.

- [ ] **Step 4: Implement storage**

`server/storage.ts`:
```ts
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { migrateProject, ProjectFormatError } from '../src/model/migrate';
import type { Project, ProjectMeta } from '../src/model/types';

export class StorageError extends Error {
  status: 400 | 404 | 422;
  constructor(message: string, status: 400 | 404 | 422) {
    super(message);
    this.status = status;
  }
}

export interface Storage {
  list(): Promise<ProjectMeta[]>;
  load(id: string): Promise<Project>;
  save(raw: unknown): Promise<void>;
  remove(id: string): Promise<void>;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

type RenameFn = (from: string, to: string) => Promise<void>;

export function createFileStorage(dir: string, fs: { rename: RenameFn } = { rename }): Storage {
  const pathFor = (id: string) => {
    if (!ID.test(id)) throw new StorageError('Invalid project id.', 400);
    return join(dir, `${id}.json`);
  };

  async function replace(from: string, to: string, attempts = 6): Promise<void> {
    for (let i = 0; ; i++) {
      try {
        await fs.rename(from, to);
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? '';
        if (i >= attempts - 1 || !LOCK_CODES.has(code)) {
          await rm(from, { force: true });
          throw err;
        }
        await new Promise((r) => setTimeout(r, 50 * (i + 1)));
      }
    }
  }

  return {
    async list() {
      await mkdir(dir, { recursive: true });
      const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
      const metas = await Promise.all(
        files.map(async (file): Promise<ProjectMeta> => {
          const id = file.slice(0, -'.json'.length);
          const path = join(dir, file);
          const info = await stat(path);
          try {
            const data = JSON.parse(await readFile(path, 'utf8')) as { name?: unknown };
            return { id, name: typeof data.name === 'string' ? data.name : 'Untitled', updatedAt: info.mtimeMs };
          } catch {
            return { id, name: `${id} (unreadable)`, updatedAt: info.mtimeMs };
          }
        }),
      );
      return metas.sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async load(id) {
      let text: string;
      try {
        text = await readFile(pathFor(id), 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new StorageError('Project not found.', 404);
        throw err;
      }
      try {
        return migrateProject(JSON.parse(text));
      } catch (err) {
        if (err instanceof SyntaxError || err instanceof ProjectFormatError) {
          throw new StorageError(`Project file is unreadable: ${err.message}`, 422);
        }
        throw err;
      }
    },

    async save(raw) {
      let project: Project;
      try {
        project = migrateProject(raw);
      } catch (err) {
        if (err instanceof ProjectFormatError) throw new StorageError(err.message, 400);
        throw err;
      }
      const target = pathFor(project.id);
      await mkdir(dir, { recursive: true });
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(project), 'utf8');
      await replace(tmp, target);
    },

    async remove(id) {
      await rm(pathFor(id), { force: true });
    },
  };
}
```

- [ ] **Step 5: Run and watch it pass**

Run: `npx vitest run server/storage.test.ts`
Expected: PASS.

- [ ] **Step 6: Replace the app and its test with the storage-backed version**

`server/app.test.ts`:
```ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject } from '../src/model/factory';
import { createApp } from './app';
import { createFileStorage } from './storage';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'flowstate-app-'));
  return { dir, app: createApp({ storage: createFileStorage(dir) }) };
}

const put = (body: unknown) => ({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('projects API', () => {
  it('answers the health check', async () => {
    const { app } = await setup();
    expect(await (await app.request('/api/health')).json()).toEqual({ ok: true });
  });

  it('round-trips a project', async () => {
    const { app } = await setup();
    const p = createProject('Claims');
    expect((await app.request(`/api/projects/${p.id}`, put(p))).status).toBe(200);
    expect(await (await app.request(`/api/projects/${p.id}`)).json()).toEqual(p);
    const list = await (await app.request('/api/projects')).json();
    expect(list).toMatchObject([{ id: p.id, name: 'Claims' }]);
    expect((await app.request(`/api/projects/${p.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await app.request(`/api/projects/${p.id}`)).status).toBe(404);
  });

  it('rejects mismatched ids, bad JSON and bad ids', async () => {
    const { app } = await setup();
    const p = createProject();
    const mismatch = await app.request('/api/projects/other', put(p));
    expect(mismatch.status).toBe(400);
    expect(await mismatch.json()).toEqual({ error: 'Project id does not match the URL.' });
    const bad = await app.request(`/api/projects/${p.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{' });
    expect(bad.status).toBe(400);
    expect((await app.request('/api/projects/a.b')).status).toBe(400);
  });

  it('returns 422 for a corrupt file', async () => {
    const { app, dir } = await setup();
    await writeFile(join(dir, 'bad.json'), 'nope', 'utf8');
    const res = await app.request('/api/projects/bad');
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/unreadable/);
  });
});
```

`server/app.ts`:
```ts
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { StorageError, type Storage } from './storage';

export interface AppDeps {
  storage: Storage;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof StorageError) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'Internal server error.' }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.get('/api/projects', async (c) => c.json(await deps.storage.list()));
  app.get('/api/projects/:id', async (c) => c.json(await deps.storage.load(c.req.param('id'))));

  app.put('/api/projects/:id', bodyLimit({ maxSize: 50 * 1024 * 1024 }), async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new StorageError('Body is not valid JSON.', 400);
    }
    if (!body || typeof body !== 'object' || (body as { id?: unknown }).id !== c.req.param('id')) {
      throw new StorageError('Project id does not match the URL.', 400);
    }
    await deps.storage.save(body);
    return c.json({ ok: true });
  });

  app.delete('/api/projects/:id', async (c) => {
    await deps.storage.remove(c.req.param('id'));
    return c.json({ ok: true });
  });

  return app;
}
```

`server/main.ts`:
```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createFileStorage } from './storage';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.FLOWSTATE_API_PORT ?? 8787);
const workspace = resolve(process.env.FLOWSTATE_WORKSPACE ?? 'workspace');
const app = createApp({ storage: createFileStorage(workspace) });

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`Flowstate API on http://127.0.0.1:${port}, projects in ${workspace}`);
});
```

- [ ] **Step 7: Write the client**

`src/api/projects.ts`:
```ts
import { migrateProject } from '../model/migrate';
import type { Project, ProjectMeta } from '../model/types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status}).`);
  return body as T;
}

export function listProjects(): Promise<ProjectMeta[]> {
  return request<ProjectMeta[]>('/api/projects');
}

export async function fetchProject(id: string): Promise<Project> {
  return migrateProject(await request<unknown>(`/api/projects/${encodeURIComponent(id)}`));
}

export async function saveProject(project: Project): Promise<void> {
  await request(`/api/projects/${encodeURIComponent(project.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(project),
  });
}

export async function deleteProject(id: string): Promise<void> {
  await request(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
```

- [ ] **Step 8: Run all unit tests and typecheck**

Run: `npx vitest run` then `npm run typecheck`
Expected: PASS and exit 0.

- [ ] **Step 9: Commit**

```bash
git add server src/api src/model/types.ts
git commit -m "Add file-backed project storage API with atomic writes"
```

---

### Task 11: App shell, theme, and canvas rendering

Renders a board read-and-drag: every shape, arrow style, lane, group, text and flag badge, in light and dark themes. Editing affordances come in Task 12.

**Files:**
- Create: `src/boot.ts`, `src/ui/theme.ts`, `src/ui/theme.css`, `src/ui/ui.css`, `src/ui/toast.ts`, `src/ui/Toasts.tsx`, `src/ui/CanvasArea.tsx`
- Create: `src/canvas/labels.tsx`, `src/canvas/safe.ts`, `src/canvas/reveal.ts`, `src/canvas/cursor.ts`, `src/canvas/useThemeColors.ts`, `src/canvas/toFlow.ts`, `src/canvas/ShapeSvg.tsx`, `src/canvas/FlagBadges.tsx`, `src/canvas/StepTitle.tsx`, `src/canvas/StepNode.tsx`, `src/canvas/TextNode.tsx`, `src/canvas/GroupNode.tsx`, `src/canvas/LaneNode.tsx`, `src/canvas/FlowEdge.tsx`, `src/canvas/Canvas.tsx`, `src/canvas/canvas.css`
- Modify: `src/main.tsx`, `src/App.tsx` (full replacements below)
- Create: `tests/e2e/fixtures.ts`
- Test: `src/canvas/toFlow.test.ts`, `tests/e2e/canvas.spec.ts`

**Interfaces:**
- Consumes: store (Task 9), ops (Tasks 4 to 6), `criticalPath` (Task 7), `fetchProject`, `listProjects`, `saveProject` (Task 10).
- Produces:
  - `boot(): Promise<void>`, `openProject(project: Project | string): Promise<void>` in `src/boot.ts`; `window.__flowstate` in dev.
  - `notify(message: string)` and `useToast` in `src/ui/toast.ts`; `runSafely<R>(fn: () => R): R | undefined` in `src/canvas/safe.ts` (turns `OpError` into a toast).
  - `reveal(ids: string[])`, `setRevealer(fn): () => void` in `src/canvas/reveal.ts`; `cursor.flow` in `src/canvas/cursor.ts`.
  - `useThemeColors(): ThemeColors` with `{ edge, critical, accent, dot, mask, person, system, agent, stepStroke }`.
  - `toFlowNodes(board, view, cache)`, `toFlowEdges(board, view, cache)`, `laneNodes(board, editable)`, `autoSides(direction)`, types `FlowView`, `FlowNode`, `StepFlowNode`, `TextFlowNode`, `GroupFlowNode`, `LaneFlowNode`, `FlowEdgeType`, `RenderCache<T>`.
  - `ShapeSvg`, `ShapeIcon`, `shapePath(shape, w, h)`; labels `ACTOR_LABEL`, `ActorIcon`, `FLAG_LABEL`, `FlagIcon`, `SHAPE_LABEL`, `EDGE_LABEL`, `TINTS`.
  - `Canvas({ boardId, editable })` component; `CanvasArea` component; theme helpers `applyStoredTheme()`, `storedTheme()`, `applyTheme(choice)`.

- [ ] **Step 1: Write the failing unit test for the flow mapping**

`src/canvas/toFlow.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { setLanes } from '../ops/lanes';
import { chain } from '../ops/testkit';
import { updateSteps } from '../ops/steps';
import { runOp } from '../ops/run';
import { toFlowEdges, toFlowNodes, type FlowEdgeType, type FlowNode, type FlowView, type RenderCache } from './toFlow';

const view = (over: Partial<FlowView> = {}): FlowView => ({
  selection: new Set(),
  edgeSelection: new Set(),
  criticalNodes: null,
  criticalEdges: null,
  glow: {},
  editable: true,
  edgeColor: '#888',
  criticalColor: '#f60',
  accentColor: '#46f',
  ...over,
});

describe('toFlowNodes', () => {
  it('maps nodes with size, type and selection', () => {
    const { b, ids } = chain(['A', 'B']);
    const nodes = toFlowNodes(b, view({ selection: new Set([ids[1]]) }), new Map());
    expect(nodes.map((n) => [n.id, n.type, n.selected, n.width, n.height])).toEqual([
      [ids[0], 'step', false, 180, 72],
      [ids[1], 'step', true, 180, 72],
    ]);
  });

  it('reuses unchanged node objects between renders', () => {
    const { b, ids } = chain(['A', 'B']);
    const cache: RenderCache<FlowNode> = new Map();
    const first = toFlowNodes(b, view(), cache);
    const next = runOp(b, (d) => updateSteps(d, [{ id: ids[1], title: 'B2' }])).board;
    const second = toFlowNodes(next, view(), cache);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
  });

  it('adds lane bands behind everything and dims off-path steps', () => {
    const { b, ids } = chain(['A', 'B']);
    setLanes(b, ['Ops', 'Legal']);
    const nodes = toFlowNodes(b, view({ criticalNodes: new Set([ids[0]]) }), new Map());
    const lanes = nodes.filter((n) => n.type === 'lane');
    expect(lanes).toHaveLength(2);
    expect(lanes.every((n) => n.zIndex === -2 && n.selectable === false)).toBe(true);
    const steps = nodes.filter((n) => n.type === 'step');
    expect(steps.map((n) => [n.data.critical, n.data.dimmed])).toEqual([
      [true, false],
      [false, true],
    ]);
  });
});

describe('toFlowEdges', () => {
  it('uses automatic sides by direction and explicit sides when set', () => {
    const { b } = chain(['A', 'B']);
    const cache: RenderCache<FlowEdgeType> = new Map();
    expect(toFlowEdges(b, view(), cache)[0]).toMatchObject({ sourceHandle: 'right', targetHandle: 'left', type: 'flow' });
    b.direction = 'TB';
    b.edges[0] = { ...b.edges[0] };
    expect(toFlowEdges(b, view(), cache)[0]).toMatchObject({ sourceHandle: 'bottom', targetHandle: 'top' });
    b.edges[0] = { ...b.edges[0], sourceSide: 'left' };
    expect(toFlowEdges(b, view(), cache)[0].sourceHandle).toBe('left');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/canvas/toFlow.test.ts`
Expected: FAIL, cannot resolve `./toFlow`.

- [ ] **Step 3: Implement the flow mapping**

`src/canvas/toFlow.ts`:
```ts
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { axes, boundsOf, laneBands } from '../layout/place';
import type { Board, BoardEdge, BoardNode, Direction, Lane, Side } from '../model/types';

export type NodeViewData = { node: BoardNode; critical: boolean; dimmed: boolean; glowing: boolean; editable: boolean };
export type LaneViewData = { lane: Lane; alt: boolean; direction: Direction; editable: boolean };
export type EdgeViewData = { edge: BoardEdge; critical: boolean; dimmed: boolean; editable: boolean };

export type StepFlowNode = Node<NodeViewData, 'step'>;
export type TextFlowNode = Node<NodeViewData, 'text'>;
export type GroupFlowNode = Node<NodeViewData, 'group'>;
export type LaneFlowNode = Node<LaneViewData, 'lane'>;
export type FlowNode = StepFlowNode | TextFlowNode | GroupFlowNode | LaneFlowNode;
export type FlowEdgeType = Edge<EdgeViewData, 'flow'>;

export interface FlowView {
  selection: ReadonlySet<string>;
  edgeSelection: ReadonlySet<string>;
  criticalNodes: ReadonlySet<string> | null;
  criticalEdges: ReadonlySet<string> | null;
  glow: Record<string, number>;
  editable: boolean;
  edgeColor: string;
  criticalColor: string;
  accentColor: string;
}

export type RenderCache<T> = Map<string, { deps: unknown[]; value: T }>;

const LANE_MARGIN = 320;

function cached<T>(cache: RenderCache<T>, id: string, deps: unknown[], make: () => T): T {
  const hit = cache.get(id);
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit.value;
  const value = make();
  cache.set(id, { deps, value });
  return value;
}

export function autoSides(direction: Direction): { source: Side; target: Side } {
  return direction === 'LR' ? { source: 'right', target: 'left' } : { source: 'bottom', target: 'top' };
}

export function laneNodes(board: Board, editable: boolean): LaneFlowNode[] {
  if (board.lanes.length === 0) return [];
  const ax = axes(board);
  const box = boundsOf(board.nodes.filter((n) => n.kind !== 'text'));
  const start = (box ? box[ax.main] : 0) - LANE_MARGIN;
  const length = (box ? box[ax.mainSize] : 1200) + LANE_MARGIN * 2;
  const byId = new Map(board.lanes.map((l) => [l.id, l]));
  return laneBands(board).map((band, i) => {
    const horizontal = ax.main === 'x';
    return {
      id: `lane:${band.id}`,
      type: 'lane',
      position: horizontal ? { x: start, y: band.start } : { x: band.start, y: start },
      width: horizontal ? length : band.size,
      height: horizontal ? band.size : length,
      data: { lane: byId.get(band.id)!, alt: i % 2 === 1, direction: board.direction, editable },
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      zIndex: -2,
    };
  });
}

export type Measured = ReadonlyMap<string, { width: number; height: number }>;

export function toFlowNodes(board: Board, view: FlowView, cache: RenderCache<FlowNode>, measured?: Measured): FlowNode[] {
  const out: FlowNode[] = laneNodes(board, view.editable);
  for (const n of board.nodes) {
    const selected = view.selection.has(n.id);
    const critical = !!view.criticalNodes?.has(n.id);
    const dimmed = !!view.criticalNodes && !critical && n.kind === 'step';
    const glowing = n.id in view.glow;
    out.push(
      cached(cache, n.id, [n, selected, critical, dimmed, glowing, view.editable, measured?.get(n.id)], () => ({
        id: n.id,
        type: n.kind,
        position: { x: n.x, y: n.y },
        width: n.w,
        height: n.h,
        ...(measured?.get(n.id) ? { measured: measured.get(n.id) } : {}),
        data: { node: n, critical, dimmed, glowing, editable: view.editable },
        selected,
        draggable: view.editable,
        connectable: view.editable && n.kind !== 'group',
        zIndex: n.kind === 'group' ? -1 : 0,
      }) as FlowNode),
    );
  }
  return out;
}

export function toFlowEdges(board: Board, view: FlowView, cache: RenderCache<FlowEdgeType>): FlowEdgeType[] {
  const sides = autoSides(board.direction);
  return board.edges.map((e) => {
    const selected = view.edgeSelection.has(e.id);
    const critical = !!view.criticalEdges?.has(e.id);
    const dimmed = !!view.criticalEdges && !critical;
    const color = critical ? view.criticalColor : selected ? view.accentColor : view.edgeColor;
    return cached(cache, e.id, [e, selected, critical, dimmed, view.editable, color, board.direction], () => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceSide ?? sides.source,
      targetHandle: e.targetSide ?? sides.target,
      type: 'flow' as const,
      selected,
      data: { edge: e, critical, dimmed, editable: view.editable },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color },
      zIndex: critical ? 1 : 0,
    }));
  });
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run src/canvas/toFlow.test.ts`
Expected: PASS.

- [ ] **Step 5: Write theme, toast, boot and shell files**

`src/ui/theme.css`:
```css
:root {
  color-scheme: light;
  --bg: #f4f5f8;
  --canvas: #f8f9fb;
  --dot: #d3d8df;
  --surface: #ffffff;
  --surface-2: #f2f4f7;
  --surface-3: #e8ebf0;
  --border: #e2e5ea;
  --border-strong: #c7cdd6;
  --text: #1b2130;
  --text-2: #586173;
  --text-3: #8b93a3;
  --accent: #4c6ef5;
  --accent-soft: #e7ecff;
  --accent-text: #ffffff;
  --edge: #8a93a3;
  --critical: #f76707;
  --critical-soft: rgba(247, 103, 7, 0.28);
  --person: #3b7be0;
  --system: #64748b;
  --agent: #8b5cf6;
  --blocker: #e5484d;
  --warning: #f5a524;
  --question: #12a3c4;
  --done: #2fb36d;
  --on-color: #ffffff;
  --on-warning: #3a2600;
  --shape-shadow: rgba(16, 24, 40, 0.08);
  --step-fill: #ffffff;
  --step-stroke: #cdd3dc;
  --sticky-fill: #fff3b0;
  --sticky-stroke: #e6d067;
  --group-fill: rgba(76, 110, 245, 0.04);
  --group-stroke: rgba(76, 110, 245, 0.3);
  --lane-a: rgba(27, 33, 48, 0.02);
  --lane-b: rgba(27, 33, 48, 0.05);
  --lane-line: rgba(27, 33, 48, 0.08);
  --minimap-mask: rgba(244, 245, 248, 0.72);
  --tint-blue: #e3edff;
  --tint-green: #dcf5e7;
  --tint-amber: #fff0d4;
  --tint-rose: #ffe2e6;
  --tint-violet: #eee6ff;
  --tint-slate: #e7eaef;
  --shadow-sm: 0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.08);
  --shadow-md: 0 6px 16px rgba(16, 24, 40, 0.1), 0 2px 4px rgba(16, 24, 40, 0.06);
  --font: 'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
    --bg: #111318;
    --canvas: #15181e;
    --dot: #2c313a;
    --surface: #1c2027;
    --surface-2: #232830;
    --surface-3: #2b313b;
    --border: #2e343e;
    --border-strong: #434b57;
    --text: #e6e9ef;
    --text-2: #a4acba;
    --text-3: #737c8c;
    --accent: #6d8bff;
    --accent-soft: rgba(109, 139, 255, 0.16);
    --accent-text: #0d1020;
    --edge: #7a8394;
    --critical: #ff8a3d;
    --critical-soft: rgba(255, 138, 61, 0.3);
    --person: #5b95f0;
    --system: #8a97aa;
    --agent: #a78bfa;
    --blocker: #ff6369;
    --warning: #ffb224;
    --question: #3bc0e0;
    --done: #3dd68c;
    --on-color: #ffffff;
    --on-warning: #1f1400;
    --shape-shadow: rgba(0, 0, 0, 0.35);
    --step-fill: #1f242c;
    --step-stroke: #3a414c;
    --sticky-fill: #4a4220;
    --sticky-stroke: #6d6130;
    --group-fill: rgba(109, 139, 255, 0.05);
    --group-stroke: rgba(109, 139, 255, 0.32);
    --lane-a: rgba(255, 255, 255, 0.015);
    --lane-b: rgba(255, 255, 255, 0.04);
    --lane-line: rgba(255, 255, 255, 0.07);
    --minimap-mask: rgba(17, 19, 24, 0.72);
    --tint-blue: #1e2b45;
    --tint-green: #1a3326;
    --tint-amber: #3a2e17;
    --tint-rose: #3d1e24;
    --tint-violet: #2c2345;
    --tint-slate: #262c35;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
    --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.45);
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;
  --bg: #111318;
  --canvas: #15181e;
  --dot: #2c313a;
  --surface: #1c2027;
  --surface-2: #232830;
  --surface-3: #2b313b;
  --border: #2e343e;
  --border-strong: #434b57;
  --text: #e6e9ef;
  --text-2: #a4acba;
  --text-3: #737c8c;
  --accent: #6d8bff;
  --accent-soft: rgba(109, 139, 255, 0.16);
  --accent-text: #0d1020;
  --edge: #7a8394;
  --critical: #ff8a3d;
  --critical-soft: rgba(255, 138, 61, 0.3);
  --person: #5b95f0;
  --system: #8a97aa;
  --agent: #a78bfa;
  --blocker: #ff6369;
  --warning: #ffb224;
  --question: #3bc0e0;
  --done: #3dd68c;
  --on-color: #ffffff;
  --on-warning: #1f1400;
  --shape-shadow: rgba(0, 0, 0, 0.35);
  --step-fill: #1f242c;
  --step-stroke: #3a414c;
  --sticky-fill: #4a4220;
  --sticky-stroke: #6d6130;
  --group-fill: rgba(109, 139, 255, 0.05);
  --group-stroke: rgba(109, 139, 255, 0.32);
  --lane-a: rgba(255, 255, 255, 0.015);
  --lane-b: rgba(255, 255, 255, 0.04);
  --lane-line: rgba(255, 255, 255, 0.07);
  --minimap-mask: rgba(17, 19, 24, 0.72);
  --tint-blue: #1e2b45;
  --tint-green: #1a3326;
  --tint-amber: #3a2e17;
  --tint-rose: #3d1e24;
  --tint-violet: #2c2345;
  --tint-slate: #262c35;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.45);
}

html,
body,
#root {
  height: 100%;
  margin: 0;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}

button,
input,
select,
textarea {
  font: inherit;
  color: inherit;
}
```

`src/ui/ui.css`:
```css
.boot {
  display: grid;
  place-items: center;
  height: 100vh;
  color: var(--text-2);
}
.boot-error {
  color: var(--blocker);
  padding: 24px;
  text-align: center;
}
.app {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  height: 100vh;
  overflow: hidden;
}
.workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.canvas-area {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 0;
}
.canvas-pane {
  position: relative;
  flex: 1;
  min-width: 0;
  background: var(--canvas);
}
.canvas-pane.is-reference {
  border-left: 1px solid var(--border);
}
.toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--text);
  color: var(--surface);
  padding: 8px 14px;
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  font-size: 12.5px;
  z-index: 50;
}
```

`src/ui/theme.ts`:
```ts
export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'flowstate-theme';

export function storedTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice): void {
  if (choice === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Storage can be unavailable in private windows; the theme still applies for this session.
  }
}

export function applyStoredTheme(): void {
  applyTheme(storedTheme());
}
```

`src/ui/toast.ts`:
```ts
import { create } from 'zustand';

interface ToastState {
  message: string | null;
  seq: number;
  show(message: string): void;
}

export const useToast = create<ToastState>()((set, get) => ({
  message: null,
  seq: 0,
  show(message) {
    const seq = get().seq + 1;
    set({ message, seq });
    setTimeout(() => {
      if (get().seq === seq) set({ message: null });
    }, 3500);
  },
}));

export function notify(message: string): void {
  useToast.getState().show(message);
}
```

`src/ui/Toasts.tsx`:
```tsx
import { useToast } from './toast';

export function Toasts() {
  const message = useToast((s) => s.message);
  return message ? (
    <div className="toast" role="status">
      {message}
    </div>
  ) : null;
}
```

`src/canvas/safe.ts`:
```ts
import { OpError } from '../ops/errors';
import { notify } from '../ui/toast';

export function runSafely<R>(fn: () => R): R | undefined {
  try {
    return fn();
  } catch (err) {
    if (err instanceof OpError) {
      notify(err.message);
      return undefined;
    }
    throw err;
  }
}
```

`src/canvas/reveal.ts`:
```ts
type Revealer = (ids: string[]) => void;

let current: Revealer | null = null;

export function setRevealer(fn: Revealer): () => void {
  current = fn;
  return () => {
    if (current === fn) current = null;
  };
}

export function reveal(ids: string[]): void {
  current?.(ids);
}
```

`src/canvas/cursor.ts`:
```ts
export const cursor: { flow: { x: number; y: number } | null } = { flow: null };
```

`src/boot.ts`:
```ts
import type { StoreApi } from 'zustand/vanilla';
import { fetchProject, listProjects, saveProject } from './api/projects';
import { createProject } from './model/factory';
import type { Project } from './model/types';
import { startAutosave, type AutosaveHandle } from './store/autosave';
import { flowStore, type FlowStore } from './store/store';

declare global {
  interface Window {
    __flowstate?: StoreApi<FlowStore>;
  }
}

let autosave: AutosaveHandle | null = null;

async function newestOrNew(): Promise<Project> {
  const readable = (await listProjects()).find((m) => !m.name.endsWith('(unreadable)'));
  if (readable) return fetchProject(readable.id);
  const fresh = createProject();
  await saveProject(fresh);
  return fresh;
}

function remember(project: Project): void {
  history.replaceState(null, '', `?project=${encodeURIComponent(project.id)}`);
}

export async function boot(): Promise<void> {
  const wanted = new URLSearchParams(location.search).get('project');
  const project = wanted ? await fetchProject(wanted) : await newestOrNew();
  flowStore.getState().loadProject(project);
  remember(project);
  autosave = startAutosave(flowStore, saveProject);
  window.addEventListener('beforeunload', (e) => {
    if (flowStore.getState().saveStatus !== 'saving') return;
    void autosave?.flush();
    e.preventDefault();
  });
  if (import.meta.env.DEV) window.__flowstate = flowStore;
}

export async function openProject(project: Project | string): Promise<void> {
  await autosave?.flush();
  const next = typeof project === 'string' ? await fetchProject(project) : project;
  flowStore.getState().loadProject(next);
  remember(next);
}
```

`src/main.tsx`:
```tsx
import '@fontsource-variable/inter';
import '@xyflow/react/dist/style.css';
import './ui/theme.css';
import './ui/ui.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { boot } from './boot';
import { applyStoredTheme } from './ui/theme';

applyStoredTheme();
const root = createRoot(document.getElementById('root')!);
root.render(<div className="boot">Loading Flowstate</div>);
boot().then(
  () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  (err: unknown) =>
    root.render(<div className="boot boot-error">Could not open the project: {err instanceof Error ? err.message : String(err)}</div>),
);
```

`src/App.tsx`:
```tsx
import { CanvasArea } from './ui/CanvasArea';
import { Toasts } from './ui/Toasts';

export function App() {
  return (
    <div className="app">
      <main className="workspace">
        <CanvasArea />
      </main>
      <Toasts />
    </div>
  );
}
```

`src/ui/CanvasArea.tsx` (Task 14 replaces this with the split-view version):
```tsx
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from '../canvas/Canvas';
import { useFlow } from '../store/store';

export function CanvasArea() {
  const active = useFlow((s) => s.activeBoardId);
  return (
    <div className="canvas-area">
      <div className="canvas-pane fs-canvas-main">
        <ReactFlowProvider key={active}>
          <Canvas boardId={active} editable />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write labels, colours and shapes**

`src/canvas/labels.tsx`:
```tsx
import { Bot, CircleQuestionMark, OctagonX, Server, TriangleAlert, User } from 'lucide-react';
import type { Actor, EdgeType, FlagKind, Shape } from '../model/types';

export const TINTS = ['blue', 'green', 'amber', 'rose', 'violet', 'slate'] as const;

export const ACTOR_LABEL: Record<Actor, string> = { person: 'Person', system: 'System', agent: 'AI agent' };
export const FLAG_LABEL: Record<FlagKind, string> = { blocker: 'Blocker', warning: 'Warning', question: 'Question' };
export const FLAG_KEY: Record<FlagKind, string> = { blocker: 'B', warning: 'W', question: 'Q' };
export const EDGE_LABEL: Record<EdgeType, string> = { flow: 'Flow', dependency: 'Dependency', handoff: 'Handoff' };
export const SHAPE_LABEL: Record<Shape, string> = {
  process: 'Process',
  decision: 'Decision',
  terminal: 'Start / End',
  data: 'Data',
  document: 'Document',
  database: 'Database',
  preparation: 'Preparation',
  connector: 'Connector',
  sticky: 'Sticky note',
};

export function ActorIcon({ actor, size = 12 }: { actor: Actor; size?: number }) {
  const Icon = actor === 'person' ? User : actor === 'system' ? Server : Bot;
  return <Icon size={size} strokeWidth={2.2} />;
}

export function FlagIcon({ kind, size = 11 }: { kind: FlagKind; size?: number }) {
  const Icon = kind === 'blocker' ? OctagonX : kind === 'warning' ? TriangleAlert : CircleQuestionMark;
  return <Icon size={size} strokeWidth={2.4} />;
}
```

`src/canvas/ShapeSvg.tsx`:
```tsx
import type { Shape } from '../model/types';

const INSET = 1;

function roundedRect(x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.min(radius, w / 2, h / 2);
  return `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
}

export function shapePath(shape: Shape, w: number, h: number): string {
  const i = INSET;
  const W = w - i;
  const H = h - i;
  switch (shape) {
    case 'decision':
      return `M${w / 2},${i} L${W},${h / 2} L${w / 2},${H} L${i},${h / 2} Z`;
    case 'terminal':
      return roundedRect(i, i, w - 2 * i, h - 2 * i, h / 2);
    case 'data': {
      const s = Math.min(18, w * 0.12);
      return `M${i + s},${i} L${W},${i} L${W - s},${H} L${i},${H} Z`;
    }
    case 'document': {
      const wave = Math.min(10, h * 0.14);
      return `M${i},${i} H${W} V${H - wave} Q${w * 0.75},${H - 2 * wave} ${w / 2},${H - wave} T${i},${H - wave} Z`;
    }
    case 'database': {
      const ry = Math.min(10, h * 0.12);
      const rx = (w - 2 * i) / 2;
      return `M${i},${i + ry} A${rx},${ry} 0 0 1 ${W},${i + ry} V${H - ry} A${rx},${ry} 0 0 1 ${i},${H - ry} Z`;
    }
    case 'preparation': {
      const s = Math.min(20, w * 0.14);
      return `M${i + s},${i} H${W - s} L${W},${h / 2} L${W - s},${H} H${i + s} L${i},${h / 2} Z`;
    }
    case 'connector': {
      const r = Math.min(w, h) / 2 - i;
      return `M${w / 2 - r},${h / 2} A${r},${r} 0 1 0 ${w / 2 + r},${h / 2} A${r},${r} 0 1 0 ${w / 2 - r},${h / 2} Z`;
    }
    case 'sticky': {
      const f = Math.min(16, w * 0.12);
      return `M${i},${i} H${W} V${H - f} L${W - f},${H} H${i} Z`;
    }
    default:
      return roundedRect(i, i, w - 2 * i, h - 2 * i, 12);
  }
}

function databaseLip(w: number, h: number): string {
  const ry = Math.min(10, h * 0.12);
  return `M${INSET},${INSET + ry} A${(w - 2 * INSET) / 2},${ry} 0 0 0 ${w - INSET},${INSET + ry}`;
}

export function ShapeSvg({ shape, w, h }: { shape: Shape; w: number; h: number }) {
  return (
    <svg className="fs-shape" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path className="fs-shape-body" d={shapePath(shape, w, h)} />
      {shape === 'database' && <path className="fs-shape-lip" d={databaseLip(w, h)} />}
    </svg>
  );
}

export function ShapeIcon({ shape }: { shape: Shape }) {
  const w = 22;
  const h = shape === 'decision' || shape === 'connector' || shape === 'database' ? 18 : 15;
  return (
    <svg className="fs-shape-icon" width={w} height={18} viewBox={`0 ${(h - 18) / 2} ${w} 18`} aria-hidden>
      <path d={shapePath(shape, w, h)} />
      {shape === 'database' && <path d={databaseLip(w, h)} fill="none" />}
    </svg>
  );
}
```

- [ ] **Step 7: Write the node and edge components**

`src/canvas/useThemeColors.ts`:
```ts
import { useEffect, useState } from 'react';

function read() {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    edge: v('--edge'),
    critical: v('--critical'),
    accent: v('--accent'),
    dot: v('--dot'),
    mask: v('--minimap-mask'),
    person: v('--person'),
    system: v('--system'),
    agent: v('--agent'),
    stepStroke: v('--step-stroke'),
  };
}

export type ThemeColors = ReturnType<typeof read>;

export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const update = () => setColors(read());
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      media.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);
  return colors;
}
```

`src/canvas/FlagBadges.tsx`:
```tsx
import { FLAG_KINDS, type Flag } from '../model/types';
import { FLAG_LABEL, FlagIcon } from './labels';

export function FlagBadges({ flags, onClick }: { flags: Flag[]; onClick?: () => void }) {
  const groups = FLAG_KINDS.map((kind) => ({ kind, items: flags.filter((f) => f.kind === kind && !f.resolved) })).filter((g) => g.items.length);
  if (groups.length === 0) return null;
  return (
    <div className="fs-flags">
      {groups.map(({ kind, items }) => (
        <button
          key={kind}
          type="button"
          className={`fs-flag flag-${kind} nodrag`}
          title={items.map((f) => f.text || FLAG_LABEL[kind]).join('\n')}
          aria-label={`${items.length} ${FLAG_LABEL[kind].toLowerCase()}`}
          onClick={onClick}
        >
          <FlagIcon kind={kind} />
          {items.length > 1 && <span>{items.length}</span>}
        </button>
      ))}
    </div>
  );
}
```

`src/canvas/StepTitle.tsx` (Task 12 replaces this with the editable version):
```tsx
import type { BoardNode } from '../model/types';

interface Props {
  node: BoardNode;
  editable: boolean;
  className?: string;
  placeholder?: string;
}

export function StepTitle({ node, className = 'fs-title', placeholder = 'Untitled' }: Props) {
  return <div className={className}>{node.title || <span className="fs-placeholder">{placeholder}</span>}</div>;
}
```

`src/canvas/StepNode.tsx`:
```tsx
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { Clock } from 'lucide-react';
import { memo } from 'react';
import { formatDuration } from '../model/duration';
import type { Side } from '../model/types';
import { flowStore } from '../store/store';
import { FlagBadges } from './FlagBadges';
import { ACTOR_LABEL, ActorIcon } from './labels';
import { ShapeSvg } from './ShapeSvg';
import { StepTitle } from './StepTitle';
import type { StepFlowNode } from './toFlow';

const HANDLES: Array<[Side, Position]> = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
];

const begin = () => flowStore.getState().begin();
const commit = () => flowStore.getState().commit();

export const StepNode = memo(function StepNode({ id, data, selected }: NodeProps<StepFlowNode>) {
  const { node, critical, dimmed, glowing, editable } = data;
  const className = [
    'fs-step',
    `shape-${node.shape}`,
    node.actor && `actor-${node.actor}`,
    node.color && `tint-${node.color}`,
    selected && 'is-selected',
    critical && 'is-critical',
    dimmed && 'is-dimmed',
    glowing && 'is-glowing',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} style={{ width: node.w, height: node.h }} data-testid={`node-${id}`} title={node.replaces ? `Replaces: ${node.replaces}` : undefined}>
      {editable && <NodeResizer isVisible={selected} minWidth={40} minHeight={32} onResizeStart={begin} onResizeEnd={commit} />}
      <ShapeSvg shape={node.shape} w={node.w} h={node.h} />
      {node.actor && (
        <span className="fs-actor-chip" title={ACTOR_LABEL[node.actor]}>
          <ActorIcon actor={node.actor} />
        </span>
      )}
      <div className="fs-step-body">
        <StepTitle node={node} editable={editable} />
        {node.note && <div className="fs-note">{node.note}</div>}
        {(node.owner || node.durationMin !== null || critical) && (
          <div className="fs-step-meta">
            {node.owner && <span className="fs-owner">{node.owner}</span>}
            {node.durationMin !== null ? (
              <span>
                <Clock size={10} />
                {formatDuration(node.durationMin)}
              </span>
            ) : (
              critical && <span className="fs-no-duration">no duration</span>
            )}
          </div>
        )}
      </div>
      <FlagBadges flags={node.flags} />
      {node.status && <span className={`fs-status status-${node.status}`} title={node.status} />}
      {HANDLES.map(([side, position]) => (
        <Handle key={side} id={side} type="source" position={position} className="fs-handle" isConnectable={editable} />
      ))}
    </div>
  );
});
```

`src/canvas/TextNode.tsx`:
```tsx
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { flowStore } from '../store/store';
import { StepTitle } from './StepTitle';
import type { TextFlowNode } from './toFlow';

export const TextNode = memo(function TextNode({ id, data, selected }: NodeProps<TextFlowNode>) {
  const { node, editable, glowing } = data;
  return (
    <div className={`fs-textnode ${selected ? 'is-selected' : ''} ${glowing ? 'is-glowing' : ''}`} style={{ width: node.w, minHeight: node.h }} data-testid={`node-${id}`}>
      {editable && (
        <NodeResizer isVisible={selected} minWidth={60} minHeight={24} onResizeStart={() => flowStore.getState().begin()} onResizeEnd={() => flowStore.getState().commit()} />
      )}
      <StepTitle node={node} editable={editable} className="fs-text" placeholder="Text" />
    </div>
  );
});
```

`src/canvas/GroupNode.tsx`:
```tsx
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { flowStore } from '../store/store';
import { StepTitle } from './StepTitle';
import type { GroupFlowNode } from './toFlow';

export const GroupNode = memo(function GroupNode({ id, data, selected }: NodeProps<GroupFlowNode>) {
  const { node, editable } = data;
  return (
    <div className={`fs-group ${selected ? 'is-selected' : ''}`} style={{ width: node.w, height: node.h }} data-testid={`node-${id}`}>
      {editable && (
        <NodeResizer isVisible={selected} minWidth={160} minHeight={100} onResizeStart={() => flowStore.getState().begin()} onResizeEnd={() => flowStore.getState().commit()} />
      )}
      <div className="fs-group-label">
        <StepTitle node={node} editable={editable} className="fs-group-title" placeholder="Group" />
      </div>
    </div>
  );
});
```

`src/canvas/LaneNode.tsx` (Task 14 adds inline rename):
```tsx
import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { LaneFlowNode } from './toFlow';

export const LaneNode = memo(function LaneNode({ data }: NodeProps<LaneFlowNode>) {
  return (
    <div className={`fs-lane ${data.alt ? 'alt' : ''} dir-${data.direction}`}>
      <span className="fs-lane-label">{data.lane.name}</span>
    </div>
  );
});
```

`src/canvas/FlowEdge.tsx` (Task 12 adds the edge toolbar):
```tsx
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { FlagBadges } from './FlagBadges';
import type { FlowEdgeType } from './toFlow';

export function FlowEdge(props: EdgeProps<FlowEdgeType>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 14, offset: 22 });
  if (!data) return null;
  const { edge, critical, dimmed } = data;
  const className = ['fs-edge', `type-${edge.type}`, critical && 'is-critical', dimmed && 'is-dimmed', selected && 'is-selected'].filter(Boolean).join(' ');
  const openFlags = edge.flags.filter((f) => !f.resolved);
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className={className} interactionWidth={18} />
      {(edge.label || openFlags.length > 0) && (
        <EdgeLabelRenderer>
          <div className={`fs-edge-label nodrag nopan ${dimmed ? 'is-dimmed' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {edge.label && <span>{edge.label}</span>}
            <FlagBadges flags={openFlags} />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
```

`src/canvas/canvas.css`:
```css
.fs-flow {
  --xy-background-color: var(--canvas);
}
.fs-step {
  position: relative;
  display: grid;
  place-items: center;
  font-size: 13px;
  line-height: 1.3;
  color: var(--text);
  transition: opacity 0.15s;
}
.fs-shape {
  position: absolute;
  inset: 0;
  overflow: visible;
  filter: drop-shadow(0 1px 2px var(--shape-shadow));
}
.fs-shape-body {
  fill: var(--step-fill);
  stroke: var(--step-stroke);
  stroke-width: 1.25;
  transition: stroke 0.15s, fill 0.15s;
}
.fs-shape-lip {
  fill: none;
  stroke: var(--step-stroke);
  stroke-width: 1.25;
}
.shape-sticky .fs-shape-body {
  fill: var(--sticky-fill);
  stroke: var(--sticky-stroke);
}
.actor-person .fs-shape-body,
.actor-person .fs-shape-lip {
  stroke: var(--person);
  stroke-width: 1.6;
}
.actor-system .fs-shape-body,
.actor-system .fs-shape-lip {
  stroke: var(--system);
  stroke-width: 1.6;
}
.actor-agent .fs-shape-body,
.actor-agent .fs-shape-lip {
  stroke: var(--agent);
  stroke-width: 1.6;
}
.tint-blue .fs-shape-body { fill: var(--tint-blue); }
.tint-green .fs-shape-body { fill: var(--tint-green); }
.tint-amber .fs-shape-body { fill: var(--tint-amber); }
.tint-rose .fs-shape-body { fill: var(--tint-rose); }
.tint-violet .fs-shape-body { fill: var(--tint-violet); }
.tint-slate .fs-shape-body { fill: var(--tint-slate); }
.fs-step.is-selected .fs-shape-body {
  stroke: var(--accent);
  stroke-width: 2.25;
}
.fs-step.is-critical .fs-shape-body {
  stroke: var(--critical);
  stroke-width: 2.5;
}
.fs-step.is-critical .fs-shape {
  filter: drop-shadow(0 0 6px var(--critical-soft));
}
.is-dimmed {
  opacity: 0.28;
}
.is-glowing .fs-shape,
.fs-textnode.is-glowing {
  animation: fs-glow 2s ease-out;
}
@keyframes fs-glow {
  0% { filter: drop-shadow(0 0 0 var(--accent)); }
  20% { filter: drop-shadow(0 0 10px var(--accent)); }
  100% { filter: drop-shadow(0 1px 2px var(--shape-shadow)); }
}
.fs-step-body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 14px;
  max-width: 100%;
  max-height: 100%;
  box-sizing: border-box;
  text-align: center;
  overflow: hidden;
}
.shape-decision .fs-step-body { padding: 8px 22%; }
.shape-data .fs-step-body,
.shape-preparation .fs-step-body { padding: 8px 24px; }
.shape-connector .fs-step-body { padding: 0; font-size: 11px; }
.shape-sticky .fs-step-body { place-self: start; padding: 12px; text-align: left; align-items: flex-start; }
.fs-title {
  font-weight: 550;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.shape-sticky .fs-title {
  font-weight: 450;
  -webkit-line-clamp: 6;
}
.fs-note {
  font-size: 11px;
  color: var(--text-2);
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.fs-no-duration {
  color: var(--critical);
}
.fs-placeholder {
  color: var(--text-3);
  font-weight: 450;
}
.fs-step-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--text-2);
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
}
.fs-step-meta span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fs-actor-chip {
  position: absolute;
  top: -8px;
  left: -8px;
  z-index: 2;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--on-color);
  box-shadow: var(--shadow-sm);
}
.actor-person .fs-actor-chip { background: var(--person); }
.actor-system .fs-actor-chip { background: var(--system); }
.actor-agent .fs-actor-chip { background: var(--agent); }
.fs-flags {
  position: absolute;
  top: -9px;
  right: -6px;
  z-index: 2;
  display: flex;
  gap: 3px;
}
.fs-edge-label .fs-flags {
  position: static;
}
.fs-flag {
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border: 0;
  border-radius: 9px;
  font-size: 10.5px;
  font-weight: 650;
  color: var(--on-color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}
.flag-blocker { background: var(--blocker); }
.flag-warning { background: var(--warning); color: var(--on-warning); }
.flag-question { background: var(--question); }
.fs-status {
  position: absolute;
  bottom: 6px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  z-index: 2;
  box-sizing: border-box;
}
.status-idea { border: 1.5px dashed var(--text-3); }
.status-planned { background: var(--text-3); }
.status-active { background: var(--warning); }
.status-done { background: var(--done); }
.fs-handle {
  width: 9px;
  height: 9px;
  background: var(--surface);
  border: 1.5px solid var(--accent);
  opacity: 0;
  transition: opacity 0.12s;
}
.fs-step:hover .fs-handle,
.fs-step.is-selected .fs-handle {
  opacity: 1;
}
.fs-textnode {
  font-size: 14px;
  color: var(--text);
  padding: 6px 8px;
  box-sizing: border-box;
  border-radius: 6px;
}
.fs-textnode.is-selected {
  outline: 1.5px solid var(--accent);
}
.fs-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.fs-group {
  position: relative;
  border: 1.5px dashed var(--group-stroke);
  background: var(--group-fill);
  border-radius: 14px;
  box-sizing: border-box;
}
.fs-group.is-selected {
  border-color: var(--accent);
  border-style: solid;
}
.fs-group-label {
  position: absolute;
  top: 8px;
  left: 12px;
  right: 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}
.fs-lane {
  width: 100%;
  height: 100%;
  background: var(--lane-a);
  border-bottom: 1px solid var(--lane-line);
  box-sizing: border-box;
  position: relative;
}
.fs-lane.dir-TB {
  border-bottom: 0;
  border-right: 1px solid var(--lane-line);
}
.fs-lane.alt {
  background: var(--lane-b);
}
.fs-lane-label {
  position: absolute;
  top: 10px;
  left: 14px;
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
  pointer-events: all;
}
.react-flow__node-lane {
  pointer-events: none;
}
.react-flow .fs-edge {
  stroke: var(--edge);
  stroke-width: 1.6;
  fill: none;
}
.react-flow .fs-edge.type-dependency { stroke-dasharray: 6 5; }
.react-flow .fs-edge.type-handoff { stroke-dasharray: 1.5 5; stroke-linecap: round; }
.react-flow .fs-edge.is-selected { stroke: var(--accent); stroke-width: 2.2; }
.react-flow .fs-edge.is-critical { stroke: var(--critical); stroke-width: 2.6; }
.react-flow .fs-edge.is-dimmed { opacity: 0.25; }
.fs-edge-label {
  position: absolute;
  pointer-events: all;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 7px;
  font-size: 11.5px;
  color: var(--text-2);
  display: flex;
  gap: 4px;
  align-items: center;
  box-shadow: var(--shadow-sm);
}
.react-flow__resize-control.handle {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--surface);
  border: 1.5px solid var(--accent);
}
.react-flow__resize-control.line {
  border-color: transparent;
}
.react-flow__minimap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  margin-bottom: 28px;
}
.react-flow__selection {
  background: var(--accent-soft);
  border: 1px solid var(--accent);
}
.fs-shape-icon path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
}
```

- [ ] **Step 8: Write the canvas**

`src/canvas/Canvas.tsx`:
```tsx
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
  type OnConnectEnd,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { criticalPath } from '../analysis/criticalPath';
import { SHAPE_SIZE } from '../model/factory';
import { SHAPES, SIDES, type Board, type Shape, type Side } from '../model/types';
import { connect } from '../ops/edges';
import { addStep, resizeNode, setPositions } from '../ops/steps';
import { flowStore, useFlow } from '../store/store';
import { cursor } from './cursor';
import { FlowEdge } from './FlowEdge';
import { GroupNode } from './GroupNode';
import { LaneNode } from './LaneNode';
import { setRevealer } from './reveal';
import { runSafely } from './safe';
import { StepNode } from './StepNode';
import { TextNode } from './TextNode';
import { toFlowEdges, toFlowNodes, type FlowEdgeType, type FlowNode, type FlowView, type RenderCache } from './toFlow';
import { useThemeColors, type ThemeColors } from './useThemeColors';
import './canvas.css';

export const SHAPE_MIME = 'application/x-flowstate-shape';

const nodeTypes = { step: StepNode, text: TextNode, group: GroupNode, lane: LaneNode };
const edgeTypes = { flow: FlowEdge };
const EMPTY: string[] = [];
const viewports = new Map<string, Viewport>();

function asSide(value: string | null | undefined): Side | null {
  return SIDES.find((s) => s === value) ?? null;
}

function withGroupMembers(board: Board, positions: Record<string, { x: number; y: number }>) {
  const out = { ...positions };
  for (const [id, pos] of Object.entries(positions)) {
    const group = board.nodes.find((n) => n.id === id && n.kind === 'group');
    if (!group) continue;
    const dx = pos.x - group.x;
    const dy = pos.y - group.y;
    for (const m of board.nodes) if (m.groupId === id && !out[m.id]) out[m.id] = { x: m.x + dx, y: m.y + dy };
  }
  return out;
}

function minimapColor(type: string | undefined, actor: string | null | undefined, colors: ThemeColors): string {
  if (type === 'lane' || type === 'group' || type === 'text') return 'transparent';
  if (actor === 'person') return colors.person;
  if (actor === 'system') return colors.system;
  if (actor === 'agent') return colors.agent;
  return colors.stepStroke;
}

function revealIds(rf: ReactFlowInstance<FlowNode, FlowEdgeType>, ids: string[]): void {
  const nodes = ids.map((id) => rf.getNode(id)).filter((n): n is FlowNode => !!n);
  const pane = document.querySelector('.fs-canvas-main')?.getBoundingClientRect();
  if (nodes.length === 0 || !pane) return;
  const { x, y, zoom } = rf.getViewport();
  const visible = nodes.some((n) => {
    const sx = n.position.x * zoom + x;
    const sy = n.position.y * zoom + y;
    return sx > 0 && sy > 0 && sx < pane.width && sy < pane.height;
  });
  if (visible) return;
  const first = nodes[0];
  rf.setCenter(first.position.x + (first.width ?? 0) / 2, first.position.y + (first.height ?? 0) / 2, { zoom, duration: 400 });
}

export function Canvas({ boardId, editable }: { boardId: string; editable: boolean }) {
  const board = useFlow((s) => s.project.boards.find((b) => b.id === boardId));
  const selection = useFlow((s) => (editable ? s.selection : EMPTY));
  const edgeSelection = useFlow((s) => (editable ? s.edgeSelection : EMPTY));
  const glow = useFlow((s) => s.glow);
  const showCritical = useFlow((s) => s.criticalPath);
  const exporting = useFlow((s) => s.exporting);
  const colors = useThemeColors();
  const rf = useReactFlow<FlowNode, FlowEdgeType>();
  const nodeCache = useRef<RenderCache<FlowNode>>(new Map());
  const edgeCache = useRef<RenderCache<FlowEdgeType>>(new Map());
  const measured = useRef(new Map<string, { width: number; height: number }>());
  const [measureTick, setMeasureTick] = useState(0);

  const cp = useMemo(() => (showCritical && board ? criticalPath(board) : null), [showCritical, board]);
  const view = useMemo<FlowView>(
    () => ({
      selection: new Set(selection),
      edgeSelection: new Set(edgeSelection),
      criticalNodes: cp ? new Set(cp.nodeIds) : null,
      criticalEdges: cp ? new Set(cp.edgeIds) : null,
      glow,
      editable,
      edgeColor: colors.edge,
      criticalColor: colors.critical,
      accentColor: colors.accent,
    }),
    [selection, edgeSelection, cp, glow, editable, colors],
  );
  // React Flow drops handle bounds for nodes without `measured`, which hides their edges for a frame on every change.
  const nodes = useMemo(() => (board ? toFlowNodes(board, view, nodeCache.current, measured.current) : []), [board, view, measureTick]);
  const edges = useMemo(() => (board ? toFlowEdges(board, view, edgeCache.current) : []), [board, view]);

  useEffect(() => (editable ? setRevealer((ids) => revealIds(rf, ids)) : undefined), [rf, editable]);

  const startEditing = useCallback((id: string) => {
    const st = flowStore.getState();
    st.select([id]);
    st.setEditing(id);
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const st = flowStore.getState();
      const positions: Record<string, { x: number; y: number }> = {};
      const sizes: Record<string, { width: number; height: number }> = {};
      let nextSelection: Set<string> | null = null;
      let remeasured = false;
      for (const ch of changes) {
        if (ch.type === 'position' && ch.position && !ch.id.startsWith('lane:')) positions[ch.id] = ch.position;
        else if (ch.type === 'dimensions' && ch.dimensions) {
          measured.current.set(ch.id, { ...ch.dimensions });
          remeasured = true;
          if (ch.resizing) sizes[ch.id] = ch.dimensions;
        }
        else if (ch.type === 'select' && !ch.id.startsWith('lane:')) {
          nextSelection ??= new Set(st.selection);
          if (ch.selected) nextSelection.add(ch.id);
          else nextSelection.delete(ch.id);
        }
      }
      if (editable && (Object.keys(positions).length || Object.keys(sizes).length)) {
        runSafely(() =>
          st.changeBoard((b) => {
            setPositions(b, withGroupMembers(b, positions));
            for (const [id, d] of Object.entries(sizes)) {
              const n = b.nodes.find((x) => x.id === id);
              if (n) resizeNode(b, id, { x: positions[id]?.x ?? n.x, y: positions[id]?.y ?? n.y, w: d.width, h: d.height });
            }
          }, boardId),
        );
      }
      if (nextSelection && editable) st.select([...nextSelection], st.edgeSelection);
      if (remeasured) setMeasureTick((t) => t + 1);
    },
    [boardId, editable],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdgeType>[]) => {
      if (!editable) return;
      const st = flowStore.getState();
      let next: Set<string> | null = null;
      for (const ch of changes) {
        if (ch.type !== 'select') continue;
        next ??= new Set(st.edgeSelection);
        if (ch.selected) next.add(ch.id);
        else next.delete(ch.id);
      }
      if (next) st.select(st.selection, [...next]);
    },
    [editable],
  );

  const onConnect: OnConnect = useCallback(
    (c) => {
      runSafely(() =>
        flowStore.getState().changeBoard((b) => connect(b, { source: c.source, target: c.target, sourceSide: asSide(c.sourceHandle), targetSide: asSide(c.targetHandle) }), boardId),
      );
    },
    [boardId],
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      if (state.isValid || !state.fromNode || !editable) return;
      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      const pos = rf.screenToFlowPosition({ x: point.clientX, y: point.clientY });
      const fromId = state.fromNode.id;
      const fromSide = asSide(state.fromHandle?.id);
      const dropId = document.elementFromPoint(point.clientX, point.clientY)?.closest('.react-flow__node')?.getAttribute('data-id');
      const dropTarget = board?.nodes.find((n) => n.id === dropId && n.kind !== 'group' && n.id !== fromId);
      if (dropTarget) {
        runSafely(() => flowStore.getState().changeBoard((b) => connect(b, { source: fromId, target: dropTarget.id, sourceSide: fromSide }), boardId));
        return;
      }
      const id = runSafely(() =>
        flowStore.getState().changeBoard((b) => {
          const from = b.nodes.find((n) => n.id === fromId);
          const created = addStep(b, { x: pos.x - 90, y: pos.y - 36, actor: from?.actor ?? null });
          connect(b, { source: fromId, target: created, sourceSide: fromSide });
          return created;
        }, boardId),
      );
      if (id) startEditing(id);
    },
    [rf, board, boardId, editable, startEditing],
  );

  const onPaneClick = useCallback(
    (event: ReactMouseEvent) => {
      const st = flowStore.getState();
      if (event.detail === 2 && editable) {
        const pos = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const id = runSafely(() => st.changeBoard((b) => addStep(b, { x: pos.x - 90, y: pos.y - 36 }), boardId));
        if (id) startEditing(id);
        return;
      }
      st.setEditing(null);
    },
    [rf, boardId, editable, startEditing],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      const raw = event.dataTransfer.getData(SHAPE_MIME);
      const shape = SHAPES.find((s): s is Shape => s === raw);
      if (!shape || !editable) return;
      event.preventDefault();
      const pos = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const size = SHAPE_SIZE[shape];
      const id = runSafely(() => flowStore.getState().changeBoard((b) => addStep(b, { shape, x: pos.x - size.w / 2, y: pos.y - size.h / 2 }), boardId));
      if (id) startEditing(id);
    },
    [rf, boardId, editable, startEditing],
  );

  if (!board) return null;
  const saved = viewports.get(boardId);
  return (
    <ReactFlow<FlowNode, FlowEdgeType>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      onNodeDragStart={() => flowStore.getState().begin()}
      onNodeDragStop={() => flowStore.getState().commit()}
      onNodeDoubleClick={(_, node) => editable && node.type !== 'lane' && startEditing(node.id)}
      onPaneClick={onPaneClick}
      onPaneContextMenu={(e) => e.preventDefault()}
      onPaneMouseMove={(e) => {
        cursor.flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      }}
      onMoveEnd={(_, vp) => viewports.set(boardId, vp)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(SHAPE_MIME)) e.preventDefault();
      }}
      onDrop={onDrop}
      defaultViewport={saved}
      fitView={!saved}
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      connectionMode={ConnectionMode.Loose}
      minZoom={0.05}
      maxZoom={4}
      panOnDrag={[1, 2]}
      selectionOnDrag={editable}
      selectionMode={SelectionMode.Partial}
      panActivationKeyCode="Space"
      zoomOnDoubleClick={false}
      deleteKeyCode={null}
      multiSelectionKeyCode="Shift"
      nodesDraggable={editable}
      nodesConnectable={editable}
      elementsSelectable={editable}
      onlyRenderVisibleElements={!exporting}
      disableKeyboardA11y
      className={editable ? 'fs-flow' : 'fs-flow is-reference'}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.3} color={colors.dot} />
      {editable && (
        <MiniMap
          pannable
          zoomable
          nodeStrokeWidth={0}
          maskColor={colors.mask}
          nodeColor={(n) => minimapColor(n.type, n.type === 'lane' ? null : (n.data as { node?: { actor: string | null } }).node?.actor, colors)}
        />
      )}
    </ReactFlow>
  );
}
```

- [ ] **Step 9: Write the e2e fixtures and the rendering test**

`tests/e2e/fixtures.ts`:
```ts
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { createProject } from '../../src/model/factory';
import type { Board, Project } from '../../src/model/types';

export async function seed(request: APIRequestContext, build: (board: Board, project: Project) => void = () => {}, name = 'E2E'): Promise<Project> {
  const project = createProject(name);
  build(project.boards[0], project);
  const res = await request.put(`/api/projects/${project.id}`, { data: project });
  expect(res.ok()).toBe(true);
  return project;
}

export async function open(page: Page, project: Project): Promise<void> {
  await page.goto(`/?project=${project.id}`);
  await page.locator('.react-flow__pane').waitFor();
}

export async function board(page: Page): Promise<Board> {
  return page.evaluate(() => {
    const s = window.__flowstate!.getState();
    return JSON.parse(JSON.stringify(s.project.boards.find((b) => b.id === s.activeBoardId)));
  });
}

export async function titles(page: Page): Promise<string[]> {
  return (await board(page)).nodes.filter((n) => n.kind === 'step').map((n) => n.title);
}

export async function links(page: Page): Promise<string[]> {
  const b = await board(page);
  const title = (id: string) => b.nodes.find((n) => n.id === id)?.title ?? id;
  return b.edges.map((e) => `${title(e.source)}>${title(e.target)}`).sort();
}

export function node(page: Page, id: string) {
  return page.getByTestId(`node-${id}`);
}
```

`tests/e2e/canvas.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { ACTORS, SHAPES } from '../../src/model/types';
import { connect } from '../../src/ops/edges';
import { addFlag } from '../../src/ops/flags';
import { groupSteps } from '../../src/ops/groups';
import { setLanes } from '../../src/ops/lanes';
import { addStep } from '../../src/ops/steps';
import { addText } from '../../src/ops/text';
import { open, seed } from './fixtures';

test('renders every shape, arrow style, lane, group, text and flag', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  const project = await seed(request, (b) => {
    setLanes(b, ['Intake']);
    const ids = SHAPES.map((shape, i) => addStep(b, { shape, title: shape, x: i * 240, y: 400, actor: ACTORS[i % 3] }));
    connect(b, { source: ids[0], target: ids[1] });
    connect(b, { source: ids[1], target: ids[2], type: 'dependency' });
    connect(b, { source: ids[2], target: ids[3], type: 'handoff', label: 'docs' });
    addFlag(b, ids[0], 'blocker', 'No access');
    groupSteps(b, [ids[4], ids[5]], 'Phase one');
    addText(b, { text: 'Hello note', x: 0, y: 250 });
  });
  await open(page, project);
  await expect(page.locator('.react-flow__node-step')).toHaveCount(9);
  await expect(page.locator('.fs-edge.type-flow')).toHaveCount(1);
  await expect(page.locator('.fs-edge.type-dependency')).toHaveCount(1);
  await expect(page.locator('.fs-edge.type-handoff')).toHaveCount(1);
  await expect(page.locator('.fs-edge-label', { hasText: 'docs' })).toBeVisible();
  await expect(page.locator('.flag-blocker')).toBeVisible();
  await expect(page.locator('.fs-lane-label', { hasText: 'Intake' })).toBeVisible();
  await expect(page.getByText('Phase one')).toBeVisible();
  await expect(page.getByText('Hello note')).toBeVisible();
  await expect(page.locator('.actor-agent .fs-actor-chip').first()).toBeVisible();
  await test.info().attach('light', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('follows the system dark theme', async ({ page, request }) => {
  const project = await seed(request, (b) => {
    addStep(b, { title: 'A' });
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page, project);
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(dark).not.toBe(light);
  await test.info().attach('dark', { body: await page.screenshot(), contentType: 'image/png' });
});
```

- [ ] **Step 10: Run the tests**

Run: `npx vitest run` then `npx playwright test tests/e2e/canvas.spec.ts tests/e2e/smoke.spec.ts` then `npm run typecheck`
Expected: all pass. Open the attached screenshots in `test-results` (or run `npm run dev` and look) and confirm the shapes read clearly in both themes before moving on.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Render boards on an infinite canvas with shapes, arrows, lanes and themes"
```

---

### Task 12: Canvas interactions: inline editing, add handles, floating toolbars

**Files:**
- Create: `src/ui/controls.tsx`, `src/canvas/focusKey.ts`, `src/canvas/AddHandles.tsx`, `src/canvas/FlagList.tsx`, `src/canvas/FloatingToolbar.tsx`, `src/canvas/EdgeToolbar.tsx`
- Modify: `src/canvas/StepTitle.tsx` (full replacement), `src/canvas/StepNode.tsx`, `src/canvas/FlowEdge.tsx`, `src/canvas/Canvas.tsx`, `src/canvas/canvas.css` (append)
- Test: `tests/e2e/interactions.spec.ts`

**Interfaces:**
- Consumes: store `editingId`, `editSeed`, `setEditing`, `select`; ops `updateSteps`, `addNext`, `addStepOnSide`, `addFlag`, `updateFlagText`, `setFlagResolved`, `removeFlag`, `updateEdge`, `deleteEdges`; `parseDuration`, `formatDuration`, `DurationError`.
- Produces: `ToolButton`, `FieldInput` (with `focusKey` that takes a pending focus request on mount), `Divider` in `src/ui/controls.tsx`; `requestFocus(key)`, `consumeFocus(key): boolean` in `src/canvas/focusKey.ts` (keys `flag:<id>`, `label:<edgeId>`); `FlagList`, `FloatingToolbar`, `EdgeToolbar`, `AddHandles` components.

- [ ] **Step 1: Write the failing e2e tests**

`tests/e2e/interactions.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { addStep } from '../../src/ops/steps';
import { board, links, node, open, seed } from './fixtures';

test('double-click edits a title inline', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Draft', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Review claim');
  await page.keyboard.press('Enter');
  await expect(node(page, 's1')).toContainText('Review claim');
  expect((await board(page)).nodes[0].title).toBe('Review claim');
});

test('Tab while typing commits and chains the next step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').dblclick();
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  await page.keyboard.type('B');
  await page.keyboard.press('Enter');
  expect(await links(page)).toEqual(['A>B']);
});

test('hover plus adds a connected step and starts editing', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Start', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').hover();
  await node(page, 's1').getByRole('button', { name: 'Add step right' }).click();
  await page.keyboard.type('Next');
  await page.keyboard.press('Enter');
  expect(await links(page)).toEqual(['Start>Next']);
});

test('dragging a step is one undo entry', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
  });
  await open(page, p);
  const box = (await node(page, 's1').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 150, { steps: 12 });
  await page.mouse.up();
  const moved = (await board(page)).nodes[0];
  expect(moved.x).not.toBe(0);
  expect(await page.evaluate(() => window.__flowstate!.getState().past.length)).toBe(1);
  await page.evaluate(() => window.__flowstate!.getState().undo());
  expect((await board(page)).nodes[0]).toMatchObject({ x: 0, y: 0 });
});

test('dragging from a handle connects two steps, or creates one on empty canvas', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', x: 400, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').hover();
  const handle = (await node(page, 's1').locator('.react-flow__handle-right').boundingBox())!;
  const target = (await node(page, 's2').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 });
  await page.mouse.up();
  expect(await links(page)).toEqual(['A>B']);

  await node(page, 's2').hover();
  const h2 = (await node(page, 's2').locator('.react-flow__handle-bottom').boundingBox())!;
  await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
  await page.mouse.down();
  await page.mouse.move(h2.x, h2.y + 220, { steps: 15 });
  await page.mouse.up();
  await page.keyboard.type('C');
  await page.keyboard.press('Enter');
  expect(await links(page)).toEqual(['A>B', 'B>C']);
});

test('the floating toolbar sets actor, duration, owner and flags', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Triage', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  const bar = page.locator('.fs-toolbar');
  await bar.getByRole('button', { name: 'AI agent (A)' }).click();
  await bar.getByLabel('Duration').fill('2h 30m');
  await bar.getByLabel('Duration').press('Enter');
  await bar.getByLabel('Owner').fill('Intake Agent');
  await bar.getByLabel('Owner').press('Enter');
  await bar.getByRole('button', { name: 'Add blocker (B)' }).click();
  await page.keyboard.type('No API access');
  await page.keyboard.press('Enter');
  const n = (await board(page)).nodes[0];
  expect(n).toMatchObject({ actor: 'agent', durationMin: 150, owner: 'Intake Agent' });
  expect(n.flags).toMatchObject([{ kind: 'blocker', text: 'No API access', resolved: false }]);
  await expect(node(page, 's1')).toContainText('2h 30m');
});

test('an invalid duration shows a message and changes nothing', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Triage', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await page.locator('.fs-toolbar').getByLabel('Duration').fill('soon');
  await page.locator('.fs-toolbar').getByLabel('Duration').press('Enter');
  await expect(page.locator('.toast')).toContainText('Cannot read duration');
  expect((await board(page)).nodes[0].durationMin).toBeNull();
});

test('selecting an arrow shows its toolbar for type and label', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    addStep(b, { title: 'B', after: a });
  });
  await open(page, p);
  const edge = page.locator('.react-flow__edge').first();
  await edge.click({ force: true });
  const bar = page.locator('.fs-edge-toolbar');
  await bar.getByRole('button', { name: 'Dependency' }).click();
  await bar.getByLabel('Arrow label').fill('when approved');
  await bar.getByLabel('Arrow label').press('Enter');
  expect((await board(page)).edges[0]).toMatchObject({ type: 'dependency', label: 'when approved' });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx playwright test tests/e2e/interactions.spec.ts`
Expected: FAIL (no inline editor, no toolbar, no plus buttons).

- [ ] **Step 3: Write shared controls and focus requests**

`src/ui/controls.tsx`:
```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { consumeFocus } from '../canvas/focusKey';

export function ToolButton({ title, active, className, onClick, children }: { title: string; active?: boolean; className?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`fs-tool ${active ? 'is-active' : ''} ${className ?? ''}`} title={title} aria-label={title} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

export function Divider() {
  return <span className="fs-divider" aria-hidden />;
}

export function FieldInput({
  label,
  value,
  placeholder,
  width,
  focusKey,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  width: number;
  focusKey?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const skip = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (focusKey && consumeFocus(focusKey)) ref.current?.focus();
  }, [focusKey]);
  const commit = () => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    if (draft.trim() !== value) onCommit(draft.trim());
  };
  return (
    <input
      ref={ref}
      className="fs-field nodrag nopan"
      aria-label={label}
      title={label}
      placeholder={placeholder}
      style={{ width }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          skip.current = true;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
```

`src/canvas/focusKey.ts`:
```ts
let pending: string | null = null;

export function requestFocus(key: string): void {
  pending = key;
}

export function consumeFocus(key: string): boolean {
  if (pending !== key) return false;
  pending = null;
  return true;
}
```

- [ ] **Step 4: Replace `StepTitle.tsx` with the editable version**

`src/canvas/StepTitle.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import type { BoardNode } from '../model/types';
import { updateSteps } from '../ops/steps';
import { addNext } from '../ops/structure';
import { flowStore, useFlow } from '../store/store';
import { runSafely } from './safe';

interface Props {
  node: BoardNode;
  editable: boolean;
  className?: string;
  placeholder?: string;
}

export function StepTitle({ node, editable, className = 'fs-title', placeholder = 'Untitled' }: Props) {
  const editing = useFlow((s) => editable && s.editingId === node.id);
  if (editing) return <TitleEditor node={node} className={className} />;
  return <div className={className}>{node.title || <span className="fs-placeholder">{placeholder}</span>}</div>;
}

function TitleEditor({ node, className }: { node: BoardNode; className: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current!;
    const seed = flowStore.getState().editSeed;
    if (seed !== null) el.value = seed;
    el.focus();
    if (seed !== null) el.setSelectionRange(el.value.length, el.value.length);
    else el.select();
  }, []);

  const finish = (save: boolean, then?: 'next') => {
    if (done.current) return;
    done.current = true;
    const st = flowStore.getState();
    const value = ref.current!.value.trim();
    if (save && value !== node.title) runSafely(() => st.changeBoard((b) => updateSteps(b, [{ id: node.id, title: value }])));
    st.setEditing(null);
    if (then === 'next' && node.kind === 'step') {
      const id = runSafely(() => st.changeBoard((b) => addNext(b, node.id)));
      if (id) {
        st.select([id]);
        st.setEditing(id);
      }
    }
  };

  return (
    <textarea
      ref={ref}
      className={`${className} fs-title-input nodrag nopan nowheel`}
      defaultValue={node.title}
      rows={1}
      aria-label="Title"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Tab') {
          e.preventDefault();
          finish(true, 'next');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}
```

- [ ] **Step 5: Write add handles, flag list and toolbars**

`src/canvas/AddHandles.tsx`:
```tsx
import { Plus } from 'lucide-react';
import { SIDES, type Side } from '../model/types';
import { addStepOnSide } from '../ops/structure';
import { flowStore } from '../store/store';
import { runSafely } from './safe';

export function AddHandles({ nodeId }: { nodeId: string }) {
  const add = (side: Side) => {
    const st = flowStore.getState();
    const id = runSafely(() => st.changeBoard((b) => addStepOnSide(b, nodeId, side)));
    if (id) {
      st.select([id]);
      st.setEditing(id);
    }
  };
  return (
    <>
      {SIDES.map((side) => (
        <button
          key={side}
          type="button"
          className={`fs-add fs-add-${side} nodrag nopan`}
          title="Add a connected step"
          aria-label={`Add step ${side}`}
          onClick={(e) => {
            e.stopPropagation();
            add(side);
          }}
        >
          <Plus size={12} strokeWidth={2.5} />
        </button>
      ))}
    </>
  );
}
```

`src/canvas/FlagList.tsx`:
```tsx
import { Check, X } from 'lucide-react';
import type { Board, Flag } from '../model/types';
import { removeFlag, setFlagResolved, updateFlagText } from '../ops/flags';
import { flowStore } from '../store/store';
import { FieldInput, ToolButton } from '../ui/controls';
import { FLAG_LABEL } from './labels';
import { runSafely } from './safe';

const change = (fn: (b: Board) => void) => runSafely(() => flowStore.getState().changeBoard(fn));

export function FlagList({ flags }: { flags: Flag[] }) {
  return (
    <div className="fs-flaglist">
      {flags.map((f) => (
        <div key={f.id} className={`fs-flagrow ${f.resolved ? 'is-resolved' : ''}`}>
          <span className={`fs-flag-dot flag-${f.kind}`} aria-hidden />
          <FieldInput
            label={`${FLAG_LABEL[f.kind]} text`}
            width={230}
            placeholder={`Describe the ${FLAG_LABEL[f.kind].toLowerCase()}`}
            value={f.text}
            focusKey={`flag:${f.id}`}
            onCommit={(text) => change((b) => updateFlagText(b, f.id, text))}
          />
          <ToolButton title={f.resolved ? 'Reopen' : 'Resolve'} active={f.resolved} onClick={() => change((b) => setFlagResolved(b, f.id, !f.resolved))}>
            <Check size={13} />
          </ToolButton>
          <ToolButton title="Remove flag" onClick={() => change((b) => removeFlag(b, f.id))}>
            <X size={13} />
          </ToolButton>
        </div>
      ))}
    </div>
  );
}
```

`src/canvas/FloatingToolbar.tsx`:
```tsx
import { NodeToolbar, Position } from '@xyflow/react';
import { Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { DurationError, formatDuration, parseDuration } from '../model/duration';
import { ACTORS, FLAG_KINDS, SHAPES, STATUSES, type Board, type BoardNode, type FlagKind } from '../model/types';
import { addFlag } from '../ops/flags';
import { updateSteps, type StepFields } from '../ops/steps';
import { flowStore, useFlow } from '../store/store';
import { Divider, FieldInput, ToolButton } from '../ui/controls';
import { notify } from '../ui/toast';
import { FlagList } from './FlagList';
import { requestFocus } from './focusKey';
import { ACTOR_LABEL, ActorIcon, FLAG_KEY, FLAG_LABEL, FlagIcon, SHAPE_LABEL, TINTS } from './labels';
import { runSafely } from './safe';
import { ShapeIcon } from './ShapeSvg';

type Panel = 'shape' | 'color' | 'more' | null;

export function addFlagAndFocus(boardFn: (fn: (b: Board) => string) => string | undefined, hostId: string, kind: FlagKind): void {
  const id = boardFn((b) => addFlag(b, hostId, kind, ''));
  if (id) requestFocus(`flag:${id}`);
}

export function FloatingToolbar({ node }: { node: BoardNode }) {
  const visible = useFlow((s) => s.selection.length === 1 && s.selection[0] === node.id && s.editingId !== node.id && s.edgeSelection.length === 0);
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);
  const change = <R,>(fn: (b: Board) => R) => runSafely(() => flowStore.getState().changeBoard(fn));
  const update = (patch: StepFields) => change((b) => updateSteps(b, [{ id: node.id, ...patch }]));
  const setDuration = (text: string) => {
    try {
      update({ durationMin: parseDuration(text) });
    } catch (err) {
      if (err instanceof DurationError) notify(err.message);
      else throw err;
    }
  };

  return (
    <NodeToolbar isVisible={visible} position={Position.Top} offset={14} className="fs-toolbar nodrag nopan">
      <div className="fs-toolbar-row">
        <ToolButton title="Shape (1-9)" active={panel === 'shape'} onClick={() => toggle('shape')}>
          <ShapeIcon shape={node.shape} />
        </ToolButton>
        <Divider />
        {ACTORS.map((a) => (
          <ToolButton key={a} title={`${ACTOR_LABEL[a]} (A)`} active={node.actor === a} className={`actor-${a}`} onClick={() => update({ actor: node.actor === a ? null : a })}>
            <ActorIcon actor={a} size={14} />
          </ToolButton>
        ))}
        <Divider />
        <FieldInput label="Duration" width={70} placeholder="2h" value={node.durationMin === null ? '' : formatDuration(node.durationMin)} onCommit={setDuration} />
        <FieldInput label="Owner" width={124} placeholder="Owner" value={node.owner} onCommit={(owner) => update({ owner })} />
        <Divider />
        {FLAG_KINDS.map((k) => (
          <ToolButton key={k} title={`Add ${FLAG_LABEL[k].toLowerCase()} (${FLAG_KEY[k]})`} className={`flag-tool flag-tool-${k}`} onClick={() => addFlagAndFocus(change, node.id, k)}>
            <FlagIcon kind={k} size={14} />
          </ToolButton>
        ))}
        <ToolButton title="Colour" active={panel === 'color'} onClick={() => toggle('color')}>
          <span className={`fs-swatch swatch-${node.color ?? 'none'}`} />
        </ToolButton>
        <ToolButton title="More details" active={panel === 'more'} onClick={() => toggle('more')}>
          <Ellipsis size={15} />
        </ToolButton>
      </div>
      {panel === 'shape' && (
        <div className="fs-toolbar-row">
          {SHAPES.map((s, i) => (
            <ToolButton key={s} title={`${SHAPE_LABEL[s]} (${i + 1})`} active={node.shape === s} onClick={() => update({ shape: s })}>
              <ShapeIcon shape={s} />
            </ToolButton>
          ))}
        </div>
      )}
      {panel === 'color' && (
        <div className="fs-toolbar-row">
          {[null, ...TINTS].map((c) => (
            <ToolButton key={c ?? 'none'} title={c ?? 'Default'} active={node.color === c} onClick={() => update({ color: c })}>
              <span className={`fs-swatch swatch-${c ?? 'none'}`} />
            </ToolButton>
          ))}
        </div>
      )}
      {panel === 'more' && (
        <div className="fs-toolbar-row">
          <FieldInput label="Note" width={220} placeholder="One-line note" value={node.note} onCommit={(note) => update({ note })} />
          <select className="fs-field nodrag" aria-label="Status" value={node.status ?? ''} onChange={(e) => update({ status: STATUSES.find((s) => s === e.target.value) ?? null })}>
            <option value="">No status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <FieldInput label="Replaces" width={170} placeholder="Old steps this replaces" value={node.replaces} onCommit={(replaces) => update({ replaces })} />
        </div>
      )}
      {node.flags.length > 0 && <FlagList flags={node.flags} />}
    </NodeToolbar>
  );
}
```

`src/canvas/EdgeToolbar.tsx`:
```tsx
import { EdgeLabelRenderer } from '@xyflow/react';
import { Trash } from 'lucide-react';
import { EDGE_TYPES, FLAG_KINDS, type Board, type BoardEdge, type EdgeType } from '../model/types';
import { deleteEdges, updateEdge } from '../ops/edges';
import { flowStore, useFlow } from '../store/store';
import { Divider, FieldInput, ToolButton } from '../ui/controls';
import { FlagList } from './FlagList';
import { addFlagAndFocus } from './FloatingToolbar';
import { EDGE_LABEL, FLAG_KEY, FLAG_LABEL, FlagIcon } from './labels';
import { runSafely } from './safe';

function EdgeTypeIcon({ type }: { type: EdgeType }) {
  const dash = type === 'dependency' ? '4 3' : type === 'handoff' ? '1 3' : undefined;
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden>
      <path d="M1 5 H15" stroke="currentColor" strokeWidth="1.6" strokeDasharray={dash} strokeLinecap="round" />
      <path d="M14 1.5 L19 5 L14 8.5 Z" fill="currentColor" />
    </svg>
  );
}

export function EdgeToolbar({ edge, x, y }: { edge: BoardEdge; x: number; y: number }) {
  const visible = useFlow((s) => s.edgeSelection.length === 1 && s.edgeSelection[0] === edge.id && s.selection.length === 0);
  if (!visible) return null;
  const change = <R,>(fn: (b: Board) => R) => runSafely(() => flowStore.getState().changeBoard(fn));
  return (
    <EdgeLabelRenderer>
      <div className="fs-toolbar fs-edge-toolbar nodrag nopan" style={{ transform: `translate(-50%, calc(-100% - 20px)) translate(${x}px, ${y}px)` }}>
        <div className="fs-toolbar-row">
          {EDGE_TYPES.map((t) => (
            <ToolButton key={t} title={EDGE_LABEL[t]} active={edge.type === t} onClick={() => change((b) => updateEdge(b, edge.id, { type: t }))}>
              <EdgeTypeIcon type={t} />
            </ToolButton>
          ))}
          <Divider />
          <FieldInput
            label="Arrow label"
            width={130}
            placeholder="Label"
            value={edge.label}
            focusKey={`label:${edge.id}`}
            onCommit={(label) => change((b) => updateEdge(b, edge.id, { label }))}
          />
          <Divider />
          {FLAG_KINDS.map((k) => (
            <ToolButton key={k} title={`Add ${FLAG_LABEL[k].toLowerCase()} (${FLAG_KEY[k]})`} className={`flag-tool flag-tool-${k}`} onClick={() => addFlagAndFocus(change, edge.id, k)}>
              <FlagIcon kind={k} size={14} />
            </ToolButton>
          ))}
          <ToolButton title="Delete arrow (Del)" onClick={() => change((b) => deleteEdges(b, [edge.id]))}>
            <Trash size={14} />
          </ToolButton>
        </div>
        {edge.flags.length > 0 && <FlagList flags={edge.flags} />}
      </div>
    </EdgeLabelRenderer>
  );
}
```

- [ ] **Step 6: Wire them into nodes, edges and the canvas**

In `src/canvas/StepNode.tsx`:
- Add imports: `import { AddHandles } from './AddHandles';`, `import { FloatingToolbar } from './FloatingToolbar';`, and change `import { flowStore } from '../store/store';` to `import { flowStore, useFlow } from '../store/store';`.
- At the top of the component body add: `const editing = useFlow((s) => s.editingId === id);`
- Directly after the `NodeResizer` line add: `{editable && selected && <FloatingToolbar node={node} />}`
- Directly before the `HANDLES.map(...)` line add: `{editable && !editing && <AddHandles nodeId={id} />}`

In `src/canvas/FlowEdge.tsx`:
- Add import: `import { EdgeToolbar } from './EdgeToolbar';`
- Inside the fragment, after the label block, add: `{data.editable && selected && <EdgeToolbar edge={edge} x={labelX} y={labelY} />}`

In `src/canvas/Canvas.tsx`:
- Add import: `import { requestFocus } from './focusKey';`
- Add this prop to `<ReactFlow>` after `onNodeDoubleClick`:
```tsx
      onEdgeDoubleClick={(_, edge) => {
        if (!editable) return;
        requestFocus(`label:${edge.id}`);
        flowStore.getState().select([], [edge.id]);
      }}
```

Append to `src/canvas/canvas.css`:
```css
@keyframes fs-fade {
  from { opacity: 0; transform: translateY(3px); }
}
.fs-toolbar {
  animation: fs-fade 0.1s ease-out;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-md);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text);
}
.fs-edge-toolbar {
  position: absolute;
  pointer-events: all;
  z-index: 10;
}
.fs-toolbar-row {
  display: flex;
  align-items: center;
  gap: 2px;
}
.fs-tool {
  min-width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  border-radius: 7px;
  cursor: pointer;
  color: var(--text-2);
  padding: 0 4px;
}
.fs-tool:hover {
  background: var(--surface-2);
  color: var(--text);
}
.fs-tool.is-active {
  background: var(--accent-soft);
  color: var(--accent);
}
.fs-tool.actor-person.is-active { color: var(--person); background: color-mix(in srgb, var(--person) 14%, transparent); }
.fs-tool.actor-system.is-active { color: var(--system); background: color-mix(in srgb, var(--system) 14%, transparent); }
.fs-tool.actor-agent.is-active { color: var(--agent); background: color-mix(in srgb, var(--agent) 14%, transparent); }
.flag-tool-blocker { color: var(--blocker); }
.flag-tool-warning { color: var(--warning); }
.flag-tool-question { color: var(--question); }
.fs-divider {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 4px;
}
.fs-field {
  height: 26px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-2);
  color: var(--text);
  padding: 0 8px;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
}
.fs-field:focus {
  border-color: var(--accent);
  background: var(--surface);
}
.fs-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  display: inline-block;
}
.swatch-none { background: var(--step-fill); }
.swatch-blue { background: var(--tint-blue); }
.swatch-green { background: var(--tint-green); }
.swatch-amber { background: var(--tint-amber); }
.swatch-rose { background: var(--tint-rose); }
.swatch-violet { background: var(--tint-violet); }
.swatch-slate { background: var(--tint-slate); }
.fs-flaglist {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-top: 1px solid var(--border);
  padding-top: 4px;
}
.fs-flagrow {
  display: flex;
  align-items: center;
  gap: 4px;
}
.fs-flagrow.is-resolved .fs-field {
  text-decoration: line-through;
  color: var(--text-3);
}
.fs-flag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin: 0 4px;
  flex: none;
}
.fs-add {
  position: absolute;
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text-2);
  display: grid;
  place-items: center;
  opacity: 0;
  transition: opacity 0.12s, transform 0.12s;
  cursor: pointer;
  z-index: 3;
  box-shadow: var(--shadow-sm);
}
.fs-step:hover .fs-add {
  opacity: 1;
}
.fs-add:hover {
  color: var(--accent);
  border-color: var(--accent);
  transform: scale(1.12);
}
.fs-add-right { right: -34px; top: calc(50% - 10px); }
.fs-add-left { left: -34px; top: calc(50% - 10px); }
.fs-add-top { top: -34px; left: calc(50% - 10px); }
.fs-add-bottom { bottom: -34px; left: calc(50% - 10px); }
.fs-title-input {
  resize: none;
  border: 0;
  outline: none;
  background: transparent;
  text-align: inherit;
  font: inherit;
  font-weight: 550;
  color: var(--text);
  width: 100%;
  field-sizing: content;
  min-height: 1.3em;
  padding: 0;
  display: block;
  overflow: hidden;
}
```

- [ ] **Step 7: Run and watch the tests pass**

Run: `npx playwright test tests/e2e/interactions.spec.ts`
Expected: PASS. If a drag test flakes, raise `steps` in the mouse move rather than adding waits.

- [ ] **Step 8: Human playtest (first UI slice)**

Run `npm run dev`, open http://localhost:5173, and ask the user to spend five minutes building a small flow by mouse: double-click to create, hover plus, handle drags, toolbar. Record what felt slow or unclear and fix layout issues before continuing; headless tests cannot see them.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add inline editing, plus handles, and floating node and arrow toolbars"
```

---

### Task 13: Keyboard map, navigation and clipboard

**Files:**
- Create: `src/canvas/navigate.ts`, `src/canvas/viewport.ts`, `src/canvas/useKeyboard.ts`
- Modify: `src/canvas/Canvas.tsx`
- Test: `src/canvas/navigate.test.ts`, `tests/e2e/keyboard.spec.ts`

**Interfaces:**
- Consumes: store actions, ops, `tidyBoard`, `requestFocus`, `reveal`, `cursor`.
- Produces: `type Dir = 'left' | 'right' | 'up' | 'down'`, `nearestInDirection(board, fromId, dir): string | null`; `viewCenter(rf): { x: number; y: number }`; `isTyping(target): boolean`; `useKeyboard(boardId, enabled)`.

- [ ] **Step 1: Write the failing navigation unit test**

`src/canvas/navigate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { addStep } from '../ops/steps';
import { chain } from '../ops/testkit';
import { nearestInDirection } from './navigate';

describe('nearestInDirection', () => {
  it('moves along the flow and across to nearby steps', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    const d = addStep(b, { title: 'D', x: 252, y: 200 });
    expect(nearestInDirection(b, ids[1], 'right')).toBe(ids[2]);
    expect(nearestInDirection(b, ids[1], 'left')).toBe(ids[0]);
    expect(nearestInDirection(b, ids[1], 'down')).toBe(d);
    expect(nearestInDirection(b, ids[1], 'up')).toBeNull();
  });

  it('prefers a connected step over a slightly closer unconnected one', () => {
    const { b, ids } = chain(['A', 'B']);
    const near = addStep(b, { title: 'Near', x: 230, y: 90 });
    expect(nearestInDirection(b, ids[0], 'right')).toBe(ids[1]);
    expect(near).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run and watch it fail, then implement**

Run: `npx vitest run src/canvas/navigate.test.ts` (expect FAIL, missing module), then write:

`src/canvas/navigate.ts`:
```ts
import type { Board } from '../model/types';

export type Dir = 'left' | 'right' | 'up' | 'down';

const VECTOR: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const CONNECTED_BONUS = 0.6;

export function nearestInDirection(board: Board, fromId: string, dir: Dir): string | null {
  const from = board.nodes.find((n) => n.id === fromId);
  if (!from) return null;
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const [vx, vy] = VECTOR[dir];
  const linked = new Set(board.edges.flatMap((e) => (e.source === fromId ? [e.target] : e.target === fromId ? [e.source] : [])));
  let best: string | null = null;
  let bestScore = Infinity;
  for (const n of board.nodes) {
    if (n.id === fromId || n.kind === 'group') continue;
    const dx = n.x + n.w / 2 - cx;
    const dy = n.y + n.h / 2 - cy;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) continue;
    const along = (dx * vx + dy * vy) / dist;
    if (along < 0.5) continue;
    const score = dist * (2 - along) * (linked.has(n.id) ? CONNECTED_BONUS : 1);
    if (score < bestScore) {
      bestScore = score;
      best = n.id;
    }
  }
  return best;
}
```

`src/canvas/viewport.ts`:
```ts
import type { ReactFlowInstance } from '@xyflow/react';

export function viewCenter(rf: Pick<ReactFlowInstance, 'screenToFlowPosition'>): { x: number; y: number } {
  const pane = document.querySelector('.fs-canvas-main')?.getBoundingClientRect();
  if (!pane) return { x: 0, y: 0 };
  return rf.screenToFlowPosition({ x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 });
}
```

Run: `npx vitest run src/canvas/navigate.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing keyboard e2e tests**

`tests/e2e/keyboard.spec.ts`:
```ts
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
    b.edges.push({ id: 'e9', source: a, target: 's2', sourceSide: null, targetSide: null, type: 'flow', label: '', flags: [] });
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
```

- [ ] **Step 4: Run and watch them fail**

Run: `npx playwright test tests/e2e/keyboard.spec.ts`
Expected: FAIL (no keyboard handling).

- [ ] **Step 5: Implement the keyboard hook**

`src/canvas/useKeyboard.ts`:
```ts
import { useReactFlow } from '@xyflow/react';
import { useEffect } from 'react';
import { tidyBoard } from '../layout/tidyBoard';
import { ACTORS, SHAPES, type Actor, type Board, type FlagKind } from '../model/types';
import { copySubgraph, pasteSubgraph } from '../ops/clipboard';
import { deleteEdges } from '../ops/edges';
import { addFlag } from '../ops/flags';
import { addStep, deleteSteps, updateSteps } from '../ops/steps';
import { addNext, addSibling } from '../ops/structure';
import { addText } from '../ops/text';
import { flowStore } from '../store/store';
import { notify } from '../ui/toast';
import { cursor } from './cursor';
import { requestFocus } from './focusKey';
import { nearestInDirection, type Dir } from './navigate';
import { reveal } from './reveal';
import { runSafely } from './safe';
import { viewCenter } from './viewport';

const FLAG_KEYS: Record<string, FlagKind> = { b: 'blocker', w: 'warning', q: 'question' };
const ARROWS: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function nextActor(actor: Actor | null): Actor | null {
  const i = actor ? ACTORS.indexOf(actor) : -1;
  return i === ACTORS.length - 1 ? null : ACTORS[i + 1];
}

export function useKeyboard(boardId: string, enabled: boolean): void {
  const rf = useReactFlow();

  useEffect(() => {
    if (!enabled) return;
    let pasteCount = 0;

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return;
      const st = flowStore.getState();
      if (st.activeBoardId !== boardId || st.editingId) return;
      const board = st.project.boards.find((b) => b.id === boardId);
      if (!board) return;
      const change = <R,>(fn: (b: Board) => R) => runSafely(() => st.changeBoard(fn, boardId));
      const focusNew = (id: string | undefined) => {
        if (!id) return;
        st.select([id]);
        st.setEditing(id);
        reveal([id]);
      };
      const sel = st.selection;
      const one = sel.length === 1 ? sel[0] : null;
      const oneStep = one && board.nodes.find((n) => n.id === one)?.kind === 'step' ? one : null;
      const steps = sel.filter((id) => board.nodes.find((n) => n.id === id)?.kind === 'step');
      const key = e.key.toLowerCase();

      if (e.ctrlKey || e.metaKey) {
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
          st.setClipboard(copySubgraph(board, sel));
          pasteCount = 0;
        } else if (key === 'v' && st.clipboard) {
          e.preventDefault();
          pasteCount += 1;
          const clip = st.clipboard;
          const ids = change((b) => pasteSubgraph(b, clip, 40 * pasteCount, 40 * pasteCount));
          if (ids) st.select(ids);
        } else if (key === 'd' && sel.length) {
          e.preventDefault();
          const ids = change((b) => pasteSubgraph(b, copySubgraph(b, sel), 40, 40));
          if (ids) st.select(ids);
        }
        return;
      }
      if (e.altKey) return;

      if (e.code === 'Digit1' && e.shiftKey) {
        e.preventDefault();
        rf.fitView({ padding: 0.2, duration: 300 });
        return;
      }
      const dir = ARROWS[e.key];
      if (dir) {
        if (one) {
          e.preventDefault();
          const next = nearestInDirection(board, one, dir);
          if (next) {
            st.select([next]);
            reveal([next]);
          }
        }
        return;
      }

      switch (e.key) {
        case 'Tab':
          e.preventDefault();
          if (oneStep) focusNew(change((b) => addNext(b, oneStep)));
          else if (sel.length === 0) {
            const c = viewCenter(rf);
            focusNew(change((b) => addStep(b, { x: c.x - 90, y: c.y - 36 })));
          }
          return;
        case 'Enter':
          if (oneStep) {
            e.preventDefault();
            focusNew(change((b) => addSibling(b, oneStep)));
          }
          return;
        case 'F2':
          if (one) {
            e.preventDefault();
            st.setEditing(one);
          }
          return;
        case 'Escape':
          st.select([]);
          return;
        case 'Delete':
        case 'Backspace':
          if (!sel.length && !st.edgeSelection.length) return;
          e.preventDefault();
          change((b) => {
            if (sel.length) deleteSteps(b, sel, { reconnect: e.shiftKey });
            const edges = st.edgeSelection.filter((id) => b.edges.some((x) => x.id === id));
            if (edges.length) deleteEdges(b, edges);
          });
          st.select([]);
          return;
      }

      if (e.key.length !== 1 || e.key === ' ') return;
      if (/^[1-9]$/.test(e.key)) {
        if (steps.length) {
          e.preventDefault();
          const shape = SHAPES[Number(e.key) - 1];
          change((b) => updateSteps(b, steps.map((id) => ({ id, shape }))));
        }
        return;
      }
      const flagTarget = one ?? (st.edgeSelection.length === 1 ? st.edgeSelection[0] : null);
      if (key === 'a' && steps.length) {
        const actor = nextActor(board.nodes.find((n) => n.id === steps[0])!.actor);
        change((b) => updateSteps(b, steps.map((id) => ({ id, actor }))));
      } else if (FLAG_KEYS[key] && flagTarget) {
        e.preventDefault();
        const id = change((b) => addFlag(b, flagTarget, FLAG_KEYS[key], ''));
        if (id) requestFocus(`flag:${id}`);
      } else if (key === 't') {
        e.preventDefault();
        const at = cursor.flow ?? viewCenter(rf);
        focusNew(change((b) => addText(b, { text: '', x: at.x, y: at.y })));
      } else if (key === 'c') {
        st.toggleCriticalPath();
      } else if (key === 'l') {
        tidyBoard(flowStore, boardId).catch((err: unknown) => notify(`Tidy failed: ${err instanceof Error ? err.message : String(err)}`));
      } else if (one) {
        e.preventDefault();
        st.setEditing(one, e.key);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rf, boardId, enabled]);
}
```

In `src/canvas/Canvas.tsx` add `import { useKeyboard } from './useKeyboard';` and, directly after the `const rf = useReactFlow<FlowNode, FlowEdgeType>();` line, add `useKeyboard(boardId, editable);`.

- [ ] **Step 6: Run and watch the tests pass**

Run: `npx playwright test tests/e2e/keyboard.spec.ts tests/e2e/interactions.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add keyboard-first editing, navigation and clipboard"
```

---

### Task 14: Top bar, boards, projects, palette, zoom, flags list, critical path, reference view

**Files:**
- Create: `src/ui/Popover.tsx`, `src/ui/TopBar.tsx`, `src/ui/ProjectMenu.tsx`, `src/ui/BoardTabs.tsx`, `src/ui/FlagsButton.tsx`, `src/ui/CriticalPathButton.tsx`, `src/ui/Palette.tsx`, `src/ui/ZoomBar.tsx`
- Modify: `src/ui/controls.tsx` (append `InlineRename`), `src/ui/CanvasArea.tsx` (full replacement), `src/canvas/LaneNode.tsx` (full replacement), `src/App.tsx`, `src/ui/ui.css` (append), `playwright.config.ts`
- Create: `tests/e2e/global-setup.ts`
- Test: `tests/e2e/workspace.spec.ts`

**Interfaces:**
- Consumes: `openProject` (Task 11), store board actions, `criticalPath`, `openFlags`, `tidyBoard`, `setDirection`, `renameBoard`, `renameLane`, `setLanes`, `groupSteps`, `addText`, `viewCenter`, `SHAPE_MIME`.
- Produces: `MenuButton({ label, title, className, children: (close) => ReactNode })`, `InlineRename({ value, label, onDone })`, `TopBar`, `Palette({ boardId })`, `ZoomBar`.

- [ ] **Step 1: Write the failing e2e tests**

`tests/e2e/workspace.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { addFlag } from '../../src/ops/flags';
import { setLanes } from '../../src/ops/lanes';
import { addStep } from '../../src/ops/steps';
import { branchParallel } from '../../src/ops/structure';
import { board, links, node, open, seed } from './fixtures';

test('boards: add and rename, reference view, delete and undo', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Old step' });
  });
  await open(page, p);
  await page.getByRole('button', { name: 'New board', exact: true }).click();
  await page.getByLabel('Board name').fill('Future v1');
  await page.getByLabel('Board name').press('Enter');
  await expect(page.locator('.board-tab.is-active')).toHaveText('Future v1');
  await expect(page.locator('.fs-canvas-main .react-flow__node-step')).toHaveCount(0);
  await page.getByRole('button', { name: 'Board 1', exact: true }).click({ modifiers: ['Shift'] });
  await expect(page.locator('.canvas-pane.is-reference .react-flow__node-step')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close reference' }).click();
  await expect(page.locator('.canvas-pane.is-reference')).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete Future v1' }).click({ force: true });
  await expect(page.locator('.board-tab')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.board-tab')).toHaveCount(2);
});

test('critical path shows the total and dims other steps', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const start = addStep(b, { title: 'Start', durationMin: 60 });
    const end = addStep(b, { title: 'End', after: start, durationMin: 60 });
    const [[fast], [slow]] = branchParallel(b, start, [[{ title: 'Fast' }], [{ title: 'Slow' }]], end);
    b.nodes.find((n) => n.id === fast)!.durationMin = 30;
    b.nodes.find((n) => n.id === slow)!.durationMin = 480;
  });
  await open(page, p);
  await page.getByRole('button', { name: /Critical path/ }).click();
  await expect(page.locator('.cp-total')).toHaveText('1d 2h');
  await expect(page.locator('.fs-step.is-dimmed')).toHaveCount(1);
  await expect(page.locator('.fs-step.is-critical')).toHaveCount(3);
});

test('flags list jumps to the flagged step', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A' });
    const c = addStep(b, { title: 'C', after: a });
    addFlag(b, a, 'warning', 'Check SLA');
    addFlag(b, c, 'question', 'Who owns this?');
  });
  await open(page, p);
  await page.getByRole('button', { name: 'Open flags' }).click();
  await expect(page.getByRole('menuitem')).toHaveCount(2);
  await page.getByRole('menuitem', { name: /Who owns this/ }).click();
  expect(await page.evaluate(() => window.__flowstate!.getState().selection)).toEqual(['s2']);
});

test('palette adds connected steps by click and free steps by drag', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Submit', x: 0, y: 0 });
  });
  await open(page, p);
  await node(page, 's1').click();
  await page.getByRole('button', { name: 'Decision' }).click();
  await page.keyboard.type('Approved?');
  await page.keyboard.press('Enter');
  expect(await links(page)).toEqual(['Submit>Approved?']);
  expect((await board(page)).nodes[1].shape).toBe('decision');
  await page.getByRole('button', { name: 'Database' }).dragTo(page.locator('.react-flow__pane'), { targetPosition: { x: 700, y: 500 } });
  await page.keyboard.type('CRM');
  await page.keyboard.press('Enter');
  expect((await board(page)).nodes.find((n) => n.title === 'CRM')?.shape).toBe('database');
});

test('lanes can be toggled and renamed inline', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'A' });
    setLanes(b, ['Customer']);
  });
  await open(page, p);
  await page.locator('.fs-lane-label', { hasText: 'Customer' }).dblclick();
  await page.getByLabel('Lane name').fill('Client');
  await page.getByLabel('Lane name').press('Enter');
  await expect(page.locator('.fs-lane-label', { hasText: 'Client' })).toBeVisible();
});

test('projects: create, persist across reload, and switch back', async ({ page, request }) => {
  const first = await seed(request, (b) => {
    addStep(b, { title: 'First project step' });
  }, 'First');
  await open(page, first);
  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByRole('menuitem', { name: 'New project' }).click();
  await expect(page).not.toHaveURL(new RegExp(first.id));
  await page.locator('.react-flow__pane').click({ position: { x: 300, y: 300 } });
  await page.keyboard.press('Tab');
  await page.keyboard.type('Persist me');
  await page.keyboard.press('Enter');
  await expect(page.locator('.save-status')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByText('Persist me')).toBeVisible();
  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByRole('menuitem', { name: 'First' }).click();
  await expect(page.getByText('First project step')).toBeVisible();
});

test('zoom bar, direction toggle and theme toggle', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'A' });
    addStep(b, { title: 'B', after: a });
  });
  await open(page, p);
  const pct = page.getByRole('button', { name: 'Reset zoom to 100%' });
  const before = await pct.textContent();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(pct).not.toHaveText(before!);
  await page.getByRole('button', { name: /Flow left to right/ }).click();
  await expect.poll(async () => (await board(page)).direction).toBe('TB');
  await expect.poll(async () => {
    const b = await board(page);
    return b.nodes[0].y < b.nodes[1].y;
  }).toBe(true);
  await page.getByRole('button', { name: /Theme/ }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
});
```

- [ ] **Step 2: Start every e2e run from an empty workspace, then watch the tests fail**

Project names repeat across runs, so the e2e workspace must be cleared per run. `tests/e2e/global-setup.ts`:
```ts
import { rm } from 'node:fs/promises';

export default async function globalSetup(): Promise<void> {
  await rm('.e2e-workspace', { recursive: true, force: true });
}
```

In `playwright.config.ts` add `globalSetup: './tests/e2e/global-setup.ts',` after `testDir`.

Run: `npx playwright test tests/e2e/workspace.spec.ts`
Expected: FAIL (no top bar, palette or zoom bar).

- [ ] **Step 3: Write the popover and inline rename controls**

`src/ui/Popover.tsx`:
```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function MenuButton({ label, title, className, children }: { label: ReactNode; title: string; className?: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className={`menu ${className ?? ''}`} ref={ref}>
      <button type="button" className={`topbar-btn ${open ? 'is-on' : ''}`} title={title} aria-label={title} aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
```

Append to `src/ui/controls.tsx`:
```tsx
export function InlineRename({ value, label, onDone }: { value: string; label: string; onDone: (name: string | null) => void }) {
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      className="fs-field inline-rename nodrag nopan"
      aria-label={label}
      defaultValue={value}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => finish(e.currentTarget.value.trim() || null)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(e.currentTarget.value.trim() || null);
        if (e.key === 'Escape') finish(null);
      }}
    />
  );
}
```

- [ ] **Step 4: Write the top bar pieces**

`src/ui/ProjectMenu.tsx`:
```tsx
import { ChevronDown, Plus, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listProjects, saveProject } from '../api/projects';
import { openProject } from '../boot';
import { createProject } from '../model/factory';
import type { Project, ProjectMeta } from '../model/types';
import { flowStore, useFlow } from '../store/store';
import { FieldInput } from './controls';
import { MenuButton } from './Popover';
import { notify } from './toast';

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function ProjectMenu() {
  const name = useFlow((s) => s.project.name);
  return (
    <MenuButton
      className="project-menu"
      title="Projects"
      label={
        <>
          <Workflow size={15} className="brand" />
          <span className="project-name">{name}</span>
          <ChevronDown size={13} />
        </>
      }
    >
      {(close) => <ProjectPanel close={close} />}
    </MenuButton>
  );
}

function ProjectPanel({ close }: { close: () => void }) {
  const project = useFlow((s) => s.project);
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  useEffect(() => {
    listProjects().then(setList, (err: unknown) => notify(errorText(err)));
  }, []);

  const switchTo = async (target: Project | string) => {
    close();
    try {
      await openProject(target);
    } catch (err) {
      notify(errorText(err));
    }
  };

  const create = async () => {
    const fresh = createProject();
    try {
      await saveProject(fresh);
      await switchTo(fresh);
    } catch (err) {
      notify(errorText(err));
    }
  };

  return (
    <div className="project-panel">
      <FieldInput
        label="Project name"
        width={240}
        value={project.name}
        onCommit={(name) => {
          if (!name) return;
          flowStore.getState().change((p) => {
            p.name = name;
          });
        }}
      />
      <div className="menu-section">Projects</div>
      {list === null ? (
        <div className="menu-empty">Loading</div>
      ) : (
        list.map((m) => (
          <button key={m.id} type="button" role="menuitem" className={`menu-item ${m.id === project.id ? 'is-current' : ''}`} onClick={() => m.id !== project.id && switchTo(m.id)}>
            {m.name}
          </button>
        ))
      )}
      <div className="menu-sep" />
      <button type="button" role="menuitem" className="menu-item" onClick={create}>
        <Plus size={13} /> New project
      </button>
    </div>
  );
}
```

`src/ui/BoardTabs.tsx`:
```tsx
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { runSafely } from '../canvas/safe';
import { renameBoard } from '../ops/board';
import { flowStore, useFlow } from '../store/store';
import { InlineRename } from './controls';
import { notify } from './toast';

export function BoardTabs() {
  const boards = useFlow((s) => s.project.boards);
  const active = useFlow((s) => s.activeBoardId);
  const split = useFlow((s) => s.splitBoardId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const st = flowStore.getState;

  return (
    <nav className="board-tabs" aria-label="Boards">
      {boards.map((b) => (
        <div key={b.id} className={`board-tab ${b.id === active ? 'is-active' : ''} ${b.id === split ? 'is-split' : ''}`}>
          {renaming === b.id ? (
            <InlineRename
              label="Board name"
              value={b.name}
              onDone={(name) => {
                setRenaming(null);
                if (name) st().changeBoard((x) => renameBoard(x, name), b.id);
              }}
            />
          ) : (
            <button
              type="button"
              className="board-tab-btn"
              title="Click to open. Shift+click to view beside. Double-click to rename."
              onClick={(e) => (e.shiftKey ? st().setSplitBoard(b.id === split ? null : b.id) : st().setActiveBoard(b.id))}
              onDoubleClick={() => setRenaming(b.id)}
            >
              {b.name}
            </button>
          )}
          {boards.length > 1 && (
            <button
              type="button"
              className="board-tab-close"
              aria-label={`Delete ${b.name}`}
              title="Delete board (Ctrl+Z to undo)"
              onClick={() => {
                runSafely(() => st().deleteBoard(b.id));
                if (!st().project.boards.some((x) => x.id === b.id)) notify(`Deleted "${b.name}". Ctrl+Z to undo.`);
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="board-tab-add"
        aria-label="New board"
        title="New board"
        onClick={() => {
          const id = st().addBoard(`Board ${boards.length + 1}`);
          setRenaming(id);
        }}
      >
        <Plus size={14} />
      </button>
    </nav>
  );
}
```

`src/ui/FlagsButton.tsx`:
```tsx
import { Flag } from 'lucide-react';
import { useMemo } from 'react';
import { FLAG_LABEL } from '../canvas/labels';
import { reveal } from '../canvas/reveal';
import type { Board } from '../model/types';
import { openFlags } from '../ops/flags';
import { flowStore, selectActiveBoard, useFlow } from '../store/store';
import { MenuButton } from './Popover';

function hostName(board: Board, id: string, kind: 'node' | 'edge'): string {
  const title = (nodeId: string) => board.nodes.find((n) => n.id === nodeId)?.title || nodeId;
  if (kind === 'node') return title(id);
  const e = board.edges.find((x) => x.id === id);
  return e ? `${title(e.source)} to ${title(e.target)}` : id;
}

function focusHost(board: Board, id: string, kind: 'node' | 'edge'): void {
  const st = flowStore.getState();
  if (kind === 'node') {
    st.select([id]);
    reveal([id]);
    return;
  }
  const e = board.edges.find((x) => x.id === id);
  st.select([], [id]);
  if (e) reveal([e.source]);
}

export function FlagsButton() {
  const board = useFlow(selectActiveBoard);
  const flags = useMemo(() => openFlags(board), [board]);
  return (
    <MenuButton
      title="Open flags"
      className={flags.length ? 'has-flags' : ''}
      label={
        <>
          <Flag size={14} />
          <span>{flags.length}</span>
        </>
      }
    >
      {(close) =>
        flags.length === 0 ? (
          <div className="menu-empty">No open flags</div>
        ) : (
          flags.map(({ flag, hostId, hostKind }) => (
            <button
              key={flag.id}
              type="button"
              role="menuitem"
              className="menu-item flag-item"
              onClick={() => {
                close();
                focusHost(board, hostId, hostKind);
              }}
            >
              <span className={`fs-flag-dot flag-${flag.kind}`} />
              <span className="flag-text">{flag.text || FLAG_LABEL[flag.kind]}</span>
              <span className="flag-host">{hostName(board, hostId, hostKind)}</span>
            </button>
          ))
        )
      }
    </MenuButton>
  );
}
```

`src/ui/CriticalPathButton.tsx`:
```tsx
import { Route } from 'lucide-react';
import { useMemo } from 'react';
import { criticalPath } from '../analysis/criticalPath';
import { formatDuration } from '../model/duration';
import { flowStore, selectActiveBoard, useFlow } from '../store/store';

export function CriticalPathButton() {
  const on = useFlow((s) => s.criticalPath);
  const board = useFlow(selectActiveBoard);
  const cp = useMemo(() => (on ? criticalPath(board) : null), [on, board]);
  const loops = cp?.ignoredEdgeIds.length ?? 0;
  return (
    <div className="cp-group">
      <button type="button" className={`topbar-btn ${on ? 'is-on' : ''}`} title="Critical path (C)" aria-pressed={on} onClick={() => flowStore.getState().toggleCriticalPath()}>
        <Route size={14} />
        <span>Critical path</span>
        {cp && <strong className="cp-total">{formatDuration(cp.totalMin)}</strong>}
      </button>
      {cp && cp.missingDuration.length > 0 && (
        <span className="cp-note" title="Steps on the path without a duration count as zero">
          {cp.missingDuration.length} without duration
        </span>
      )}
      {loops > 0 && (
        <span className="cp-note" title="Arrows that loop back are ignored for the calculation">
          {loops} {loops === 1 ? 'loop' : 'loops'} ignored
        </span>
      )}
    </div>
  );
}
```

`src/ui/TopBar.tsx`:
```tsx
import { ArrowDownUp, ArrowRightLeft, Monitor, Moon, Sun, WandSparkles } from 'lucide-react';
import { useState } from 'react';
import { tidyBoard } from '../layout/tidyBoard';
import { setDirection } from '../ops/board';
import { flowStore, selectActiveBoard, useFlow } from '../store/store';
import { BoardTabs } from './BoardTabs';
import { CriticalPathButton } from './CriticalPathButton';
import { FlagsButton } from './FlagsButton';
import { errorText, ProjectMenu } from './ProjectMenu';
import { applyTheme, storedTheme, type ThemeChoice } from './theme';
import { notify } from './toast';

const THEME_NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const SAVE_TEXT = { idle: '', saving: 'Saving', saved: 'Saved', error: 'Save failed, retrying' } as const;

async function runTidy(boardId: string): Promise<void> {
  try {
    await tidyBoard(flowStore, boardId);
  } catch (err) {
    notify(`Tidy failed: ${errorText(err)}`);
  }
}

async function flipDirection(boardId: string): Promise<void> {
  const st = flowStore.getState();
  st.begin();
  try {
    st.changeBoard((b) => setDirection(b, b.direction === 'LR' ? 'TB' : 'LR'), boardId);
    await runTidy(boardId);
  } finally {
    st.commit();
  }
}

export function TopBar() {
  const board = useFlow(selectActiveBoard);
  const saveStatus = useFlow((s) => s.saveStatus);
  const [theme, setTheme] = useState(storedTheme);
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const lr = board.direction === 'LR';
  return (
    <header className="topbar">
      <ProjectMenu />
      <BoardTabs />
      <div className="topbar-spacer" />
      <FlagsButton />
      <CriticalPathButton />
      <button type="button" className="topbar-btn" title="Tidy layout (L)" onClick={() => runTidy(board.id)}>
        <WandSparkles size={14} />
        <span>Tidy</span>
      </button>
      <button
        type="button"
        className="topbar-btn icon"
        aria-label={lr ? 'Flow left to right. Switch to top to bottom.' : 'Flow top to bottom. Switch to left to right.'}
        title={lr ? 'Flow left to right. Click for top to bottom.' : 'Flow top to bottom. Click for left to right.'}
        onClick={() => flipDirection(board.id)}
      >
        {lr ? <ArrowRightLeft size={14} /> : <ArrowDownUp size={14} />}
      </button>
      <span className={`save-status is-${saveStatus}`} aria-live="polite">
        {SAVE_TEXT[saveStatus]}
      </span>
      <button
        type="button"
        className="topbar-btn icon"
        aria-label={`Theme: ${theme}`}
        title={`Theme: ${theme}`}
        onClick={() => {
          const next = THEME_NEXT[theme];
          applyTheme(next);
          setTheme(next);
        }}
      >
        <ThemeIcon size={14} />
      </button>
    </header>
  );
}
```

- [ ] **Step 5: Write the palette, zoom bar, split view and lane rename**

`src/ui/Palette.tsx`:
```tsx
import { useReactFlow } from '@xyflow/react';
import { Rows3, SquareDashed, Type } from 'lucide-react';
import { SHAPE_MIME } from '../canvas/Canvas';
import { SHAPE_LABEL } from '../canvas/labels';
import { reveal } from '../canvas/reveal';
import { runSafely } from '../canvas/safe';
import { ShapeIcon } from '../canvas/ShapeSvg';
import { viewCenter } from '../canvas/viewport';
import { SHAPE_SIZE } from '../model/factory';
import { SHAPES, type Board, type Shape } from '../model/types';
import { groupSteps } from '../ops/groups';
import { setLanes } from '../ops/lanes';
import { addStep } from '../ops/steps';
import { addText } from '../ops/text';
import { flowStore } from '../store/store';

export function Palette({ boardId }: { boardId: string }) {
  const rf = useReactFlow();
  const change = <R,>(fn: (b: Board) => R) => runSafely(() => flowStore.getState().changeBoard(fn, boardId));
  const edit = (id: string | undefined) => {
    if (!id) return;
    const st = flowStore.getState();
    st.select([id]);
    st.setEditing(id);
    reveal([id]);
  };

  const place = (shape: Shape) => {
    const st = flowStore.getState();
    const one = st.selection.length === 1 ? st.selection[0] : null;
    edit(
      change((b) => {
        const anchor = b.nodes.find((n) => n.id === one && n.kind === 'step');
        if (anchor) return addStep(b, { shape, after: anchor.id, actor: anchor.actor });
        const c = viewCenter(rf);
        const size = SHAPE_SIZE[shape];
        return addStep(b, { shape, x: c.x - size.w / 2, y: c.y - size.h / 2 });
      }),
    );
  };

  const addNote = () => {
    const c = viewCenter(rf);
    edit(change((b) => addText(b, { text: '', x: c.x - 110, y: c.y - 22 })));
  };

  const groupSelection = () => {
    const ids = flowStore.getState().selection;
    edit(change((b) => groupSteps(b, ids.filter((id) => b.nodes.find((n) => n.id === id)?.kind !== 'group'), 'Group')));
  };

  const toggleLanes = () => change((b) => setLanes(b, b.lanes.length ? [] : ['Lane 1', 'Lane 2']));

  return (
    <aside className="palette" aria-label="Shapes">
      {SHAPES.map((shape, i) => (
        <button
          key={shape}
          type="button"
          className="palette-btn"
          aria-label={SHAPE_LABEL[shape]}
          title={`${SHAPE_LABEL[shape]} (${i + 1}). Click to add after the selection, or drag onto the board.`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(SHAPE_MIME, shape);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={() => place(shape)}
        >
          <ShapeIcon shape={shape} />
        </button>
      ))}
      <div className="palette-sep" />
      <button type="button" className="palette-btn" aria-label="Free text" title="Free text (T)" onClick={addNote}>
        <Type size={16} />
      </button>
      <button type="button" className="palette-btn" aria-label="Group selection" title="Group the selected steps" onClick={groupSelection}>
        <SquareDashed size={16} />
      </button>
      <button type="button" className="palette-btn" aria-label="Toggle swimlanes" title="Toggle swimlanes" onClick={toggleLanes}>
        <Rows3 size={16} />
      </button>
    </aside>
  );
}
```

`src/ui/ZoomBar.tsx`:
```tsx
import { useReactFlow, useViewport } from '@xyflow/react';
import { Maximize, Minus, Plus } from 'lucide-react';

export function ZoomBar() {
  const rf = useReactFlow();
  const { zoom } = useViewport();
  return (
    <div className="zoombar">
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => rf.zoomOut({ duration: 150 })}>
        <Minus size={14} />
      </button>
      <button type="button" className="zoom-pct" aria-label="Reset zoom to 100%" title="Reset zoom to 100%" onClick={() => rf.zoomTo(1, { duration: 150 })}>
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => rf.zoomIn({ duration: 150 })}>
        <Plus size={14} />
      </button>
      <button type="button" aria-label="Fit board" title="Fit board (Shift+1)" onClick={() => rf.fitView({ padding: 0.2, duration: 300 })}>
        <Maximize size={14} />
      </button>
    </div>
  );
}
```

`src/ui/CanvasArea.tsx`:
```tsx
import { ReactFlowProvider } from '@xyflow/react';
import { Eye, X } from 'lucide-react';
import { Canvas } from '../canvas/Canvas';
import { flowStore, useFlow } from '../store/store';
import { Palette } from './Palette';
import { ZoomBar } from './ZoomBar';

export function CanvasArea() {
  const active = useFlow((s) => s.activeBoardId);
  const split = useFlow((s) => s.splitBoardId);
  const splitName = useFlow((s) => s.project.boards.find((b) => b.id === s.splitBoardId)?.name);
  return (
    <div className="canvas-area">
      <div className="canvas-pane fs-canvas-main">
        <ReactFlowProvider key={active}>
          <Canvas boardId={active} editable />
          <Palette boardId={active} />
          <ZoomBar />
        </ReactFlowProvider>
      </div>
      {split && (
        <div className="canvas-pane is-reference">
          <div className="reference-title">
            <Eye size={13} /> {splitName} <span>reference</span>
            <button type="button" aria-label="Close reference" title="Close reference" onClick={() => flowStore.getState().setSplitBoard(null)}>
              <X size={13} />
            </button>
          </div>
          <ReactFlowProvider key={split}>
            <Canvas boardId={split} editable={false} />
          </ReactFlowProvider>
        </div>
      )}
    </div>
  );
}
```

`src/canvas/LaneNode.tsx`:
```tsx
import type { NodeProps } from '@xyflow/react';
import { memo, useState } from 'react';
import { renameLane } from '../ops/lanes';
import { flowStore } from '../store/store';
import { InlineRename } from '../ui/controls';
import { runSafely } from './safe';
import type { LaneFlowNode } from './toFlow';

export const LaneNode = memo(function LaneNode({ data }: NodeProps<LaneFlowNode>) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div className={`fs-lane ${data.alt ? 'alt' : ''} dir-${data.direction}`}>
      {renaming ? (
        <span className="fs-lane-label">
          <InlineRename
            label="Lane name"
            value={data.lane.name}
            onDone={(name) => {
              setRenaming(false);
              if (name) runSafely(() => flowStore.getState().changeBoard((b) => renameLane(b, data.lane.id, name)));
            }}
          />
        </span>
      ) : (
        <span className="fs-lane-label" title={data.editable ? 'Double-click to rename' : undefined} onDoubleClick={() => data.editable && setRenaming(true)}>
          {data.lane.name}
        </span>
      )}
    </div>
  );
});
```

In `src/App.tsx` add `import { TopBar } from './ui/TopBar';` and render `<TopBar />` as the first child of `<main className="workspace">`.

Append to `src/ui/ui.css`:
```css
.topbar {
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.topbar-spacer {
  flex: 1;
}
.topbar-btn {
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  font-size: 12.5px;
  white-space: nowrap;
}
.topbar-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}
.topbar-btn.is-on {
  background: var(--accent-soft);
  color: var(--accent);
}
.topbar-btn.icon {
  width: 30px;
  padding: 0;
  justify-content: center;
}
.project-menu .topbar-btn {
  font-weight: 600;
  color: var(--text);
}
.project-name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.brand {
  color: var(--accent);
}
.menu {
  position: relative;
}
.menu-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 240px;
  max-height: 60vh;
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-md);
  padding: 6px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.project-menu .menu-panel {
  right: auto;
  left: 0;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 7px 8px;
  border: 0;
  background: transparent;
  border-radius: 7px;
  cursor: pointer;
  color: var(--text);
  font-size: 12.5px;
  box-sizing: border-box;
}
.menu-item:hover {
  background: var(--surface-2);
}
.menu-item.is-current {
  color: var(--accent);
  font-weight: 600;
}
.menu-section {
  font-size: 11px;
  font-weight: 650;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 8px 8px 4px;
}
.menu-sep {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}
.menu-empty {
  padding: 10px 8px;
  color: var(--text-3);
}
.flag-item .flag-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.flag-item .flag-host {
  color: var(--text-3);
  font-size: 11.5px;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.has-flags > .topbar-btn {
  color: var(--blocker);
}
.board-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 8px;
  overflow-x: auto;
  min-width: 0;
}
.board-tab {
  display: flex;
  align-items: center;
  border-radius: 8px;
}
.board-tab-btn {
  height: 28px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  color: var(--text-2);
  cursor: pointer;
  white-space: nowrap;
  font-size: 12.5px;
}
.board-tab.is-active .board-tab-btn {
  background: var(--surface-3);
  color: var(--text);
  font-weight: 600;
}
.board-tab.is-split .board-tab-btn {
  box-shadow: inset 0 -2px 0 var(--accent);
}
.board-tab-close {
  width: 18px;
  height: 18px;
  margin-left: -4px;
  border: 0;
  background: transparent;
  border-radius: 5px;
  color: var(--text-3);
  display: grid;
  place-items: center;
  cursor: pointer;
  opacity: 0;
}
.board-tab:hover .board-tab-close {
  opacity: 1;
}
.board-tab-close:hover {
  background: var(--surface-3);
  color: var(--text);
}
.board-tab-add {
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  color: var(--text-3);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.board-tab-add:hover {
  background: var(--surface-2);
  color: var(--text);
}
.inline-rename {
  width: 140px;
}
.cp-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cp-total {
  color: var(--critical);
  font-weight: 650;
}
.cp-note {
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
}
.save-status {
  font-size: 11.5px;
  color: var(--text-3);
  min-width: 72px;
  text-align: right;
  padding: 0 6px;
}
.save-status.is-error {
  color: var(--blocker);
}
.palette {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-md);
}
.palette-btn {
  width: 34px;
  height: 30px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  color: var(--text-2);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.palette-btn:hover {
  background: var(--surface-2);
  color: var(--accent);
}
.palette-sep {
  height: 1px;
  background: var(--border);
  margin: 3px 4px;
}
.zoombar {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
}
.zoombar button {
  height: 26px;
  min-width: 26px;
  border: 0;
  background: transparent;
  border-radius: 7px;
  color: var(--text-2);
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 11.5px;
}
.zoombar button:hover {
  background: var(--surface-2);
  color: var(--text);
}
.zoom-pct {
  width: 46px;
}
.reference-title {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  box-shadow: var(--shadow-sm);
  font-size: 12px;
  font-weight: 600;
}
.reference-title span {
  color: var(--text-3);
  font-weight: 450;
}
.reference-title button {
  width: 20px;
  height: 20px;
  border: 0;
  background: transparent;
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--text-3);
}
```

- [ ] **Step 6: Run and watch the tests pass**

Run: `npx playwright test tests/e2e/workspace.spec.ts` then the full `npx playwright test`
Expected: PASS. HTML5 drag from the palette relies on Playwright's `dragTo` dispatching drag events; if it does not fire `drop` in this Playwright version, dispatch `dragstart`/`dragover`/`drop` with a shared `DataTransfer` via `page.evaluate` in the test rather than changing the app.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add top bar, boards, projects, palette, zoom, flags list and reference view"
```

---

### Task 15: Export and import

**Files:**
- Create: `src/io/download.ts`, `src/io/exportImage.ts`, `src/io/exportJson.ts`, `src/ui/ExportMenu.tsx`
- Modify: `src/ui/TopBar.tsx`, `src/ui/ProjectMenu.tsx`
- Test: `src/io/exportJson.test.ts`, `tests/e2e/export.spec.ts`

**Interfaces:**
- Produces: `download(url, fileName)`, `slug(text)`, `exportBounds(board, selection): Rect | null`, `exportBoardImage(kind: 'png' | 'svg'): Promise<void>`, `exportProjectJson(project)`, `readProjectFile(file: File): Promise<Project>` (fresh id, name suffixed " (imported)").

- [ ] **Step 1: Write the failing unit test**

`src/io/exportJson.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { ProjectFormatError } from '../model/migrate';
import { slug } from './download';
import { readProjectFile } from './exportJson';

describe('readProjectFile', () => {
  it('imports a project under a new id and name', async () => {
    const p = createProject('Claims');
    const imported = await readProjectFile(new File([JSON.stringify(p)], 'claims.json'));
    expect(imported.id).not.toBe(p.id);
    expect(imported.name).toBe('Claims (imported)');
    expect(imported.boards).toEqual(p.boards);
  });

  it('rejects non-JSON and non-projects', async () => {
    await expect(readProjectFile(new File(['nope'], 'x.json'))).rejects.toThrow(ProjectFormatError);
    await expect(readProjectFile(new File(['{"a":1}'], 'x.json'))).rejects.toThrow(ProjectFormatError);
  });
});

describe('slug', () => {
  it('makes file-safe names', () => {
    expect(slug('Claims: Future v1!')).toBe('claims-future-v1');
    expect(slug('***')).toBe('flowstate');
  });
});
```

Run: `npx vitest run src/io` and expect FAIL (missing modules).

- [ ] **Step 2: Implement**

`src/io/download.ts`:
```ts
export function download(url: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flowstate';
}
```

`src/io/exportJson.ts`:
```ts
import { newId } from '../model/factory';
import { migrateProject, ProjectFormatError } from '../model/migrate';
import type { Project } from '../model/types';
import { download, slug } from './download';

export function exportProjectJson(project: Project): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
  download(url, `${slug(project.name)}.flowstate.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readProjectFile(file: File): Promise<Project> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new ProjectFormatError('That file is not valid JSON.');
  }
  const project = migrateProject(raw);
  return { ...project, id: newId(), name: `${project.name} (imported)` };
}
```

`src/io/exportImage.ts`:
```ts
import { toPng, toSvg } from 'html-to-image';
import { boundsOf, type Rect } from '../layout/place';
import type { Board } from '../model/types';
import { flowStore } from '../store/store';
import { download, slug } from './download';

const PADDING = 48;
const MAX_SIDE = 8000;
const HIDDEN = ['fs-toolbar', 'fs-add', 'fs-handle', 'react-flow__resize-control'];

function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let n = 0;
    const tick = () => (++n >= count ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
}

export function exportBounds(board: Board, selection: string[]): Rect | null {
  const picked = selection.length ? board.nodes.filter((n) => selection.includes(n.id)) : board.nodes;
  return boundsOf(picked);
}

export async function exportBoardImage(kind: 'png' | 'svg'): Promise<void> {
  const st = flowStore.getState();
  const board = st.project.boards.find((b) => b.id === st.activeBoardId)!;
  const bounds = exportBounds(board, st.selection);
  if (!bounds) throw new Error('The board is empty.');
  st.setExporting(true);
  try {
    await nextFrames(3);
    const el = document.querySelector<HTMLElement>('.fs-canvas-main .react-flow__viewport');
    if (!el) throw new Error('Canvas not found.');
    const fullW = bounds.w + PADDING * 2;
    const fullH = bounds.h + PADDING * 2;
    const scale = Math.min(1, MAX_SIDE / Math.max(fullW, fullH));
    const width = Math.ceil(fullW * scale);
    const height = Math.ceil(fullH * scale);
    const options = {
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),
      width,
      height,
      style: { width: `${width}px`, height: `${height}px`, transform: `translate(${(PADDING - bounds.x) * scale}px, ${(PADDING - bounds.y) * scale}px) scale(${scale})` },
      filter: (node: HTMLElement) => !(node.classList && HIDDEN.some((c) => node.classList.contains(c))),
    };
    const url = kind === 'png' ? await toPng(el, { ...options, pixelRatio: scale < 1 ? 1 : 2 }) : await toSvg(el, options);
    download(url, `${slug(st.project.name)}-${slug(board.name)}.${kind}`);
  } finally {
    st.setExporting(false);
  }
}
```

`src/ui/ExportMenu.tsx`:
```tsx
import { Download } from 'lucide-react';
import { exportBoardImage } from '../io/exportImage';
import { exportProjectJson } from '../io/exportJson';
import { flowStore } from '../store/store';
import { MenuButton } from './Popover';
import { errorText } from './ProjectMenu';
import { notify } from './toast';

const attempt = (fn: () => Promise<void> | void) => {
  Promise.resolve()
    .then(fn)
    .catch((err: unknown) => notify(`Export failed: ${errorText(err)}`));
};

export function ExportMenu() {
  return (
    <MenuButton title="Export" label={<Download size={14} />}>
      {(close) => (
        <>
          <button type="button" role="menuitem" className="menu-item" onClick={() => (close(), attempt(() => exportBoardImage('png')))}>
            PNG image
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => (close(), attempt(() => exportBoardImage('svg')))}>
            SVG image
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => (close(), attempt(() => exportProjectJson(flowStore.getState().project)))}>
            Project JSON
          </button>
        </>
      )}
    </MenuButton>
  );
}
```

In `src/ui/TopBar.tsx` add `import { ExportMenu } from './ExportMenu';` and render `<ExportMenu />` directly before the save-status `<span>`.

In `src/ui/ProjectMenu.tsx` add `Upload` to the lucide import, add `import { readProjectFile } from '../io/exportJson';`, and insert after the "New project" button:
```tsx
      <label role="menuitem" className="menu-item">
        <Upload size={13} /> Import JSON
        <input
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="import-input"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const imported = await readProjectFile(file);
              await saveProject(imported);
              await switchTo(imported);
            } catch (err) {
              notify(errorText(err));
            }
          }}
        />
      </label>
```

- [ ] **Step 3: Write the e2e test**

`tests/e2e/export.spec.ts`:
```ts
import { readFile, stat } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { addStep } from '../../src/ops/steps';
import { open, seed } from './fixtures';

test('exports PNG, SVG and JSON, and imports the JSON back', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'Export me', x: 0, y: 0 });
    addStep(b, { title: 'Second', after: a });
  }, 'Exporter');
  await open(page, p);
  const menu = page.getByRole('button', { name: 'Export' });

  await menu.click();
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'PNG image' }).click()]);
  expect(png.suggestedFilename()).toBe('exporter-board-1.png');
  const bytes = await readFile((await png.path())!);
  expect(bytes.readUInt32BE(16)).toBe((432 + 96) * 2);
  expect(bytes.readUInt32BE(20)).toBe((72 + 96) * 2);

  await menu.click();
  const [svg] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'SVG image' }).click()]);
  expect((await stat((await svg.path())!)).size).toBeGreaterThan(1000);

  await menu.click();
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Project JSON' }).click()]);
  const jsonPath = (await json.path())!;
  expect(JSON.parse(await readFile(jsonPath, 'utf8')).id).toBe(p.id);

  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByTestId('import-input').setInputFiles(jsonPath);
  await expect(page.locator('.project-name')).toHaveText('Exporter (imported)');
  await expect(page).not.toHaveURL(new RegExp(p.id));
  await expect(page.getByText('Export me')).toBeVisible();
});

test('exports steps that are off screen', async ({ page, request }) => {
  const p = await seed(request, (b) => {
    addStep(b, { title: 'Near', x: 0, y: 0 });
    addStep(b, { title: 'Far', x: 6000, y: 3000 });
  }, 'Wide');
  await open(page, p);
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
  await page.getByRole('button', { name: 'Export' }).click();
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'PNG image' }).click()]);
  const bytes = await readFile((await png.path())!);
  expect(bytes.readUInt32BE(16)).toBe((6180 + 96) * 2);
});
```

- [ ] **Step 4: Run and watch everything pass**

Run: `npx vitest run src/io` then `npx playwright test tests/e2e/export.spec.ts`
Expected: PASS. Open one exported PNG to confirm arrows and labels are present.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add PNG, SVG and JSON export and JSON import"
```

---

### Task 16: AI tool schemas, system prompt and executor

The AI edits the board only through these tools, and every tool maps onto the same ops the UI uses. Each tool call is atomic: if any part fails, nothing from that call is applied.

**Files:**
- Create: `src/ai/schemas.ts`, `src/ai/toolDefs.ts`, `src/ai/systemPrompt.ts`, `src/ai/stats.ts`, `src/ai/executor.ts`, `src/ai/storeContext.ts`
- Test: `src/ai/executor.test.ts`, `src/ai/stats.test.ts`, `src/ai/toolDefs.test.ts`

**Interfaces:**
- Consumes: all ops, `summarizeBoard`, `parseDuration`, `DurationError`, store (`createFlowStore`), `computeTidy`, `applyTidy`.
- Produces:
  - `TOOL_SCHEMAS` (zod objects keyed by tool name), `type ToolName`, `StepInput`.
  - `TOOL_DEFS: Anthropic.Tool[]` (server use), `SYSTEM_PROMPT: string`.
  - `type StatKey`, `type Stats = Partial<Record<StatKey, number>>`, `mergeStats(a, b): Stats`, `describeStats(stats): string`.
  - `interface ToolContext { getProject(): Project; activeBoardId(): string; changeBoard<R>(boardId: string, fn: (b: Board) => R): R; createBoard(name: string, activate: boolean): string; tidy(boardId: string): Promise<void> }`.
  - `interface ToolOutcome { ok: boolean; content: string; touched: string[]; stats: Stats }`, `executeTool(ctx, name: string, input: unknown): Promise<ToolOutcome>`.
  - `storeToolContext(store, tidy): ToolContext`.

- [ ] **Step 1: Write the failing tests**

`src/ai/stats.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { describeStats, mergeStats } from './stats';

describe('stats', () => {
  it('merges and describes', () => {
    const s = mergeStats({ stepsAdded: 1, arrowsAdded: 1 }, { stepsAdded: 2, flagsAdded: 1 });
    expect(s).toEqual({ stepsAdded: 3, arrowsAdded: 1, flagsAdded: 1 });
    expect(describeStats(s)).toBe('3 steps added, 1 arrow added, 1 flag');
    expect(describeStats({ boardsCreated: 1, tidied: 1 })).toBe('New board, tidied');
    expect(describeStats({})).toBe('');
  });
});
```

`src/ai/toolDefs.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { TOOL_SCHEMAS } from './schemas';
import { SYSTEM_PROMPT } from './systemPrompt';
import { TOOL_DEFS } from './toolDefs';

describe('tool definitions', () => {
  it('defines one object schema per tool with a description', () => {
    expect(TOOL_DEFS.map((t) => t.name).sort()).toEqual(Object.keys(TOOL_SCHEMAS).sort());
    for (const tool of TOOL_DEFS) {
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema).not.toHaveProperty('$schema');
      expect(tool.description!.length).toBeGreaterThan(20);
    }
  });

  it('keeps the prompt free of em dashes', () => {
    const text = SYSTEM_PROMPT + TOOL_DEFS.map((t) => t.description).join('');
    expect(text).not.toContain('\u2014');
  });
});
```

`src/ai/executor.test.ts`:
```ts
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { criticalPath } from '../analysis/criticalPath';
import { overlaps } from '../layout/place';
import { computeTidy } from '../layout/tidy';
import { applyTidy } from '../ops/board';
import { addStep } from '../ops/steps';
import { createFlowStore } from '../store/store';
import type { Board } from '../model/types';
import { executeTool } from './executor';
import { storeToolContext } from './storeContext';

const elk = new ELK();

function setup(build?: (b: Board) => void) {
  const store = createFlowStore();
  if (build) store.getState().changeBoard(build);
  const ctx = storeToolContext(store, async (id) => {
    const board = store.getState().project.boards.find((b) => b.id === id)!;
    const result = await computeTidy(elk, board);
    store.getState().changeBoard((b) => applyTidy(b, result), id);
  });
  const active = () => store.getState().project.boards.find((b) => b.id === store.getState().activeBoardId)!;
  const links = (b: Board = active()) => {
    const t = (id: string) => b.nodes.find((n) => n.id === id)!.title;
    return b.edges.map((e) => `${t(e.source)}>${t(e.target)}`).sort();
  };
  return { store, ctx, active, links, run: (name: string, input: unknown) => executeTool(ctx, name, input) };
}

describe('executeTool', () => {
  it('adds a chained sequence in one call using refs', async () => {
    const { run, active, links } = setup();
    const out = await run('add_steps', {
      steps: [
        { ref: 'a', title: 'Intake', actor: 'agent', duration: '30m' },
        { ref: 'b', title: 'Review', after: 'a' },
        { title: 'Approve', after: 'b', edge_label: 'ok' },
      ],
    });
    expect(out.ok).toBe(true);
    expect(JSON.parse(out.content)).toEqual({
      created: [
        { ref: 'a', id: 's1', title: 'Intake' },
        { ref: 'b', id: 's2', title: 'Review' },
        { id: 's4', title: 'Approve' },
      ],
    });
    expect(out.stats).toEqual({ stepsAdded: 3, arrowsAdded: 2 });
    expect(out.touched).toEqual(['s1', 's2', 's4']);
    expect(links()).toEqual(['Intake>Review', 'Review>Approve']);
    expect(active().nodes[0]).toMatchObject({ actor: 'agent', durationMin: 30 });
  });

  it('replays an insert-between request', async () => {
    const { run, links } = setup((b) => {
      const a = addStep(b, { title: 'Intake' });
      addStep(b, { title: 'Approve', after: a });
    });
    const out = await run('insert_between', { from: 's1', to: 's2', step: { title: 'Review', actor: 'agent' } });
    expect(out).toMatchObject({ ok: true, stats: { stepsAdded: 1, arrowsAdded: 1 } });
    expect(links()).toEqual(['Intake>Review', 'Review>Approve']);
  });

  it('replays a split-into-parallel request with existing steps', async () => {
    const { run, links } = setup((b) => {
      let prev = addStep(b, { title: 'Kickoff' });
      for (const t of ['Research', 'Plan', 'Decision']) prev = addStep(b, { title: t, after: prev });
    });
    const out = await run('branch_parallel', { from: 's1', branches: [[{ existing: 's2' }], [{ existing: 's4' }]], join_at: 's6' });
    expect(out).toMatchObject({ ok: true, stats: { moved: 2 } });
    expect(links()).toEqual(['Kickoff>Plan', 'Kickoff>Research', 'Plan>Decision', 'Research>Decision']);
  });

  it('replays a full draft of a future-state board', async () => {
    const { run, store, active, links } = setup((b) => {
      addStep(b, { title: 'Old manual step' });
    });
    const script: Array<[string, unknown]> = [
      ['create_board', { name: 'Future v1' }],
      ['set_lanes', { lanes: ['Customer', 'Intake Agent', 'Claims Team'] }],
      [
        'add_steps',
        {
          steps: [
            { ref: 'a', title: 'Submit claim', shape: 'terminal', actor: 'person', lane: 'Customer' },
            { ref: 'b', title: 'Extract documents', actor: 'agent', owner: 'Intake Agent', duration: '5m', after: 'a', lane: 'Intake Agent' },
            { ref: 'c', title: 'Validate policy', actor: 'agent', owner: 'Intake Agent', duration: '2m', after: 'b', lane: 'Intake Agent' },
            { ref: 'd', title: 'Approve payout', shape: 'decision', actor: 'person', duration: '1h', after: 'c', lane: 'claims team' },
          ],
        },
      ],
      ['branch_parallel', { from: 's5', branches: [[{ title: 'Fraud check', actor: 'agent', duration: '10m' }]], join_at: 's9' }],
      ['add_flag', { target: 's9', kind: 'question', text: 'Payout threshold?' }],
      ['tidy', {}],
    ];
    for (const [name, input] of script) {
      const out = await run(name, input);
      expect(out.ok, `${name}: ${out.content}`).toBe(true);
    }
    const future = active();
    expect(future.name).toBe('Future v1');
    expect(store.getState().project.boards[0].nodes.map((n) => n.title)).toEqual(['Old manual step']);
    expect(links()).toEqual([
      'Extract documents>Fraud check',
      'Extract documents>Validate policy',
      'Fraud check>Approve payout',
      'Submit claim>Extract documents',
      'Validate policy>Approve payout',
    ]);
    expect(future.nodes.find((n) => n.id === 's5')!.laneId).toBe('l2');
    expect(criticalPath(future).totalMin).toBe(75);
    const steps = future.nodes.filter((n) => n.kind === 'step');
    for (const a of steps) for (const b of steps) if (a !== b) expect(overlaps(a, b, 0)).toBe(false);
  });

  it('reports unknown steps with the valid ids and leaves the board untouched', async () => {
    const { run, store } = setup((b) => {
      addStep(b, { title: 'A' });
    });
    const before = store.getState().project;
    const out = await run('update_steps', { updates: [{ id: 's99', title: 'X' }] });
    expect(out.ok).toBe(false);
    expect(out.content).toContain('Unknown step "s99".');
    expect(out.content).toContain('Steps on this board: s1 "A"');
    expect(store.getState().project).toBe(before);
  });

  it('is atomic: a bad duration in one step adds nothing', async () => {
    const { run, active } = setup();
    const out = await run('add_steps', { steps: [{ title: 'Fine' }, { title: 'Bad', duration: 'soon' }] });
    expect(out.ok).toBe(false);
    expect(out.content).toContain('Cannot read duration');
    expect(active().nodes).toEqual([]);
  });

  it('rejects invalid input, unknown tools, unknown lanes and unknown boards', async () => {
    const { run } = setup();
    expect((await run('add_steps', {})).content).toMatch(/^Invalid input/);
    expect((await run('explode', {})).content).toBe('Unknown tool "explode".');
    expect((await run('add_steps', { steps: [{ title: 'A', lane: 'Nope' }] })).content).toContain('Unknown lane "Nope"');
    expect((await run('add_steps', { board: 'Mars', steps: [{ title: 'A' }] })).content).toContain('Unknown board "Mars"');
  });

  it('reads another board by name', async () => {
    const { run } = setup((b) => {
      addStep(b, { title: 'Legacy step' });
    });
    await run('create_board', { name: 'Future' });
    const out = await run('read_board', { board: 'board 1' });
    expect(out.ok).toBe(true);
    expect(out.content).toContain('"Legacy step"');
  });

  it('updates and clears nullable fields', async () => {
    const { run, active } = setup((b) => {
      addStep(b, { title: 'A', durationMin: 60, actor: 'person' });
    });
    await run('update_steps', { updates: [{ id: 's1', duration: null, actor: null, owner: 'Ops' }] });
    expect(active().nodes[0]).toMatchObject({ durationMin: null, actor: null, owner: 'Ops' });
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/ai`
Expected: FAIL, missing modules.

- [ ] **Step 3: Implement schemas, definitions, prompt and stats**

`src/ai/schemas.ts`:
```ts
import { z } from 'zod';
import { ACTORS, EDGE_TYPES, FLAG_KINDS, SHAPES, STATUSES } from '../model/types';

const board = z.string().optional().describe('Board name or id. Defaults to the board the user is looking at.');
const id = z.string().describe('Id from the board summary, like s12.');

export const StepInput = z.object({
  title: z.string().min(1).describe('Short title, ideally 2 to 6 words.'),
  shape: z.enum(SHAPES).optional().describe('Defaults to process.'),
  actor: z.enum(ACTORS).optional().describe('person, system, or agent (an AI agent).'),
  owner: z.string().optional().describe('Person, team, system or agent name.'),
  duration: z.string().optional().describe('Working time like 30m, 2h, 1.5d or 1w. 1d = 8h.'),
  note: z.string().optional(),
  status: z.enum(STATUSES).optional(),
  lane: z.string().optional().describe('Lane id or name.'),
  replaces: z.string().optional().describe('Old-process steps this replaces, as free text.'),
});
export type StepInputValue = z.infer<typeof StepInput>;

export const TOOL_SCHEMAS = {
  add_steps: z.object({
    board,
    steps: z
      .array(
        StepInput.extend({
          ref: z.string().optional().describe('Temporary handle so later steps in this call can refer to this one.'),
          after: z.string().optional().describe('Step id, or a ref from earlier in this call, to connect from.'),
          group: z.string().optional().describe('Group id to place the step in.'),
          edge_type: z.enum(EDGE_TYPES).optional(),
          edge_label: z.string().optional(),
        }),
      )
      .min(1),
  }),
  update_steps: z.object({
    board,
    updates: z
      .array(
        z.object({
          id,
          title: z.string().min(1).optional(),
          shape: z.enum(SHAPES).optional(),
          actor: z.enum(ACTORS).nullable().optional(),
          owner: z.string().optional(),
          duration: z.string().nullable().optional(),
          note: z.string().optional(),
          status: z.enum(STATUSES).nullable().optional(),
          lane: z.string().nullable().optional(),
          replaces: z.string().optional(),
        }),
      )
      .min(1),
  }),
  delete_steps: z.object({ board, ids: z.array(id).min(1), reconnect: z.boolean().optional() }),
  connect: z.object({
    board,
    links: z.array(z.object({ from: id, to: id, type: z.enum(EDGE_TYPES).optional(), label: z.string().optional() })).min(1),
  }),
  disconnect: z.object({ board, links: z.array(z.object({ from: id, to: id })).min(1) }),
  insert_between: z.object({ board, from: id, to: id, step: StepInput }),
  branch_parallel: z.object({
    board,
    from: id,
    branches: z.array(z.array(z.union([z.object({ existing: id }), StepInput])).min(1)).min(1),
    join_at: z.string().optional(),
  }),
  move_steps: z.object({
    board,
    ids: z.array(id).min(1),
    relation: z.enum(['after', 'before', 'above', 'below']).optional(),
    anchor: z.string().optional(),
    lane: z.string().optional(),
    group: z.string().optional(),
  }),
  add_flag: z.object({ board, target: z.string().describe('Step id or arrow id.'), kind: z.enum(FLAG_KINDS), text: z.string().min(1) }),
  resolve_flag: z.object({ board, flag_id: z.string(), resolved: z.boolean().optional() }),
  group: z.object({ board, ids: z.array(id).min(1), title: z.string().min(1) }),
  set_lanes: z.object({ board, lanes: z.array(z.string()) }),
  add_text: z.object({ board, text: z.string().min(1), near: z.string().optional() }),
  read_board: z.object({ board: z.string().describe('Board name or id.') }),
  create_board: z.object({ name: z.string().min(1), switch_to: z.boolean().optional() }),
  tidy: z.object({ board }),
};

export type ToolName = keyof typeof TOOL_SCHEMAS;
```

`src/ai/toolDefs.ts`:
```ts
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { TOOL_SCHEMAS, type ToolName } from './schemas';

const DESCRIPTIONS: Record<ToolName, string> = {
  add_steps:
    'Add one or more steps. Use "after" to connect each new step from an existing step id, or from a ref defined earlier in the same call, which is how to add a whole sequence in one call. Steps without "after" are placed at the end of the board, unconnected.',
  update_steps: 'Change properties of existing steps. Set duration, actor, status or lane to null to clear it.',
  delete_steps: "Delete steps and their arrows. With reconnect true, each deleted step's predecessors are connected to its successors so the flow stays intact.",
  connect:
    'Add arrows. type flow (default) is the next step, dependency means the target cannot start until the source is done, handoff is data or information passed. Connecting an existing pair again only updates its label.',
  disconnect: 'Remove the arrows between pairs of steps.',
  insert_between: 'Insert a new step on an existing arrow, so from -> to becomes from -> new -> to. Use this for "put X between A and B".',
  branch_parallel:
    'Create parallel paths from a step. Each branch is a sequence of new steps, or {"existing": id} for steps to split off from where they are now (they are spliced out and their neighbours reconnected). With join_at, every branch ends in an arrow to that step and any direct from -> join_at arrow is removed.',
  move_steps: 'Reposition steps without changing arrows: relative to an anchor step (after, before, above, below), into a lane, or into a group.',
  add_flag: 'Attach a blocker, warning or question to a step or an arrow.',
  resolve_flag: 'Mark a flag resolved, or reopen it with resolved false.',
  group: 'Draw a labelled frame around steps, for a phase or stage.',
  set_lanes: 'Set the complete, ordered list of swimlanes for a board. Existing lanes are kept by name. An empty list removes all lanes.',
  add_text: 'Add a free text note on the board, optionally near a step.',
  read_board: 'Read the full summary of another board in this project.',
  create_board: 'Create a new board, for example a future-state redesign, and switch to it unless switch_to is false.',
  tidy: 'Auto-layout a whole board. Use after building or restructuring many steps at once.',
};

export const TOOL_DEFS: Anthropic.Tool[] = (Object.keys(TOOL_SCHEMAS) as ToolName[]).map((name) => {
  const { $schema: _schema, ...schema } = z.toJSONSchema(TOOL_SCHEMAS[name]) as Record<string, unknown>;
  return { name, description: DESCRIPTIONS[name], input_schema: schema as Anthropic.Tool.InputSchema };
});
```

`src/ai/systemPrompt.ts`:
```ts
export const SYSTEM_PROMPT = `You are the editing assistant inside Flowstate, a flowchart tool used to redesign business processes into agentic workflows, where AI agents take over steps from people and systems.

Each user message starts with the current board inside <board> tags, then the selected steps, then the request. Step ids look like s12, arrows like e7, flags like f3, lanes like l2 and groups like g4. Always use ids from the latest board summary and never invent them. If the user names a step by its title, find its id in the summary. If a reference is ambiguous, ask one short question instead of guessing.

How to edit:
- Make changes with the tools, then reply with one short sentence saying what changed. Do not repeat the board back.
- "This", "these" and "the selected step" mean the selected steps.
- "Put X between A and B" means insert_between. "Split X off as a parallel path" or "run these in parallel" means branch_parallel, with {"existing": id} for steps that already exist.
- Add a sequence in one add_steps call, chaining steps with ref and after.
- Never supply coordinates; the app places steps next to their neighbours. Call tidy after building or heavily restructuring a board.
- Actors: person for human work, system for deterministic software, agent for AI agents. Put agent names in owner.
- Durations are working time: 30m, 2h, 1.5d (1d = 8h), 1w.
- Use blocker for anything that stops a step, warning for risks, and question for open questions.
- For a redesign, create a new board (for example "Future v1") with create_board and build there, reading the current board with read_board when useful. Keep the original board intact.
- Keep titles short, 2 to 6 words, in the user's vocabulary.
- If a tool returns an error, correct the input and retry, or explain the problem.

You can also answer questions about the board without editing it, such as where the bottlenecks are, which human steps an agent could take over, or what is on the critical path.`;
```

`src/ai/stats.ts`:
```ts
export type StatKey =
  | 'boardsCreated'
  | 'stepsAdded'
  | 'stepsUpdated'
  | 'stepsDeleted'
  | 'moved'
  | 'arrowsAdded'
  | 'arrowsRemoved'
  | 'flagsAdded'
  | 'flagsResolved'
  | 'grouped'
  | 'lanesSet'
  | 'textAdded'
  | 'tidied';

export type Stats = Partial<Record<StatKey, number>>;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const PHRASES: Array<[StatKey, (n: number) => string]> = [
  ['boardsCreated', (n) => (n === 1 ? 'new board' : `${n} new boards`)],
  ['stepsAdded', (n) => `${plural(n, 'step', 'steps')} added`],
  ['stepsUpdated', (n) => `${n} updated`],
  ['stepsDeleted', (n) => `${n} deleted`],
  ['moved', (n) => `${n} moved`],
  ['arrowsAdded', (n) => `${plural(n, 'arrow', 'arrows')} added`],
  ['arrowsRemoved', (n) => `${plural(n, 'arrow', 'arrows')} removed`],
  ['flagsAdded', (n) => plural(n, 'flag', 'flags')],
  ['flagsResolved', (n) => `${n} resolved`],
  ['grouped', (n) => plural(n, 'group', 'groups')],
  ['lanesSet', () => 'lanes updated'],
  ['textAdded', (n) => plural(n, 'note', 'notes')],
  ['tidied', () => 'tidied'],
];

export function mergeStats(a: Stats, b: Stats): Stats {
  const out: Stats = { ...a };
  for (const [key, value] of Object.entries(b) as Array<[StatKey, number]>) out[key] = (out[key] ?? 0) + value;
  return out;
}

export function describeStats(stats: Stats): string {
  const parts = PHRASES.filter(([key]) => (stats[key] ?? 0) > 0).map(([key, phrase]) => phrase(stats[key]!));
  if (parts.length === 0) return '';
  const text = parts.join(', ');
  return text[0].toUpperCase() + text.slice(1);
}
```

- [ ] **Step 4: Implement the executor and the store context**

`src/ai/executor.ts`:
```ts
import { z } from 'zod';
import { summarizeBoard } from '../analysis/summary';
import { DurationError, parseDuration } from '../model/duration';
import type { Board, Project } from '../model/types';
import { connect, disconnect } from '../ops/edges';
import { OpError } from '../ops/errors';
import { addFlag, setFlagResolved } from '../ops/flags';
import { groupSteps } from '../ops/groups';
import { setLanes } from '../ops/lanes';
import { addStep, deleteSteps, updateSteps, type StepFields, type StepUpdate } from '../ops/steps';
import { branchParallel, insertBetween, moveSteps, type BranchItem } from '../ops/structure';
import { addText } from '../ops/text';
import { TOOL_SCHEMAS, type StepInputValue, type ToolName } from './schemas';
import type { Stats } from './stats';

export interface ToolContext {
  getProject(): Project;
  activeBoardId(): string;
  changeBoard<R>(boardId: string, fn: (b: Board) => R): R;
  createBoard(name: string, activate: boolean): string;
  tidy(boardId: string): Promise<void>;
}

export interface ToolOutcome {
  ok: boolean;
  content: string;
  touched: string[];
  stats: Stats;
}

interface HandlerResult {
  result: unknown;
  touched?: string[];
  stats?: Stats;
}

type Input<N extends ToolName> = z.infer<(typeof TOOL_SCHEMAS)[N]>;
type Handler<N extends ToolName> = (ctx: ToolContext, input: Input<N>, boardId: string) => HandlerResult | Promise<HandlerResult>;

function resolveBoard(project: Project, ref: string | undefined, fallback: string): Board {
  if (!ref) return project.boards.find((b) => b.id === fallback) ?? project.boards[0];
  const wanted = ref.trim().toLowerCase();
  const found = project.boards.find((b) => b.id === ref) ?? project.boards.find((b) => b.name.toLowerCase() === wanted);
  if (!found) throw new OpError(`Unknown board "${ref}". Boards: ${project.boards.map((b) => `"${b.name}"`).join(', ')}.`);
  return found;
}

function resolveLane(board: Board, ref: string): string {
  const wanted = ref.trim().toLowerCase();
  const lane = board.lanes.find((l) => l.id === ref) ?? board.lanes.find((l) => l.name.toLowerCase() === wanted);
  if (!lane) throw new OpError(`Unknown lane "${ref}". Lanes: ${board.lanes.map((l) => `${l.id} "${l.name}"`).join(', ') || 'none. Create them with set_lanes'}.`);
  return lane.id;
}

function toFields(board: Board, input: StepInputValue): { fields: StepFields; laneId?: string } {
  const fields: StepFields = {
    title: input.title,
    shape: input.shape,
    actor: input.actor,
    owner: input.owner,
    note: input.note,
    status: input.status,
    replaces: input.replaces,
  };
  if (input.duration !== undefined) fields.durationMin = parseDuration(input.duration);
  return { fields, laneId: input.lane ? resolveLane(board, input.lane) : undefined };
}

const handlers: { [N in ToolName]: Handler<N> } = {
  add_steps: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const refs = new Map<string, string>();
      const created: Array<{ ref?: string; id: string; title: string }> = [];
      let arrows = 0;
      for (const step of input.steps) {
        const { fields, laneId } = toFields(b, step);
        const after = step.after ? (refs.get(step.after) ?? step.after) : undefined;
        const id = addStep(b, { ...fields, after, laneId, groupId: step.group, edgeType: step.edge_type, edgeLabel: step.edge_label });
        if (after) arrows++;
        if (step.ref) refs.set(step.ref, id);
        created.push({ ...(step.ref ? { ref: step.ref } : {}), id, title: step.title });
      }
      return { result: { created }, touched: created.map((c) => c.id), stats: { stepsAdded: created.length, ...(arrows ? { arrowsAdded: arrows } : {}) } };
    }),

  update_steps: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const updates: StepUpdate[] = input.updates.map(({ id, duration, lane, ...rest }) => ({
        id,
        ...rest,
        ...(duration !== undefined ? { durationMin: duration === null ? null : parseDuration(duration) } : {}),
        ...(lane !== undefined ? { laneId: lane === null ? null : resolveLane(b, lane) } : {}),
      }));
      updateSteps(b, updates);
      const ids = updates.map((u) => u.id);
      return { result: { updated: ids }, touched: ids, stats: { stepsUpdated: ids.length } };
    }),

  delete_steps: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const out = deleteSteps(b, input.ids, { reconnect: input.reconnect });
      return { result: out, stats: { stepsDeleted: out.deleted.length, ...(out.reconnected ? { arrowsAdded: out.reconnected } : {}) } };
    }),

  connect: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const ids = input.links.map((l) => connect(b, { source: l.from, target: l.to, type: l.type, label: l.label }));
      return { result: { arrows: ids }, touched: input.links.flatMap((l) => [l.from, l.to]), stats: { arrowsAdded: ids.length } };
    }),

  disconnect: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const removed = input.links.reduce((sum, l) => sum + disconnect(b, { source: l.from, target: l.to }), 0);
      return { result: { removed }, stats: { arrowsRemoved: removed } };
    }),

  insert_between: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const { fields, laneId } = toFields(b, input.step);
      const id = insertBetween(b, input.from, input.to, fields);
      if (laneId) updateSteps(b, [{ id, laneId }]);
      return { result: { id }, touched: [id], stats: { stepsAdded: 1, arrowsAdded: 1 } };
    }),

  branch_parallel: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const items: BranchItem[][] = input.branches.map((branch) => branch.map((item) => ('existing' in item ? { existing: item.existing } : toFields(b, item).fields)));
      const ids = branchParallel(b, input.from, items, input.join_at);
      const moved = items.flat().filter((i) => 'existing' in i).length;
      const added = ids.flat().length - moved;
      const arrows = ids.reduce((sum, br) => sum + br.length + (input.join_at ? 1 : 0), 0);
      return { result: { branches: ids }, touched: ids.flat(), stats: { ...(added ? { stepsAdded: added } : {}), ...(moved ? { moved } : {}), arrowsAdded: arrows } };
    }),

  move_steps: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const ids = moveSteps(b, { ids: input.ids, relation: input.relation, anchor: input.anchor, laneId: input.lane ? resolveLane(b, input.lane) : undefined, groupId: input.group });
      return { result: { moved: ids }, touched: ids, stats: { moved: ids.length } };
    }),

  add_flag: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const id = addFlag(b, input.target, input.kind, input.text);
      return { result: { flag_id: id }, touched: [input.target], stats: { flagsAdded: 1 } };
    }),

  resolve_flag: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      setFlagResolved(b, input.flag_id, input.resolved ?? true);
      return { result: { flag_id: input.flag_id, resolved: input.resolved ?? true }, stats: { flagsResolved: 1 } };
    }),

  group: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const id = groupSteps(b, input.ids, input.title);
      return { result: { group_id: id }, touched: input.ids, stats: { grouped: 1 } };
    }),

  set_lanes: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const ids = setLanes(b, input.lanes);
      return { result: { lanes: b.lanes.map((l) => ({ id: l.id, name: l.name })) }, stats: { lanesSet: ids.length || 1 } };
    }),

  add_text: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const id = addText(b, { text: input.text, near: input.near });
      return { result: { id }, touched: [id], stats: { textAdded: 1 } };
    }),

  read_board: (ctx, _input, boardId) => ({ result: summarizeBoard(ctx.getProject(), boardId) }),

  create_board: (ctx, input) => {
    const id = ctx.createBoard(input.name, input.switch_to ?? true);
    const name = ctx.getProject().boards.find((b) => b.id === id)!.name;
    return { result: { board_id: id, name }, stats: { boardsCreated: 1 } };
  },

  tidy: async (ctx, _input, boardId) => {
    await ctx.tidy(boardId);
    return { result: 'Tidied the board.', stats: { tidied: 1 } };
  },
};

function fail(content: string): ToolOutcome {
  return { ok: false, content, touched: [], stats: {} };
}

function stepList(project: Project, boardId: string): string {
  const board = project.boards.find((b) => b.id === boardId);
  const steps = board?.nodes.filter((n) => n.kind === 'step') ?? [];
  const shown = steps.slice(0, 30).map((n) => `${n.id} ${JSON.stringify(n.title || '(untitled)')}`);
  return shown.length ? ` Steps on this board: ${shown.join(', ')}${steps.length > 30 ? ', ...' : ''}.` : ' This board has no steps.';
}

function isToolName(name: string): name is ToolName {
  return Object.hasOwn(TOOL_SCHEMAS, name);
}

export async function executeTool(ctx: ToolContext, name: string, input: unknown): Promise<ToolOutcome> {
  if (!isToolName(name)) return fail(`Unknown tool "${name}".`);
  const parsed = TOOL_SCHEMAS[name].safeParse(input);
  if (!parsed.success) return fail(`Invalid input: ${z.prettifyError(parsed.error)}`);
  const data = parsed.data;
  let boardId = ctx.activeBoardId();
  try {
    if (name !== 'create_board') boardId = resolveBoard(ctx.getProject(), 'board' in data ? data.board : undefined, boardId).id;
    const handler = handlers[name] as Handler<ToolName>;
    const out = await handler(ctx, data, boardId);
    return {
      ok: true,
      content: typeof out.result === 'string' ? out.result : JSON.stringify(out.result),
      touched: out.touched ?? [],
      stats: out.stats ?? {},
    };
  } catch (err) {
    if (err instanceof OpError || err instanceof DurationError) {
      const hint = err.message.startsWith('Unknown step') ? stepList(ctx.getProject(), boardId) : '';
      return fail(err.message + hint);
    }
    throw err;
  }
}
```

`src/ai/storeContext.ts`:
```ts
import type { StoreApi } from 'zustand/vanilla';
import type { FlowStore } from '../store/store';
import type { ToolContext } from './executor';

export function storeToolContext(store: StoreApi<FlowStore>, tidy: (boardId: string) => Promise<void>): ToolContext {
  return {
    getProject: () => store.getState().project,
    activeBoardId: () => store.getState().activeBoardId,
    changeBoard: (boardId, fn) => store.getState().changeBoard(fn, boardId),
    createBoard: (name, activate) => store.getState().addBoard(name, activate),
    tidy,
  };
}
```

- [ ] **Step 5: Run and watch them pass**

Run: `npx vitest run src/ai` then `npm run typecheck`
Expected: PASS. The ids in the draft-future test follow the per-board counter on the new board (lanes `l1` to `l3`, then `s4`, `s5` with `e6`, `s7` with `e8`, `s9` with `e10`); if they differ, trace the allocation order before changing the test.

- [ ] **Step 6: Commit**

```bash
git add src/ai
git commit -m "Add AI tool schemas, system prompt, and an atomic tool executor"
```

---

### Task 17: Server chat proxy (SSE)

**Files:**
- Create: `server/chat.ts`
- Modify: `server/app.ts`, `server/main.ts`, `server/app.test.ts`, `playwright.config.ts`
- Test: `server/chat.test.ts`

**Interfaces:**
- Consumes: `SYSTEM_PROMPT`, `TOOL_DEFS`, `@anthropic-ai/sdk` streaming (`messages.stream`, events `text`, `streamEvent`, `contentBlock`, `finalMessage()`, `abort()`), Hono `streamSSE`.
- Produces:
  - `MODELS = ['claude-sonnet-5', 'claude-opus-5-5'] as const`, `MISSING_KEY` message, `describeError(err): string`, `registerChat(app, client: Anthropic | null)`.
  - `POST /api/chat` body `{ model, messages }`; SSE events: `text` `{ delta }`, `tool` (a complete `ToolUseBlock`, sent only once the next block starts or the message ends with `stop_reason: 'tool_use'`), `done` `{ content, stop_reason }`, `error` `{ message }`. 503 JSON `{ error: MISSING_KEY }` when no key.
  - `AppDeps = { storage: Storage; anthropic: Anthropic | null }`.

Tool input streaming is left off: tool inputs here are small, the API then validates them, and the client applies each call only once it is complete.

- [ ] **Step 1: Write the failing tests**

`server/chat.test.ts`:
```ts
import type Anthropic from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { MISSING_KEY, registerChat } from './chat';

type Listener = (...args: unknown[]) => void;

class FakeStream {
  listeners: Record<string, Listener[]> = {};
  aborted = false;
  constructor(private script: (emit: (event: string, ...args: unknown[]) => void) => Promise<Anthropic.Message>) {}
  on(event: string, fn: Listener) {
    (this.listeners[event] ??= []).push(fn);
    return this;
  }
  emit = (event: string, ...args: unknown[]) => {
    for (const fn of this.listeners[event] ?? []) fn(...args);
  };
  finalMessage() {
    return this.script(this.emit);
  }
  abort() {
    this.aborted = true;
  }
}

function fakeClient(script: ConstructorParameters<typeof FakeStream>[0]) {
  const calls: unknown[] = [];
  const client = {
    messages: {
      stream(params: unknown) {
        calls.push(params);
        return new FakeStream(script);
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

function message(content: unknown[], stop_reason: string): Anthropic.Message {
  return { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content, stop_reason, stop_sequence: null, usage: {} } as unknown as Anthropic.Message;
}

async function events(res: Response): Promise<Array<[string, unknown]>> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((chunk) => {
      const event = /event: (.*)/.exec(chunk)![1];
      const data = /data: (.*)/.exec(chunk)![1];
      return [event, JSON.parse(data)];
    });
}

const tool = { type: 'tool_use', id: 't1', name: 'add_steps', input: { steps: [{ title: 'A' }] } };
const post = (app: Hono, body: unknown) => app.request('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const validBody = { model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'hi' }] };

describe('POST /api/chat', () => {
  it('explains a missing API key', async () => {
    const app = new Hono();
    registerChat(app, null);
    const res = await post(app, validBody);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: MISSING_KEY });
  });

  it('rejects unknown models', async () => {
    const app = new Hono();
    registerChat(app, fakeClient(async () => message([], 'end_turn')).client);
    expect((await post(app, { ...validBody, model: 'gpt-5' })).status).toBe(400);
  });

  it('streams text, each finished tool call, and the final message', async () => {
    const { client, calls } = fakeClient(async (emit) => {
      emit('text', 'Adding.');
      emit('streamEvent', { type: 'content_block_start' });
      emit('contentBlock', tool);
      return message([{ type: 'text', text: 'Adding.' }, tool], 'tool_use');
    });
    const app = new Hono();
    registerChat(app, client);
    const res = await post(app, validBody);
    expect(await events(res)).toEqual([
      ['text', { delta: 'Adding.' }],
      ['tool', tool],
      ['done', { content: [{ type: 'text', text: 'Adding.' }, tool], stop_reason: 'tool_use' }],
    ]);
    expect(calls[0]).toMatchObject({ model: 'claude-sonnet-5', max_tokens: 32000, cache_control: { type: 'ephemeral' } });
    expect((calls[0] as { tools: unknown[] }).tools).toHaveLength(16);
  });

  it('holds back a tool call cut off by max_tokens', async () => {
    const { client } = fakeClient(async (emit) => {
      emit('contentBlock', tool);
      return message([tool], 'max_tokens');
    });
    const app = new Hono();
    registerChat(app, client);
    expect((await events(await post(app, validBody))).map(([e]) => e)).toEqual(['done']);
  });

  it('reports stream failures as an error event', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('boom');
    });
    const app = new Hono();
    registerChat(app, client);
    expect(await events(await post(app, validBody))).toEqual([['error', { message: 'boom' }]]);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run server/chat.test.ts`
Expected: FAIL, cannot resolve `./chat`.

- [ ] **Step 3: Implement the proxy and wire it in**

`server/chat.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { SYSTEM_PROMPT } from '../src/ai/systemPrompt';
import { TOOL_DEFS } from '../src/ai/toolDefs';

export const MODELS = ['claude-sonnet-5', 'claude-opus-5-5'] as const;
export const MISSING_KEY = 'ANTHROPIC_API_KEY is not set. Add it to .env and restart the dev server.';

const MAX_TOKENS = 32000;
const Body = z.object({
  model: z.enum(MODELS),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.unknown() })).min(1),
});

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by Anthropic. Wait a moment and try again.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach Anthropic. Check the internet connection.';
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ''}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

export function registerChat(app: Hono, client: Anthropic | null): void {
  app.post('/api/chat', async (c) => {
    if (!client) return c.json({ error: MISSING_KEY }, 503);
    let body: z.infer<typeof Body>;
    try {
      body = Body.parse(await c.req.json());
    } catch {
      return c.json({ error: 'Invalid chat request.' }, 400);
    }

    return streamSSE(c, async (sse) => {
      let chain = Promise.resolve();
      const send = (event: string, data: unknown) => {
        chain = chain.then(() => sse.writeSSE({ event, data: JSON.stringify(data) }));
      };
      const stream = client.messages.stream({
        model: body.model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFS,
        messages: body.messages as Anthropic.MessageParam[],
        cache_control: { type: 'ephemeral' },
      });
      sse.onAbort(() => stream.abort());

      let pending: Anthropic.ToolUseBlock | null = null;
      const flush = () => {
        if (pending) send('tool', pending);
        pending = null;
      };
      stream.on('text', (delta) => send('text', { delta }));
      stream.on('streamEvent', (event) => {
        if (event.type === 'content_block_start') flush();
      });
      stream.on('contentBlock', (block) => {
        if (block.type === 'tool_use') pending = block;
      });

      try {
        const final = await stream.finalMessage();
        if (final.stop_reason === 'tool_use') flush();
        send('done', { content: final.content, stop_reason: final.stop_reason });
      } catch (err) {
        if (!sse.aborted) send('error', { message: describeError(err) });
      }
      await chain;
    });
  });
}
```

In `server/app.ts`:
- Add imports `import type Anthropic from '@anthropic-ai/sdk';` and `import { registerChat } from './chat';`.
- Change `AppDeps` to `{ storage: Storage; anthropic: Anthropic | null }`.
- Before `return app;` add `registerChat(app, deps.anthropic);`.

In `server/app.test.ts` change the setup line to `return { dir, app: createApp({ storage: createFileStorage(dir), anthropic: null }) };`.

In `server/main.ts` add `import Anthropic from '@anthropic-ai/sdk';` and change the app line to:
```ts
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
if (!anthropic) console.warn('ANTHROPIC_API_KEY is not set; chat is disabled until you add it to .env and restart.');
const app = createApp({ storage: createFileStorage(workspace), anthropic });
```

In `playwright.config.ts`, e2e runs must not pick up a real key from `.env` unless the live test is requested. Replace the `env` line with:
```ts
    env: {
      FLOWSTATE_API_PORT: '8788',
      FLOWSTATE_WORKSPACE: '.e2e-workspace',
      ...(process.env.LIVE_API ? {} : { ANTHROPIC_API_KEY: '' }),
    },
```
`process.loadEnvFile` does not override variables that are already set, so the empty value wins over `.env`.

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run server` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server playwright.config.ts
git commit -m "Add streaming chat proxy to Claude with tool-call forwarding"
```

---

### Task 18: Chat panel and the agent loop

**Files:**
- Create: `src/chat/sse.ts`, `src/chat/agentLoop.ts`, `src/chat/context.ts`, `src/chat/chatStore.ts`, `src/chat/send.ts`, `src/chat/Composer.tsx`, `src/chat/ChatPanel.tsx`, `src/chat/useChatShortcuts.ts`, `src/chat/chat.css`
- Modify: `src/App.tsx` (full replacement below), `src/ui/TopBar.tsx`
- Test: `src/chat/sse.test.ts`, `src/chat/context.test.ts`, `src/chat/agentLoop.test.ts`, `tests/e2e/chat.spec.ts`, `tests/e2e/live.spec.ts`

**Interfaces:**
- Consumes: `executeTool`, `storeToolContext`, `mergeStats`, `describeStats`, `summarizeBoard`, `tidyBoard`, `reveal`, store `begin`, `commit`, `undoEntry`, `markGlow`, `setChatOpen`; server SSE contract from Task 17.
- Produces:
  - `readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }>`.
  - `appendUser(history, blocks): MessageParam[]`, `runTurn(deps, callbacks, history, userContent, model, signal): Promise<TurnResult>`, `MAX_ROUNDS = 12`, types `TurnDeps`, `TurnCallbacks`, `TurnResult`.
  - `type Mention = { label: string; id: string }`, `buildUserContent(project, boardId, selection, text): string`, `expandMentions(text, mentions): string`.
  - `useChat` store, `MODEL_OPTIONS`, `sendMessage(text, mentions)`, `focusComposer()`, `ChatPanel`, `useChatShortcuts()`.

- [ ] **Step 1: Write the failing unit tests**

`src/chat/sse.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { readSSE } from './sse';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

describe('readSSE', () => {
  it('parses events split across chunks and joins multi-line data', async () => {
    const out = [];
    for await (const ev of readSSE(streamOf(['event: text\nda', 'ta: {"delta":"a"}\n\nevent: done\ndata: 1\ndata: 2\n\n', 'data: tail\n\n']))) out.push(ev);
    expect(out).toEqual([
      { event: 'text', data: '{"delta":"a"}' },
      { event: 'done', data: '1\n2' },
      { event: 'message', data: 'tail' },
    ]);
  });
});
```

`src/chat/context.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { addStep } from '../ops/steps';
import { buildUserContent, expandMentions } from './context';

describe('chat context', () => {
  it('wraps the board summary, selection and request', () => {
    const p = createProject();
    const b = p.boards[0];
    const id = addStep(b, { title: 'Intake' });
    const text = buildUserContent(p, b.id, [id], 'Add a review after this');
    expect(text.startsWith('<board>\nBoard "Board 1"')).toBe(true);
    expect(text).toContain('</board>\nSelected: s1 "Intake"\n\nAdd a review after this');
    expect(buildUserContent(p, b.id, [], 'x')).toContain('Selected: nothing');
  });

  it('expands mentions, longest label first', () => {
    const out = expandMentions('Move @Review claim after @Review', [
      { label: 'Review', id: 's2' },
      { label: 'Review claim', id: 's5' },
    ]);
    expect(out).toBe('Move "Review claim" (s5) after "Review" (s2)');
  });
});
```

`src/chat/agentLoop.test.ts`:
```ts
import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { executeTool } from '../ai/executor';
import { storeToolContext } from '../ai/storeContext';
import { addStep, deleteSteps } from '../ops/steps';
import { createFlowStore } from '../store/store';
import { appendUser, MAX_ROUNDS, runTurn, type TurnDeps } from './agentLoop';

const enc = new TextEncoder();
type Chunk = string | Promise<void>;

function sse(events: Array<[string, unknown]>): string {
  return events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
}

function response(chunks: Chunk[], status = 200): Response {
  return new Response(
    new ReadableStream({
      async start(controller) {
        for (const c of chunks) {
          if (typeof c === 'string') controller.enqueue(enc.encode(c));
          else await c;
        }
        controller.close();
      },
    }),
    { status },
  );
}

const done = (content: unknown[], stop_reason: string) => ['done', { content, stop_reason }] as [string, unknown];
const noop = { onText: () => {}, onTool: () => {} };
const signal = () => new AbortController().signal;

function scripted(...responses: Array<() => Response>): TurnDeps['post'] {
  let i = 0;
  return vi.fn(async () => responses[Math.min(i++, responses.length - 1)]());
}

describe('appendUser', () => {
  it('merges into a trailing user message', () => {
    const history: Anthropic.MessageParam[] = [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'x' }] }];
    const out = appendUser(history, [{ type: 'text', text: 'next' }]);
    expect(out).toHaveLength(1);
    expect(out[0].content).toHaveLength(2);
  });
});

describe('runTurn', () => {
  it('returns a text-only answer', async () => {
    const onText = vi.fn();
    const post = scripted(() => response([sse([['text', { delta: 'Hi' }], done([{ type: 'text', text: 'Hi' }], 'end_turn')])]));
    const r = await runTurn({ post, execute: vi.fn() }, { ...noop, onText }, [], 'hello', 'claude-sonnet-5', signal());
    expect(r.error).toBeNull();
    expect(r.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(onText).toHaveBeenCalledWith('Hi');
  });

  it('applies tool calls as they arrive and sends results back', async () => {
    const tool = { type: 'tool_use', id: 't1', name: 'add_steps', input: {} };
    const execute = vi.fn(async () => ({ ok: true, content: '{"created":[]}', touched: ['s1'], stats: { stepsAdded: 1 } }));
    const post = scripted(
      () => response([sse([['tool', tool], done([tool], 'tool_use')])]),
      () => response([sse([done([{ type: 'text', text: 'Done.' }], 'end_turn')])]),
    );
    const r = await runTurn({ post, execute }, noop, [], 'go', 'claude-sonnet-5', signal());
    expect(execute).toHaveBeenCalledTimes(1);
    expect(r.stats).toEqual({ stepsAdded: 1 });
    expect(r.touched).toEqual(['s1']);
    expect(r.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect((post as ReturnType<typeof vi.fn>).mock.calls[1][0].messages[2].content[0]).toEqual({ type: 'tool_result', tool_use_id: 't1', content: '{"created":[]}' });
  });

  it('marks failed tools as errors and a truncated call as not applied', async () => {
    const tool = { type: 'tool_use', id: 't1', name: 'x', input: {} };
    const cut = { type: 'tool_use', id: 't2', name: 'y', input: {} };
    const execute = vi.fn(async () => ({ ok: false, content: 'Unknown step "s9".', touched: [], stats: {} }));
    const post = scripted(() => response([sse([['tool', tool], done([tool, cut], 'max_tokens')])]));
    const r = await runTurn({ post, execute }, noop, [], 'go', 'claude-sonnet-5', signal());
    expect(r.error).toBe('The response hit the length limit.');
    const results = r.messages[2].content as Anthropic.ToolResultBlockParam[];
    expect(results.map((b) => [b.tool_use_id, b.is_error])).toEqual([
      ['t1', true],
      ['t2', true],
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('drops the request from history on refusal', async () => {
    const post = scripted(() => response([sse([done([], 'refusal')])]));
    const r = await runTurn({ post, execute: vi.fn() }, noop, [], 'bad', 'claude-sonnet-5', signal());
    expect(r).toMatchObject({ error: 'Claude declined this request.', messages: [] });
  });

  it('surfaces server errors and HTTP failures', async () => {
    const failing = scripted(() => response([sse([['error', { message: 'Rate limited' }]])]));
    expect((await runTurn({ post: failing, execute: vi.fn() }, noop, [], 'x', 'claude-sonnet-5', signal())).error).toBe('Rate limited');
    const http = scripted(() => new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set.' }), { status: 503 }));
    const r = await runTurn({ post: http, execute: vi.fn() }, noop, [], 'x', 'claude-sonnet-5', signal());
    expect(r).toMatchObject({ error: 'ANTHROPIC_API_KEY is not set.', messages: [] });
  });

  it(`stops after ${MAX_ROUNDS} rounds`, async () => {
    const tool = { type: 'tool_use', id: 't', name: 'x', input: {} };
    const post = scripted(() => response([sse([done([tool], 'tool_use')])]));
    const execute = vi.fn(async () => ({ ok: true, content: 'ok', touched: [], stats: {} }));
    const r = await runTurn({ post, execute }, noop, [], 'loop', 'claude-sonnet-5', signal());
    expect(r.error).toBe(`Stopped after ${MAX_ROUNDS} rounds of edits.`);
    expect(post).toHaveBeenCalledTimes(MAX_ROUNDS);
    expect(r.messages[r.messages.length - 1].role).toBe('user');
  });

  it('keeps going when the user deletes a step mid-turn, as one undo entry', async () => {
    const store = createFlowStore();
    const s = () => store.getState();
    const a = s().changeBoard((b) => addStep(b, { title: 'A' }));
    const ctx = storeToolContext(store, async () => {});
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = { type: 'tool_use', id: 't1', name: 'add_steps', input: { steps: [{ title: 'B', after: a }] } };
    const second = { type: 'tool_use', id: 't2', name: 'update_steps', input: { updates: [{ id: a, owner: 'Ops' }] } };
    const post = scripted(
      () => response([sse([['tool', first]]), gate, sse([['tool', second], done([first, second], 'tool_use')])]),
      () => response([sse([done([{ type: 'text', text: 'Done.' }], 'end_turn')])]),
    );
    s().begin();
    const turn = runTurn({ post, execute: (n, i) => executeTool(ctx, n, i) }, noop, [], 'go', 'claude-sonnet-5', signal());
    await vi.waitFor(() => expect(s().project.boards[0].nodes).toHaveLength(2));
    s().changeBoard((b) => deleteSteps(b, [a]));
    release();
    const r = await turn;
    const entry = s().commit()!;
    expect(r.error).toBeNull();
    const results = r.messages[2].content as Anthropic.ToolResultBlockParam[];
    expect(results[1]).toMatchObject({ tool_use_id: 't2', is_error: true });
    expect(String(results[1].content)).toContain('Unknown step');
    expect(s().past).toHaveLength(2);
    expect(s().undoEntry(entry)).toBe(true);
    expect(s().project.boards[0].nodes.map((n) => n.title)).toEqual(['A']);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/chat`
Expected: FAIL, missing modules.

- [ ] **Step 3: Implement the SSE reader, context, and agent loop**

`src/chat/sse.ts`:
```ts
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end = buffer.indexOf('\n\n');
    while (end >= 0) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length) yield { event, data: data.join('\n') };
      end = buffer.indexOf('\n\n');
    }
  }
}
```

`src/chat/context.ts`:
```ts
import { summarizeBoard } from '../analysis/summary';
import type { Project } from '../model/types';

export interface Mention {
  label: string;
  id: string;
}

export function buildUserContent(project: Project, boardId: string, selection: string[], text: string): string {
  const board = project.boards.find((b) => b.id === boardId);
  const selected = selection.length
    ? selection
        .map((id) => {
          const n = board?.nodes.find((x) => x.id === id);
          return n ? `${id} ${JSON.stringify(n.title || '(untitled)')}` : id;
        })
        .join(', ')
    : 'nothing';
  return `<board>\n${summarizeBoard(project, boardId)}\n</board>\nSelected: ${selected}\n\n${text}`;
}

export function expandMentions(text: string, mentions: Mention[]): string {
  let out = text;
  for (const m of [...mentions].sort((a, b) => b.label.length - a.label.length)) {
    out = out.split(`@${m.label}`).join(`"${m.label}" (${m.id})`);
  }
  return out;
}
```

`src/chat/agentLoop.ts`:
```ts
import type Anthropic from '@anthropic-ai/sdk';
import type { ToolOutcome } from '../ai/executor';
import { mergeStats, type Stats } from '../ai/stats';
import { readSSE } from './sse';

export const MAX_ROUNDS = 12;

export interface TurnDeps {
  post(body: { model: string; messages: Anthropic.MessageParam[] }, signal: AbortSignal): Promise<Response>;
  execute(name: string, input: unknown): Promise<ToolOutcome>;
}

export interface TurnCallbacks {
  onText(delta: string): void;
  onTool(name: string, outcome: ToolOutcome): void;
}

export interface TurnResult {
  messages: Anthropic.MessageParam[];
  stats: Stats;
  touched: string[];
  error: string | null;
}

interface Done {
  content: Anthropic.ContentBlock[];
  stop_reason: Anthropic.StopReason | null;
}

export function appendUser(history: Anthropic.MessageParam[], blocks: Anthropic.ContentBlockParam[]): Anthropic.MessageParam[] {
  const last = history[history.length - 1];
  if (last?.role === 'user') {
    const previous: Anthropic.ContentBlockParam[] = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content;
    return [...history.slice(0, -1), { role: 'user', content: [...previous, ...blocks] }];
  }
  return [...history, { role: 'user', content: blocks }];
}

async function errorFrom(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Chat request failed (${res.status}).`;
  } catch {
    return `Chat request failed (${res.status}).`;
  }
}

export async function runTurn(
  deps: TurnDeps,
  callbacks: TurnCallbacks,
  history: Anthropic.MessageParam[],
  userContent: string,
  model: string,
  signal: AbortSignal,
): Promise<TurnResult> {
  let messages = appendUser(history, [{ type: 'text', text: userContent }]);
  let stats: Stats = {};
  const touched = new Set<string>();
  const finish = (error: string | null, final = messages): TurnResult => ({ messages: final, stats, touched: [...touched], error });
  const record = (name: string, outcome: ToolOutcome) => {
    stats = mergeStats(stats, outcome.stats);
    for (const id of outcome.touched) touched.add(id);
    callbacks.onTool(name, outcome);
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const fallback = round === 0 ? history : messages;
    let res: Response;
    try {
      res = await deps.post({ model, messages }, signal);
    } catch {
      return finish(signal.aborted ? 'Stopped.' : 'Could not reach the Flowstate server.', fallback);
    }
    if (!res.ok || !res.body) return finish(await errorFrom(res), fallback);

    const outcomes = new Map<string, ToolOutcome>();
    let done: Done | null = null;
    let failure: string | null = null;
    try {
      for await (const ev of readSSE(res.body)) {
        if (ev.event === 'text') callbacks.onText((JSON.parse(ev.data) as { delta: string }).delta);
        else if (ev.event === 'tool') {
          if (signal.aborted) break;
          const block = JSON.parse(ev.data) as Anthropic.ToolUseBlock;
          const outcome = await deps.execute(block.name, block.input);
          outcomes.set(block.id, outcome);
          record(block.name, outcome);
        } else if (ev.event === 'done') done = JSON.parse(ev.data) as Done;
        else if (ev.event === 'error') failure = (JSON.parse(ev.data) as { message: string }).message;
      }
    } catch {
      failure = signal.aborted ? 'Stopped.' : 'The response was interrupted.';
    }
    if (!done) return finish(failure ?? 'The response ended unexpectedly.', fallback);
    if (done.stop_reason === 'refusal') return finish('Claude declined this request.', history);

    messages = [...messages, { role: 'assistant', content: done.content }];
    const toolUses = done.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) return finish(failure);

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      let outcome = outcomes.get(use.id);
      if (!outcome && done.stop_reason === 'tool_use') {
        outcome = await deps.execute(use.name, use.input);
        record(use.name, outcome);
      }
      outcome ??= { ok: false, content: 'Not applied: the response was cut off before this call finished.', touched: [], stats: {} };
      results.push({ type: 'tool_result', tool_use_id: use.id, content: outcome.content, ...(outcome.ok ? {} : { is_error: true }) });
    }
    messages = appendUser(messages, results);
    if (done.stop_reason !== 'tool_use') return finish(done.stop_reason === 'max_tokens' ? 'The response hit the length limit.' : failure);
  }
  return finish(`Stopped after ${MAX_ROUNDS} rounds of edits.`);
}
```

- [ ] **Step 4: Run and watch the unit tests pass**

Run: `npx vitest run src/chat`
Expected: PASS.

- [ ] **Step 5: Write the failing e2e tests**

`tests/e2e/chat.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { addStep } from '../../src/ops/steps';
import { links, open, seed } from './fixtures';

function sse(events: Array<[string, unknown]>): string {
  return events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
}

async function mockChat(page: Page, rounds: string[]): Promise<unknown[]> {
  const bodies: unknown[] = [];
  await page.route('**/api/chat', async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: rounds[Math.min(bodies.length - 1, rounds.length - 1)] });
  });
  return bodies;
}

const seedTwo = (request: Parameters<typeof seed>[0]) =>
  seed(request, (b) => {
    const a = addStep(b, { title: 'Intake', x: 0, y: 0 });
    addStep(b, { title: 'Approve', after: a });
  });

test('explains a missing API key', async ({ page, request }) => {
  test.skip(!!process.env.LIVE_API, 'The live run has a key');
  await open(page, await seedTwo(request));
  await page.getByLabel('Message').fill('Add a step');
  await page.getByLabel('Message').press('Enter');
  await expect(page.locator('.chat-error')).toHaveText('ANTHROPIC_API_KEY is not set. Add it to .env and restart the dev server.');
});

test('applies tool calls live, summarises them, and undoes the turn in one click', async ({ page, request }) => {
  const tool = { type: 'tool_use', id: 'tu1', name: 'insert_between', input: { from: 's1', to: 's2', step: { title: 'Review', actor: 'agent', duration: '1h' } } };
  const bodies = await mockChat(page, [
    sse([['text', { delta: 'Adding a review step.' }], ['tool', tool], ['done', { content: [{ type: 'text', text: 'Adding a review step.' }, tool], stop_reason: 'tool_use' }]]),
    sse([['text', { delta: ' Done.' }], ['done', { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' }]]),
  ]);
  await open(page, await seedTwo(request));
  await page.getByLabel('Message').fill('Put an agent review between intake and approve');
  await page.getByLabel('Message').press('Enter');
  await expect(page.locator('.chat-chip')).toHaveText('1 step added, 1 arrow added');
  await expect(page.locator('.chat-text').last()).toHaveText('Adding a review step. Done.');
  expect(await links(page)).toEqual(['Intake>Review', 'Review>Approve']);
  expect(JSON.stringify(bodies[0])).toContain('<board>');
  const second = bodies[1] as { messages: Array<{ content: Array<{ type: string; tool_use_id?: string }> }> };
  expect(second.messages[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu1' });
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await links(page)).toEqual(['Intake>Approve']);
});

test('mentions insert a step reference', async ({ page, request }) => {
  const bodies = await mockChat(page, [sse([['done', { content: [{ type: 'text', text: 'Ok.' }], stop_reason: 'end_turn' }]])]);
  await open(page, await seedTwo(request));
  const input = page.getByLabel('Message');
  await input.fill('Flag @Int');
  await page.getByRole('option', { name: /Intake/ }).waitFor();
  await input.press('Enter');
  await input.pressSequentially('as risky');
  await input.press('Enter');
  await expect.poll(() => bodies.length).toBe(1);
  expect(JSON.stringify(bodies[0])).toContain('Flag \\"Intake\\" (s1) as risky');
});

test('Stop cancels a running turn', async ({ page, request }) => {
  await page.route('**/api/chat', () => new Promise(() => {}));
  await open(page, await seedTwo(request));
  await page.getByLabel('Message').fill('Take your time');
  await page.getByLabel('Message').press('Enter');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('.chat-error')).toHaveText('Stopped.');
});

test('Ctrl+/ hides and shows the chat, Ctrl+K focuses it', async ({ page, request }) => {
  await open(page, await seedTwo(request));
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Control+/');
  await expect(page.locator('.chat')).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await expect(page.getByLabel('Message')).toBeFocused();
});
```

`tests/e2e/live.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { addStep } from '../../src/ops/steps';
import { links, open, seed } from './fixtures';

test('a real Claude turn inserts a step between two others', async ({ page, request }) => {
  test.skip(!process.env.LIVE_API, 'Set LIVE_API=1 (and ANTHROPIC_API_KEY in .env) to run against the real API');
  test.setTimeout(120_000);
  const p = await seed(request, (b) => {
    const a = addStep(b, { title: 'Intake', x: 0, y: 0 });
    addStep(b, { title: 'Approve', after: a });
  });
  await open(page, p);
  await page.getByLabel('Message').fill('Put a step called Review between Intake and Approve');
  await page.getByLabel('Message').press('Enter');
  await expect(page.locator('.chat-chip')).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => links(page), { timeout: 30_000 }).toEqual(['Intake>Review', 'Review>Approve']);
});
```

Run: `npx playwright test tests/e2e/chat.spec.ts`
Expected: FAIL (no chat panel).

- [ ] **Step 6: Implement the chat store, send action and UI**

`src/chat/chatStore.ts`:
```ts
import type Anthropic from '@anthropic-ai/sdk';
import { create } from 'zustand';
import { mergeStats, type Stats } from '../ai/stats';
import { flowStore } from '../store/store';

export const MODEL_OPTIONS = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
] as const;
export type ModelId = (typeof MODEL_OPTIONS)[number]['id'];

export type ChatItem =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'assistant'; text: string; stats: Stats; entryId: number | null; error: string | null; running: boolean };

interface ChatState {
  items: ChatItem[];
  api: Anthropic.MessageParam[];
  model: ModelId;
  controller: AbortController | null;
  draft: string;
  addUser(text: string): void;
  startAssistant(controller: AbortController): number;
  appendText(id: number, delta: string): void;
  addStats(id: number, stats: Stats): void;
  finish(id: number, patch: { stats: Stats; entryId: number | null; error: string | null }, api: Anthropic.MessageParam[]): void;
  setModel(model: ModelId): void;
  setDraft(draft: string): void;
  stop(): void;
  reset(): void;
}

let seq = 0;

const patchAssistant = (items: ChatItem[], id: number, fn: (item: Extract<ChatItem, { role: 'assistant' }>) => ChatItem) =>
  items.map((i) => (i.id === id && i.role === 'assistant' ? fn(i) : i));

export const useChat = create<ChatState>()((set, get) => ({
  items: [],
  api: [],
  model: 'claude-sonnet-5',
  controller: null,
  draft: '',
  addUser(text) {
    set({ items: [...get().items, { id: ++seq, role: 'user', text }] });
  },
  startAssistant(controller) {
    const id = ++seq;
    set({ controller, items: [...get().items, { id, role: 'assistant', text: '', stats: {}, entryId: null, error: null, running: true }] });
    return id;
  },
  appendText(id, delta) {
    set({ items: patchAssistant(get().items, id, (i) => ({ ...i, text: i.text + delta })) });
  },
  addStats(id, stats) {
    set({ items: patchAssistant(get().items, id, (i) => ({ ...i, stats: mergeStats(i.stats, stats) })) });
  },
  finish(id, patch, api) {
    if (!get().items.some((i) => i.id === id)) return;
    set({ api, controller: null, items: patchAssistant(get().items, id, (i) => ({ ...i, ...patch, running: false })) });
  },
  setModel(model) {
    set({ model });
  },
  setDraft(draft) {
    set({ draft });
  },
  stop() {
    get().controller?.abort();
  },
  reset() {
    get().controller?.abort();
    set({ items: [], api: [], controller: null });
  },
}));

flowStore.subscribe((s, prev) => {
  if (s.project.id !== prev.project.id) useChat.getState().reset();
});
```

`src/chat/send.ts`:
```ts
import { executeTool } from '../ai/executor';
import { storeToolContext } from '../ai/storeContext';
import { reveal } from '../canvas/reveal';
import { tidyBoard } from '../layout/tidyBoard';
import { flowStore } from '../store/store';
import { runTurn, type TurnResult } from './agentLoop';
import { useChat } from './chatStore';
import { buildUserContent, expandMentions, type Mention } from './context';

export async function sendMessage(raw: string, mentions: Mention[]): Promise<void> {
  const chat = useChat.getState();
  const text = raw.trim();
  if (!text || chat.controller) return;
  const flow = flowStore.getState();
  const content = buildUserContent(flow.project, flow.activeBoardId, flow.selection, expandMentions(text, mentions));
  chat.addUser(text);
  const controller = new AbortController();
  const assistantId = chat.startAssistant(controller);
  const ctx = storeToolContext(flowStore, (boardId) => tidyBoard(flowStore, boardId));
  const projectId = flow.project.id;

  flowStore.getState().begin();
  let result: TurnResult;
  try {
    result = await runTurn(
      {
        post: (body, signal) => fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal }),
        execute: async (name, input) => {
          if (flowStore.getState().project.id !== projectId) return { ok: false, content: 'Not applied: the project was closed.', touched: [], stats: {} };
          const outcome = await executeTool(ctx, name, input);
          flowStore.getState().markGlow(outcome.touched);
          reveal(outcome.touched);
          return outcome;
        },
      },
      {
        onText: (delta) => useChat.getState().appendText(assistantId, delta),
        onTool: (_name, outcome) => useChat.getState().addStats(assistantId, outcome.stats),
      },
      chat.api,
      content,
      chat.model,
      controller.signal,
    );
  } catch (err) {
    result = { messages: chat.api, stats: {}, touched: [], error: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` };
  }
  const entryId = flowStore.getState().commit();
  useChat.getState().finish(assistantId, { stats: result.stats, entryId, error: result.error }, result.messages);
}
```

`src/chat/Composer.tsx`:
```tsx
import { Send, Square } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BoardNode } from '../model/types';
import { selectActiveBoard, useFlow } from '../store/store';
import { useChat } from './chatStore';
import type { Mention } from './context';
import { sendMessage } from './send';

export function focusComposer(): void {
  document.querySelector<HTMLTextAreaElement>('.chat-input')?.focus();
}

export function Composer() {
  const text = useChat((s) => s.draft);
  const running = useChat((s) => s.controller !== null);
  const board = useFlow(selectActiveBoard);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [query, setQuery] = useState<{ start: number; term: string } | null>(null);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const setText = (value: string) => useChat.getState().setDraft(value);

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !ref.current) return;
    ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [text]);

  const options = useMemo(() => {
    if (!query) return [];
    const term = query.term.toLowerCase();
    return board.nodes.filter((n) => n.kind === 'step' && n.title && n.title.toLowerCase().includes(term)).slice(0, 6);
  }, [query, board]);

  const track = (value: string, caret: number) => {
    const match = /@([^@\n]{0,40})$/.exec(value.slice(0, caret));
    setQuery(match ? { start: caret - match[0].length, term: match[1] } : null);
    setActive(0);
  };

  const pick = (node: BoardNode) => {
    const el = ref.current;
    if (!query || !el) return;
    const insert = `@${node.title} `;
    pendingCaret.current = query.start + insert.length;
    setText(text.slice(0, query.start) + insert + text.slice(el.selectionStart));
    setMentions((ms) => [...ms.filter((m) => m.label !== node.title), { label: node.title, id: node.id }]);
    setQuery(null);
    el.focus();
  };

  const submit = () => {
    if (!text.trim() || running) return;
    void sendMessage(text, mentions.filter((m) => text.includes(`@${m.label}`)));
    setText('');
    setMentions([]);
  };

  return (
    <div className="chat-composer">
      {options.length > 0 && (
        <div className="mention-menu" role="listbox" aria-label="Mention a step">
          {options.map((n, i) => (
            <button
              key={n.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className="mention-option"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(n);
              }}
            >
              {n.title}
              <span>{n.id}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        className="chat-input"
        rows={2}
        aria-label="Message"
        placeholder="Describe a change or ask a question. Type @ to mention a step."
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          track(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (options.length) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((active + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              pick(options[active]);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setQuery(null);
              return;
            }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.currentTarget.blur();
          }
        }}
      />
      {running ? (
        <button type="button" className="chat-send is-stop" aria-label="Stop" title="Stop" onClick={() => useChat.getState().stop()}>
          <Square size={12} />
        </button>
      ) : (
        <button type="button" className="chat-send" aria-label="Send" title="Send (Enter)" disabled={!text.trim()} onClick={submit}>
          <Send size={14} />
        </button>
      )}
    </div>
  );
}
```

`src/chat/ChatPanel.tsx`:
```tsx
import { Bot, PanelRightClose, Plus, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { describeStats } from '../ai/stats';
import { flowStore, useFlow } from '../store/store';
import { MODEL_OPTIONS, useChat, type ChatItem } from './chatStore';
import { Composer, focusComposer } from './Composer';
import './chat.css';

const EXAMPLES = [
  'Add intake, review and approval steps',
  'Put a quality check between the last two steps',
  'Split the selected step off as a parallel path',
  'Which human steps could an AI agent take over?',
  'Draft an agentic version of this board on a new board',
];

function ChatEmpty() {
  return (
    <div className="chat-empty">
      <p>Describe a change or ask about the board. Selected steps are "this" and "these". Type @ to mention a step.</p>
      {EXAMPLES.map((t) => (
        <button
          key={t}
          type="button"
          className="chat-example"
          onClick={() => {
            useChat.getState().setDraft(t);
            focusComposer();
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function ChatMessage({ item }: { item: ChatItem }) {
  const latestEntry = useFlow((s) => s.past[s.past.length - 1]?.id ?? null);
  const inTx = useFlow((s) => s.tx !== null);
  if (item.role === 'user') return <div className="chat-msg is-user">{item.text}</div>;
  const summary = describeStats(item.stats);
  const canUndo = item.entryId !== null && item.entryId === latestEntry && !inTx;
  return (
    <div className="chat-msg is-assistant">
      {item.text && <div className="chat-text">{item.text}</div>}
      {item.running && !item.text && (
        <div className="chat-typing" aria-label="Working">
          <span />
          <span />
          <span />
        </div>
      )}
      {(summary || item.entryId !== null) && (
        <div className="chat-change">
          {summary && <span className="chat-chip">{summary}</span>}
          {item.entryId !== null && (
            <button
              type="button"
              className="chat-undo"
              disabled={!canUndo}
              title={canUndo ? 'Undo these changes' : 'Later changes were made. Use Ctrl+Z to step back.'}
              onClick={() => flowStore.getState().undoEntry(item.entryId!)}
            >
              <Undo2 size={12} /> Undo
            </button>
          )}
        </div>
      )}
      {item.error && (
        <div className="chat-error" role="alert">
          {item.error}
        </div>
      )}
    </div>
  );
}

export function ChatPanel() {
  const items = useChat((s) => s.items);
  const model = useChat((s) => s.model);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [items]);
  return (
    <aside className="chat" aria-label="Assistant">
      <header className="chat-head">
        <span className="chat-title">
          <Bot size={15} /> Assistant
        </span>
        <select
          className="chat-model"
          aria-label="Model"
          value={model}
          onChange={(e) => {
            const option = MODEL_OPTIONS.find((o) => o.id === e.target.value);
            if (option) useChat.getState().setModel(option.id);
          }}
        >
          {MODEL_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" className="chat-icon" aria-label="New chat" title="New chat" onClick={() => useChat.getState().reset()}>
          <Plus size={14} />
        </button>
        <button type="button" className="chat-icon" aria-label="Hide assistant" title="Hide assistant (Ctrl+/)" onClick={() => flowStore.getState().setChatOpen(false)}>
          <PanelRightClose size={14} />
        </button>
      </header>
      <div className="chat-list" ref={list}>
        {items.length === 0 ? <ChatEmpty /> : items.map((item) => <ChatMessage key={item.id} item={item} />)}
      </div>
      <Composer />
    </aside>
  );
}
```

`src/chat/useChatShortcuts.ts`:
```ts
import { useEffect } from 'react';
import { flowStore } from '../store/store';
import { focusComposer } from './Composer';

export function useChatShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const st = flowStore.getState();
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        st.setChatOpen(true);
        requestAnimationFrame(focusComposer);
      } else if (e.key === '/') {
        e.preventDefault();
        st.setChatOpen(!st.chatOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
```

`src/chat/chat.css`:
```css
.chat {
  width: 360px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--surface);
  border-left: 1px solid var(--border);
}
.chat-head {
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px 0 14px;
  border-bottom: 1px solid var(--border);
}
.chat-title {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.chat-model {
  height: 26px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-2);
  font-size: 12px;
  padding: 0 6px;
}
.chat-icon {
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  border-radius: 7px;
  color: var(--text-2);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.chat-icon:hover {
  background: var(--surface-2);
  color: var(--text);
}
.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.chat-empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-2);
  line-height: 1.5;
}
.chat-empty p {
  margin: 0 0 6px;
}
.chat-example {
  text-align: left;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  color: var(--text);
  font-size: 12.5px;
}
.chat-example:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.chat-msg {
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.chat-msg.is-user {
  align-self: flex-end;
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 14px 14px 4px 14px;
  background: var(--accent-soft);
  white-space: pre-wrap;
}
.chat-text {
  white-space: pre-wrap;
}
.chat-change {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.chat-chip,
.chat-undo {
  font-size: 11.5px;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 9px;
  color: var(--text-2);
}
.chat-chip {
  background: var(--surface-2);
}
.chat-undo {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--surface);
  cursor: pointer;
}
.chat-undo:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent);
}
.chat-undo:disabled {
  opacity: 0.45;
  cursor: default;
}
.chat-error {
  margin-top: 4px;
  color: var(--blocker);
  font-size: 12.5px;
}
.chat-typing {
  display: inline-flex;
  gap: 4px;
  padding: 6px 0;
}
.chat-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-3);
  animation: chat-dot 1s infinite ease-in-out;
}
.chat-typing span:nth-child(2) {
  animation-delay: 0.15s;
}
.chat-typing span:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes chat-dot {
  0%,
  80%,
  100% {
    opacity: 0.25;
  }
  40% {
    opacity: 1;
  }
}
.chat-composer {
  position: relative;
  flex: none;
  margin: 10px;
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 6px 6px 6px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.chat-composer:focus-within {
  border-color: var(--accent);
}
.chat-input {
  flex: 1;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  font-size: 13px;
  line-height: 1.45;
  field-sizing: content;
  min-height: 2.9em;
  max-height: 160px;
  padding: 4px 0;
}
.chat-send {
  flex: none;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 9px;
  background: var(--accent);
  color: var(--accent-text);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.chat-send:disabled {
  opacity: 0.4;
  cursor: default;
}
.chat-send.is-stop {
  background: var(--text);
  color: var(--surface);
}
.mention-menu {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: calc(100% + 6px);
  display: flex;
  flex-direction: column;
  padding: 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-md);
}
.mention-option {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  border: 0;
  background: transparent;
  border-radius: 7px;
  padding: 6px 8px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--text);
}
.mention-option[aria-selected='true'] {
  background: var(--accent-soft);
}
.mention-option span {
  color: var(--text-3);
}
```

`src/App.tsx`:
```tsx
import { ChatPanel } from './chat/ChatPanel';
import { useChatShortcuts } from './chat/useChatShortcuts';
import { useFlow } from './store/store';
import { CanvasArea } from './ui/CanvasArea';
import { Toasts } from './ui/Toasts';
import { TopBar } from './ui/TopBar';

export function App() {
  const chatOpen = useFlow((s) => s.chatOpen);
  useChatShortcuts();
  return (
    <div className="app">
      <main className="workspace">
        <TopBar />
        <CanvasArea />
      </main>
      {chatOpen && <ChatPanel />}
      <Toasts />
    </div>
  );
}
```

In `src/ui/TopBar.tsx` add `Bot` to the lucide import, add `const chatOpen = useFlow((s) => s.chatOpen);` in the component, and render as the last child of the header:
```tsx
      {!chatOpen && (
        <button type="button" className="topbar-btn" title="Show assistant (Ctrl+/)" onClick={() => flowStore.getState().setChatOpen(true)}>
          <Bot size={14} />
          <span>Assistant</span>
        </button>
      )}
```

- [ ] **Step 7: Run and watch the tests pass**

Run: `npx vitest run` then `npx playwright test tests/e2e/chat.spec.ts` then `npm run typecheck`
Expected: PASS (the live test is skipped).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add the assistant chat panel and client-side agent loop"
```

---

### Task 19: Performance check, docs, ADRs, full verification and playtest

**Files:**
- Create: `tests/e2e/perf.spec.ts`, `README.md`, `docs/adr/0001-react-flow-canvas.md`, `docs/adr/0002-client-side-agent-loop.md`, `docs/adr/0003-local-placement-with-elk-tidy.md`

- [ ] **Step 1: Write the performance check**

`tests/e2e/perf.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { addStep } from '../../src/ops/steps';
import { open, seed } from './fixtures';

test('pans and zooms a 1000-step board without long frames', async ({ page, request }) => {
  test.setTimeout(120_000);
  const p = await seed(request, (b) => {
    for (let row = 0; row < 50; row++) {
      let prev = addStep(b, { title: `R${row} C0`, x: 0, y: row * 140 });
      for (let col = 1; col < 20; col++) prev = addStep(b, { title: `R${row} C${col}`, after: prev });
    }
  }, 'Perf');
  await open(page, p);
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click();
  const frames = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        let last = performance.now();
        const tick = (now: number) => {
          times.push(now - last);
          last = now;
          if (times.length < 240) requestAnimationFrame(tick);
          else resolve(times);
        };
        requestAnimationFrame(tick);
      }),
  );
  const box = (await page.locator('.react-flow__pane').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i % 2 ? 150 : -150);
  await page.mouse.down({ button: 'middle' });
  for (let i = 0; i < 40; i++) await page.mouse.move(box.x + box.width / 2 - i * 15, box.y + box.height / 2 - i * 8);
  await page.mouse.up({ button: 'middle' });
  const times = (await frames).slice(5).sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p95 = times[Math.floor(times.length * 0.95)];
  console.log(`1000 steps: average frame ${avg.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms`);
  await test.info().attach('frame-times', { body: JSON.stringify({ avg, p95 }), contentType: 'application/json' });
  expect(p95).toBeLessThan(50);
});
```

Run: `npx playwright test tests/e2e/perf.spec.ts`
Expected: PASS, and the printed average near 16.7ms (60fps). If p95 exceeds 50ms, profile before changing anything: the usual causes are `toFlowNodes` cache misses (check the `deps` array) or a `useFlow` selector returning a new array on every call.

- [ ] **Step 2: Write the ADRs**

`docs/adr/0001-react-flow-canvas.md`:
```markdown
# 0001: React Flow for the canvas

Status: Accepted (2026-09-25)

## Context
Flowstate needs an infinite canvas where diagrams are graphs (steps and connected arrows) so that AI edits, dependencies and critical path work on structure, not pixels.

## Decision
Use `@xyflow/react` (MIT) with custom node and edge components. Rejected: tldraw (freeform drawing model, commercial licence for production) and a custom canvas (months of work before parity).

## Consequences
Freehand drawing is out of scope. The board model stays our own (`src/model`); React Flow is only the view, so a future renderer swap does not touch the data.
```

`docs/adr/0002-client-side-agent-loop.md`:
```markdown
# 0002: Agent loop in the browser, thin server proxy

Status: Accepted (2026-09-25)

## Context
Claude's tool calls must edit the same state the user is editing, show up live, and undo as one step. The API key must not reach the browser.

## Decision
The server only proxies `messages.stream` over SSE and holds the key. The browser runs the loop: it applies each complete tool call through `src/ops` (the same functions the UI uses) inside one store transaction per turn, then posts tool results back.

## Consequences
One source of truth and no state sync. The server forwards a tool call only once the next block starts or the message ends with `tool_use`, so a call cut off by `max_tokens` is never applied. Moving to a hosted, multi-user setup later means adding auth in front of `/api/chat` and moving storage, not moving the loop.

Known limit: `begin`/`commit` is a shared depth counter, so a canvas drag that straddles the end of an AI turn, or Ctrl+Z pressed mid-turn, splits or merges the turn's undo entry and the chat Undo button does not appear. Token-owned transactions would fix this if it matters in practice.
```

`docs/adr/0003-local-placement-with-elk-tidy.md`:
```markdown
# 0003: Local placement for edits, ELK only on request

Status: Accepted (2026-09-25)

## Context
Users arrange boards by hand. Re-running a global layout after every AI edit would move everything they placed.

## Decision
Ops place new steps next to their anchor and shift only downstream steps when room is needed (`src/layout/place.ts`). ELK layered layout runs only for Tidy, direction changes, and the AI `tidy` tool.

## Consequences
Small edits never disturb the board. Large AI restructures can look crowded until Tidy runs; the system prompt tells Claude to call `tidy` after heavy restructuring.
```

- [ ] **Step 3: Write the README**

`README.md`:
```markdown
# Flowstate

A keyboard-first flowchart canvas for redesigning processes into agentic workflows, with a Claude assistant that can make any edit you can.

## Run it

1. Node 24 or newer.
2. `npm install`
3. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` (from console.anthropic.com). The chat stays disabled without it; everything else works.
4. `npm run dev`, then open http://localhost:5173

Projects are saved as JSON files in `workspace/`.

## Privacy and cost

Nothing leaves your machine until you send a chat message. Each message sends the current board's structure and text (steps, arrows, lanes, flags, notes) to Anthropic's API and is billed to your key. Sonnet 5 is the default; Opus 5.5 costs about twice as much per token.

## Keys

| Key | Action |
|---|---|
| Tab | Add the next connected step (while typing: save and add the next) |
| Enter | Add a parallel sibling (while typing: save) |
| Typing, F2, double-click | Edit the title |
| 1 to 9 | Shape: process, decision, start/end, data, document, database, preparation, connector, sticky |
| A | Cycle actor: person, system, AI agent, none |
| B / W / Q | Add a blocker, warning or question |
| T | Free text at the cursor |
| C | Critical path |
| L | Tidy layout |
| Arrow keys | Move to the nearest step in that direction |
| Delete, Shift+Delete | Delete, or delete and reconnect around it |
| Ctrl+Z, Ctrl+Shift+Z | Undo, redo (a whole assistant turn is one undo) |
| Ctrl+C, Ctrl+V, Ctrl+D, Ctrl+A | Copy, paste, duplicate, select all |
| Shift+1 | Fit the board |
| Space+drag, middle or right drag | Pan |
| Ctrl+K, Ctrl+/ | Focus the assistant, show or hide it |

Shift+click a board tab to view it read-only beside the active board.

## Tests

- `npm test` for unit tests
- `npm run test:e2e` for browser tests (they never call the real API)
- Live API check, PowerShell: `$env:LIVE_API=1; npx playwright test tests/e2e/live.spec.ts`
```

- [ ] **Step 4: Full verification**

Run, in order, and read every result:
```bash
npm run typecheck
npx vitest run
npx playwright test
npm run build
```
Expected: typecheck exit 0; all unit tests pass; all e2e tests pass except `live.spec.ts`, which is skipped; build succeeds. Report any failure with its output rather than working around it.

- [ ] **Step 5: Live runtime smoke test (confirm cost with the user first)**

Ask the user before spending API credit. With their go-ahead and a key in `.env`:
- Run `$env:LIVE_API=1; npx playwright test tests/e2e/live.spec.ts` (PowerShell) and confirm it passes.
- Run `npm run dev`, open the app, and send "Draft an agentic version of this board on a new board" against a small seeded board. Confirm steps appear live, the summary chip and Undo work, and the new board is tidy.

- [ ] **Step 6: Human playtest**

Ask the user to build a 15-step flow with one parallel branch, once by keyboard only and once by chat only, and time both against the 2-minute target in the spec. Note friction (eye travel, clicks, anything that needed a menu) and fix it before calling the build done.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add performance check, ADRs and README"
```
