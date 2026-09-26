# Session log

One entry per working session, most recent first. Long-term status lives in `PROJECT_STATUS.md`.

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
