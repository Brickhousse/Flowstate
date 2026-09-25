# Flowstate: Design Spec

Date: 2026-09-25
Status: Draft, awaiting review

## 1. Purpose

Flowstate is a visual workflow canvas for redesigning business processes into agentic workflows. The primary job is brainstorming a new process quickly: steps, people, systems, AI agents, parallel paths, dependencies, blockers and critical paths. A Claude-powered chat can do anything a human can do on the board.

**Users:** one person, running locally. Team sharing comes later, so the data model and storage are built to be swapped out, not rewritten.

**Success criteria**
- A new 15-step flow with one parallel branch can be built in under 2 minutes, by keyboard alone or by chat alone.
- Chat commands like "put a review step between Intake and Approval" or "split Research off as a parallel path from Kickoff, rejoin at Decision" produce the correct graph on the first try.
- Pan and zoom stay smooth (60fps target) on a 1000-step board.
- No modal dialogs or side inspector panels for everyday editing.

## 2. Screen layout and interaction

```
+-----------------------------------------------------------+--------------+
| [Boards: Current | Future v1 | +]   [Critical path] [Tidy] |              |
|                                                           |   CHAT       |
|                  INFINITE CANVAS                          |   (Claude)   |
|                                                           |              |
|    [step] --> [step] -+-> [step]                          |  history     |
|                       +-> [step]    (parallel)            |  + undo per  |
|                                                           |  AI turn     |
|  +--------+                                     [minimap] |              |
|  | shape  |                                               | ------------ |
|  | palette|                                               | [ type... ]  |
|  +--------+                                               |              |
+-----------------------------------------------------------+--------------+
```

- The canvas is central. Chat is docked on the right and collapsible (`Ctrl+/`). Its input box sits at the bottom right.
- **Controls sit where you work:** selecting a step shows a floating toolbar directly above it (shape, actor, colour, flag, duration). There is no side inspector.
- **Hover handles:** hovering a step shows `+` handles on each side. Clicking one creates a connected next step, and dragging one draws an arrow to an existing step or to empty space (which creates a new step there).
- **Board:** infinite canvas, zoom range 5% to 400%, minimap, and `Shift+1` to fit the view to the board.
- **Board tabs:** one project holds many boards. You can split-view two boards side by side for reference.

### Keyboard map

| Key | Action |
|---|---|
| `Tab` | Add a connected next step after the selection and start typing |
| `Enter` | Add a sibling (parallel branch from the same parent) and start typing |
| typing / `F2` | Edit the selected step's title |
| `1`-`9` | Switch the selected step's shape (section 3) |
| `A` | Cycle actor: Person, System, AI Agent |
| `B` / `W` / `Q` | Add a Blocker / Warning / Question flag |
| `T` | Free text at the cursor |
| `C` | Toggle critical path |
| `L` | Tidy (auto-layout the whole board) |
| `Ctrl+K` | Focus the chat input |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+C/V/D` | Copy / paste / duplicate |
| `Delete` | Delete; `Shift+Delete` deletes and reconnects the neighbours |
| `Space+drag`, wheel | Pan, zoom |
| Arrow keys | Move the selection to the nearest connected step |

## 3. Board content

### Shapes

| Key | Shape | Use |
|---|---|---|
| 1 | Rounded rectangle | Process step (default) |
| 2 | Diamond | Decision (outgoing arrows labelled) |
| 3 | Pill | Start / End |
| 4 | Parallelogram | Data in/out |
| 5 | Document | Document / report |
| 6 | Cylinder | Database / system of record |
| 7 | Hexagon | Preparation / trigger |
| 8 | Circle | Connector / join |
| 9 | Sticky note | Freeform note |

Other board items include free text, **groups** (labelled frames around steps) and **swimlanes** (horizontal bands). Swimlanes can be toggled on per board, and a step inside a lane takes that lane's owner.

### Step properties

All of these show on the step itself:
- **Actor:** Person, System or AI Agent, shown as a coloured left edge plus an icon.
- **Title**, plus an optional one-line **note**.
- **Owner:** free text (a person, a team, or an agent name like "Intake Agent").
- **Duration:** typed as `30m`, `2h`, `3d`, stored in minutes.
- **Status** (optional): idea, planned, active, done.
- **Replaces** (optional): free-text references to old-process steps. Shown in the step's hover card.

### Flags

Flags are badges on a step or an arrow: **Blocker** (red), **Warning** (amber) and **Question** (blue). Each has a short text and can be resolved. A Flags filter in the top bar lists every open flag, and clicking one pans to it.

### Arrows

| Type | Style | Meaning |
|---|---|---|
| Flow | solid | Next step |
| Dependency | dashed | Target cannot start until source is done |
| Handoff | dotted | Data or information passed |

Arrows can carry optional labels, route orthogonally around steps, and connect to any side of a step. A step with several incoming flow arrows is a join, which waits for all of them.

### Critical path

The critical path is the longest duration-weighted path through flow and dependency arrows (handoff arrows are ignored). Steps with no duration count as 0 and show a subtle "no duration" marker. Cycles are detected and reported as a warning rather than crashing the calculation. Turning it on highlights the path, dims everything else and shows the total duration. It recalculates live while the mode is on.

## 4. AI chat

### Loop

The server is a thin proxy that holds the API key. The agent loop runs in the client, where the board state lives:

1. The client sends the chat history, a board summary and the current selection to `POST /api/chat`.
2. The server streams Claude's response back as server-sent events (SSE).
3. For each tool call, the client applies the edit to the board through the same ops layer the UI uses, and collects the result.
4. If Claude stopped to use tools, the client sends the tool results back and the loop continues. It ends when Claude produces a final answer or after 12 rounds.

Edits appear on the board as each tool call arrives. The whole AI turn is one undo entry.

### Board summary sent per message

This is a compact text summary with no positions. Each step appears as its ID, title, shape, actor, owner, duration, lane, group and flags, and each arrow as `source -> target`, type and label. The summary also lists lanes, groups and the other boards' names. Step IDs are short and stable per board (`s1`, `s2`...), so Claude can refer to them. The current selection and any `@mentioned` steps are listed separately.

### Tools

| Tool | Effect |
|---|---|
| `add_steps` | Create one or more steps with properties, optionally placed after an anchor or in a lane/group |
| `update_steps` | Change any step properties |
| `delete_steps` | Delete, optionally reconnecting the steps before and after |
| `connect` / `disconnect` | Add or remove arrows (type, label) |
| `insert_between` | Change A→B into A→new→B |
| `branch_parallel` | From a step, create N parallel paths, optionally rejoining at a step |
| `move_steps` | Relative placement: after/before/above/below a step, into a lane or group |
| `add_flag` / `resolve_flag` | Flags on steps or arrows |
| `group` / `set_lanes` / `add_text` | Structure and annotation |
| `read_board` | Full summary of any board in the project |
| `create_board` | New board (e.g. "Future v1") |
| `tidy` | Auto-layout a board |

Claude never supplies coordinates. Placement works like this:
- **Small edits** use a local rule: a new step goes just downstream of its anchor, and steps further downstream shift along to make room. Everything else stays where you put it.
- **New boards, or explicit requests,** run a full ELK layered auto-layout.

Every tool validates its inputs, for example "unknown step s99" or "s3 and s7 are not connected". Errors go back to Claude as tool results so it can correct itself.

### Chat UX

- Responses stream in.
- Each AI turn ends with a one-line summary chip ("Added 3 steps, 1 parallel branch, 2 blockers") and an **Undo** button.
- Changed steps glow for about 2 seconds, and the view pans to them if they are off-screen.
- `@` autocompletes step titles.
- A model switch in the chat header offers Sonnet 5 (`claude-sonnet-5`, the default) and Opus 5.5 (`claude-opus-5-5`).
- Claude can answer questions without editing ("which human steps could an agent own?").

### Privacy

Step content, flags and board structure are sent to Anthropic only when a chat message is sent. The API key lives in `.env`, is read only by the server, and never reaches the browser.

## 5. Architecture

**Stack:**
- Vite + React + TypeScript for the app.
- React Flow (`@xyflow/react`) for the canvas.
- `elkjs` for auto-layout, run in a Web Worker.
- Zustand + Immer for state.
- Hono on Node for the server, with `@anthropic-ai/sdk`.
- Vitest and Playwright for tests.

```
src/
  model/        types, schema version, ID allocation
  ops/          pure board operations (add, connect, insertBetween, branchParallel, ...)
  analysis/     critical path, cycle detection, board summary for the LLM
  layout/       local placement rule, ELK worker
  store/        Zustand store, history (undo/redo), persistence client
  canvas/       React Flow nodes (one per shape), edges, handles, floating toolbar
  chat/         chat panel, agent loop, tool executor mapping tools -> ops
  ui/           top bar, board tabs, palette, flags filter, theme
server/
  index.ts      Hono app: /api/chat (SSE proxy), /api/projects (file storage)
```

**Key boundary: `ops/`.** Every board change goes through pure functions `(board, args) => { board, result }`: keyboard actions, toolbar clicks and AI tools alike. This makes the AI exactly as capable as the UI, and makes every operation testable without a browser.

### Data model (schema v1)

```ts
Project { id, name, schemaVersion, boards: Board[] }
Board   { id, name, direction: 'LR' | 'TB', nodes: Node[], edges: Edge[], lanes: Lane[], nextId }
Node    { id, kind: 'step' | 'text' | 'group', shape, actor, title, note, owner,
          durationMin, status, replaces, laneId, groupId, flags: Flag[],
          x, y, w, h, color }
Edge    { id, source, target, sourceSide, targetSide, type: 'flow' | 'dependency' | 'handoff',
          label, flags: Flag[] }
Lane    { id, name, order, height }
Flag    { id, kind: 'blocker' | 'warning' | 'question', text, resolved }
```

## 6. Saving, undo, export

- **Storage:** projects save as one JSON file each in a local `workspace/` folder, written through the server. Autosave runs 500ms after the last change, and the top bar shows "Saved" or "Saving...". Writes go to a temporary file and are then renamed into place, so a crash cannot corrupt a project. The storage interface (`list/load/save/delete`) is the seam for a future hosted database.
- **Undo:** a history of immutable snapshots (Immer structural sharing keeps this cheap), capped at 200 entries. A drag, a typing session or an AI turn each counts as one entry.
- **Export:** PNG and SVG of the board or the selection, and JSON of the project. JSON import restores a project.
- **Migrations:** `schemaVersion` is checked on load, and migrations run in order.

## 7. Visual design

- Clean, calm canvas: a soft dot grid, light and dark themes (following the system setting by default), and the Inter font.
- Actor colours: Person is warm blue, System is slate, AI Agent is violet. Flag colours are reserved (red, amber, blue) and not used for anything else.
- Steps have soft shadows and rounded corners, and the selected step gets a clear focus ring. The floating toolbar fades in within 100ms.
- All colours are defined once as design tokens, in both themes.

## 8. Testing

- **Unit (Vitest):**
  - every op in `ops/`, including edge cases: insert between steps that aren't connected, a branch rejoining at a step upstream of the split, deleting a join;
  - critical path, including cycles, missing durations and parallel joins;
  - the board summary format;
  - the tool executor's argument validation.
- **Agent loop:** replays recorded Claude tool-call sequences against the executor with no network, covering insert-between, parallel split, and a full "draft a future board" run.
- **End to end (Playwright):** keyboard-only build of a flow; hover-handle connect; shape switching; flags; critical path toggle; undo/redo; autosave and reload. One opt-in live-API smoke test sends a real chat command and asserts the resulting graph.
- **Performance check:** a generated 1000-step board, measuring pan/zoom frame time.

## 9. Out of scope for v1

Accounts, hosted deployment, real-time co-editing, comments, cross-board step linking beyond the free-text `replaces` field, and import from Visio or Lucidchart.
