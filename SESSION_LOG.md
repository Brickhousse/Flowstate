# Session log

One entry per working session, most recent first. Long-term status lives in `PROJECT_STATUS.md`.

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
