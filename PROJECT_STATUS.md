# Project status

**As of:** 2026-09-26

## Complete
- v1 as specified in `docs/superpowers/specs/2026-09-25-flowstate-design.md`: infinite canvas with 9 shapes, free text, groups and swimlanes; actors, durations, owners, status and flags; flow, dependency and handoff arrows; parallel branches; live critical path; keyboard-first editing and floating toolbars; boards, reference view and projects; autosave with undo/redo; PNG, SVG and JSON export and import; Claude chat that edits the board through the same operations as the UI. Merged to `master`.

## In flight
- Layout assists on branch `feat/layout-assists` (spec `docs/superpowers/specs/2026-09-26-layout-assists-design.md`, plan `docs/superpowers/plans/2026-09-26-layout-assists.md`). Tasks 1 to 6 of 14 are done: connection-dot fix, per-user Layout switches, and drag and resize snapping with smart guides, spacing guides, Shift lock and Alt suspend. The user's playtest of Tasks 1 to 6 passed with no issues. Next are Tasks 7 to 14: Ctrl+drag copy, align and distribute, custom colour, Ctrl+X, nudge and layer shortcuts, the right-click menu, and AI arrange.
- Human playtest of the full app (keyboard-only and chat-only builds against the 2-minute target in the spec).
- Live API check: `$env:LIVE_API=1; npx playwright test tests/e2e/live.spec.ts` plus one real "draft an agentic version" request. Needs the user's go-ahead because it spends API credit.

## Ideas and deferred
- Trim board summaries from older chat messages so long chats stop growing in cost.
- Detect a second tab on the same project (revision check on save or a BroadcastChannel warning).
- Close the resize undo entry when a touch-screen resize is interrupted by an unmount (mouse already works).
- Decide whether single-letter shortcuts should yield to typing-to-edit.
- Layout items the Tasks 1 to 6 playtest did not flag, still worth a look: toolbar covering the top plus button, plus buttons overlapping arrows, arrow toolbar hiding titles on short arrows, status dot outside decision and connector shapes, wide laned boards opening at low zoom.
- Co-building assistant (next AI feature after layout assists). On request, the assistant infers what a step needs, such as inputs that feed into it and both outcomes of a decision. It flags gaps as questions and adds its steps and arrows as dashed proposals the user accepts or dismisses. Needs its own spec. Likely starts with a `feeds_into` option on `add_steps`.
- Step edges resize only from the corners, because the edge midpoints hold the + buttons.
- Small cleanups: cache lane nodes and prune render caches, share one critical-path computation between canvas and top bar.

## Scrapped
- None.

## Heading
Finish layout assists, then the co-building assistant, then team sharing: hosted storage behind authentication and real-time co-editing (Yjs), which ADR 0002 and ADR 0004 anticipate.

## Timeline
| Date | Milestone |
|---|---|
| 2026-09-25/26 | Spec, plan, v1 built and merged; private GitHub repo created |
| 2026-09-26 | Layout assists specced and planned; Tasks 1 to 6 built on `feat/layout-assists` |
| 2026-09-26 | Tasks 1 to 6 playtest approved |
