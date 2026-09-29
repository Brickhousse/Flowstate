# Session log

One entry per working session, most recent first. Long-term status lives in `PROJECT_STATUS.md`.

### ⚠️ Session 2026-09-27/28: arrow routing through Task 15, two playtest rounds, SRP refactor

**Arrow routing (`feat/arrow-routing`, 54 commits, nothing pushed).**
- Tasks 3 to 15 of 20 built, each reviewed, with a fix round where a review found issues.
- Budget checkpoints (Tasks 6 and 13) passed with no scale-back: drag p95 33.4ms (limit 35.4), open 465 to 530ms (limit 532.4). A second budget board now measures real "Don't merge" shifting.
- Playtest (Task 11, two rounds) led to fixes 10a to 10d: every arrow can be reshaped, overlapping arrows get a pick panel merged with the arrow's options (ADR-0016), a click on an arrow end over a side dot selects the arrow, and arrows have a colour (ADR-0017).
- The user asked for the single responsibility principle: an audit led to refactors 15a to 15c (polyline module, `carryBends`, `Popup`/`MenuList`/`usePopupDismiss`, `usePickPanel`/`useSideDotClicks`, `reshape.ts` with reshape and reattach sessions, `sideDots.ts`).
- Route around boxes: fixed a plan bug that left 10.5px stubs, and made the search table-based (0 of 100 searches over 50ms on 200 boxes).

**Other.**
- SVG export is broken at its root (HTML in `foreignObject`: black step shapes, partial background, about 4MB). Decided: SVG, and PNG drawn from it, move onto the export work's vector renderer.
- Multi-paragraph step notes are the next feature after arrow routing.

**Operational mutations (all authorized):**
- Stopped four leftover dev-server process trees from 2026-09-25/26, including a half-dead app (web up, API down).
- Created the worktree `D:\Projects\Flowstate-live` (ran `sfw npm ci`; `feat/layout-assists` checked out there) and started the live app from it in a minimized window "Flowstate (live)" on 5173/8797 against the real `workspace/`.
- A playtest copy of this branch runs in a window "Flowstate playtest (arrow routing)" on 5175/8789 against a scratch copy of the workspace (schema 2). Still running at close.
- The real project stays schema 1. Schema 2 (unreleased) now also adds arrow `color`. Nothing pushed or merged.

**Lessons:**
- Open-time budget medians vary about 463 to 542ms on this machine; judge "fails twice" per test on consecutive runs.
- The original perf board never shifts separate arrows (every arrow stays in one row); the cross-row board does.
- Later plan tasks reference helpers the SRP refactor moved; each dispatch carries the substitutions recorded in the SDD ledger.
- Left and right clicks on arrows must share one hit function (Task 16 ruling in the ledger).

**State at close / next session:** see `PROJECT_STATUS.md`. Resume the arrow-routing SDD run from its ledger: Task 15's scoped re-review, then Tasks 16 to 19 and the final review.

### ⚠️ Session 2026-09-26/27: layout assists finished, arrow routing and export specced, arrow routing slice 1 started

**Layout assists.**
- Tasks 7 to 14 were built and reviewed on `feat/layout-assists`:
  - Ctrl+drag copy;
  - align, distribute, match size and layer order;
  - custom colour;
  - Ctrl+X, nudge and layer shortcuts;
  - the right-click menu;
  - AI `arrange`.
- The whole-branch review found two Important menu bugs, now fixed: a lost custom-colour pick when the picker blurs the window, and keys leaking to the canvas under an open menu.
- A smoke test on an isolated instance passed.
- Step titles now fit the box height instead of a fixed 3 lines (`ba3ee43`).
- The branch awaits the user's Tasks 7 to 13 playtest and merge.

**Arrow routing.**
- Arrow routing and interactive HTML/PDF export were designed and specced.
- The arrow routing plan (20 tasks) is written. Tasks 0 to 2 are done on `feat/arrow-routing`, which branches off `feat/layout-assists`:
  - performance baselines: 33.4ms p95 drag, 484ms open;
  - schema 2;
  - the React Flow route port.
- The SDD ledger at `.superpowers/sdd/2026-09-27-arrow-routing/progress.md` resumes at Task 3.

**Operational mutations (all authorized):**
- Created branch `feat/arrow-routing` off `feat/layout-assists` (`d9d7c01`). Nothing was pushed or merged.
- The project file format is schema 2 on `feat/arrow-routing`: the first migration, which adds `separate` and `bends` to arrows. A project saved while running that branch will not open on `feat/layout-assists` or `master`.
- Claude Code stopped the background dev server (5173/8797) and the smoke instance under memory pressure. No data was affected. Neither was restarted.
- Deleted the layout-assists SDD workspace after its final review. Its rulings were reported in chat, and its follow-ups moved to `PROJECT_STATUS.md`.

**Lessons:**
- Back up `workspace/` before running `feat/arrow-routing` against real projects (schema 2).
- Smoke-test on an isolated instance so saved projects are never touched: Vite on 5175, `FLOWSTATE_API_PORT=8789`, and `FLOWSTATE_WORKSPACE` pointing at a scratch folder.
- A selected step's floating toolbar can cover a neighbour's centre, so presses there hit the toolbar.
- Playwright MCP writes `.playwright-mcp/` into the repo root. Delete it after smoke runs.
- Run Playwright with `--workers=2` on this machine.

**State at close / next session:** see `PROJECT_STATUS.md`. Resume the arrow-routing SDD run at Task 3 (`/catch-me-up`, then "resume the arrow-routing SDD run").

### ✅ Session 2026-09-26: layout-assists playtest approved

The user approved the playtest of Tasks 1 to 6 with no issues. The SDD ledger records it; Task 7 is next. No code changed.

**Operational mutations (all authorized):**
- Removed seven docs-only commits for a separate project from `feat/layout-assists` (reset to `91c9078`). They were never pushed and are preserved elsewhere.
- Snapshotted the user's project to `D:\Projects\Flowstate-backups\` (outside the repo).

**Lessons:**
- `workspace/` is git-ignored, so `git clean -fdx` deletes saved projects; snapshots live in `D:\Projects\Flowstate-backups\`.

**State at close / next session:** see `PROJECT_STATUS.md`. Resume the layout-assists SDD run at Task 7.

### ⚠️ Session 2026-09-26: layout assists specced, planned, and 6 of 14 tasks built (paused for playtest)

The user asked for PowerPoint-style layout comfort:
- snap to grid, smart and spacing guides
- a right-click menu with align, distribute, match size, arrange and colour
- Ctrl+drag copy, standard shortcuts, and working dot-to-dot connections
- AI parity for alignment

**Spec and plan:**
- Brainstormed, then wrote the spec and hardened it with an adversarial review against React Flow's source. The review found that the final drag change is unsnapped, the menu must open on pointerup, selection raises nodes, and undoing a nudge is blocked while a change is open.
- Wrote a 14-task plan.

**Built on `feat/layout-assists` with subagent-driven development (Tasks 1 to 6):**
- A connection-dot hit-area fix (the title body covered the dot).
- Per-user layout switches, the Layout menu and Ctrl+'.
- A pure snapping engine and candidate picker.
- Drag snapping with guides, Shift lock and Alt suspend.
- Resize snapping.

Every task passed review. Fix rounds caught:
- Shift+drag deselecting the grabbed node.
- Stale `measured` sizes making a second resize drift.

Found and fixed one pre-existing bug: Shift+drag on a node never dragged (ADR 0008). Decisions are captured in ADR 0008 to 0010.

Tests are green: typecheck, 273 unit tests, and the assists, canvas and interactions browser suites. A 1000-step board drags at a p95 of about 17ms.

The user also set the next AI direction: an on-request co-building assistant that proposes steps as dashed suggestions (in PROJECT_STATUS).

**Operational mutations (all authorized):**
- None remote. No push, and `master` is still 1 commit ahead of `origin` from the previous session.
- Local only:
  - Created branch `feat/layout-assists`.
  - Added `.superpowers/` to `.git/info/exclude` so the SDD workspace stays out of commits.
  - Left the dev server running on ports 5173 and 8797 for the playtest.

**Lessons:**
- Snapping lives in `Canvas.onNodesChange` through `useDragAssist`. Read ADR 0009 before touching drag or resize wiring.
- Seed repro tests with long titles. The connection-dot overlap only appears once a title wraps.
- Step edge resize lines sit under the shape and the + buttons, so browser tests resize from corner handles.
- `.superpowers/` holds the SDD ledger and is excluded only in `.git/info/exclude`. `git clean -fdx` would wipe it.
- Promoted to the Brain:
  - new: Playwright drag threshold, SVG line visibility, and test helpers added in the task that first uses them
  - updated: repro fixtures, verifying reviewer claims, and React Flow gotchas

**State at close / next session:** see `PROJECT_STATUS.md`. Next: collect the user's playtest notes on Tasks 1 to 6, then resume the SDD run at Task 7. The ledger is at `.superpowers/sdd/2026-09-26-layout-assists/progress.md`.

### ✅ Session 2026-09-25/26: Flowstate v1 designed, planned, built, merged

Brainstormed the product with the user, wrote the spec, then a 19-task plan that an expert validated by extracting and running every code block against the real packages. Built it with subagent-driven development: a fresh implementer per task, a task review after each, about 30 defects in the plan's own code fixed along the way, then a whole-branch Opus review and one fix wave (turn board pinning, local API guard, full project validation). Merged `build/flowstate-v1` into `master`: typecheck clean, 247 unit tests and 56 browser tests pass (live API test skipped), build passes, 1000-step board pans at 60fps. Decisions captured in ADR 0001 to 0007.

**Operational mutations (all authorized):**
- Created private GitHub repo `Brickhousse/Flowstate` and pushed `master`.
- Stopped leftover Flowstate Vite/tsx dev processes holding ports 5173 and 8797 (twice); left the unrelated Python service on 8787 untouched.

**Lessons:**
- Port 8787 is taken on this machine, so the dev API defaults to 8797 (`FLOWSTATE_API_PORT` overrides).
- Stopping a background `npm run dev` from Claude Code leaves Vite and tsx running; free ports 5173/8797 before starting another dev server.
- Browser tests clear `.e2e-workspace` per run and force `ANTHROPIC_API_KEY` empty unless `LIVE_API` is set.
- Playwright on Windows occasionally crashes a worker natively (0xC0000409); rerun once before investigating.
- Single-letter shortcuts beat typing-to-edit on a selected step; words starting with A, B, W, Q, T, C or L need F2 or double-click.

**State at close / next session:** see `PROJECT_STATUS.md` (playtest and the live API check are next).
