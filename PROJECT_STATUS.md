# Project status

**As of:** 2026-09-26

## Complete
- v1 as specified in `docs/superpowers/specs/2026-09-25-flowstate-design.md`: infinite canvas with 9 shapes, free text, groups and swimlanes; actors, durations, owners, status and flags; flow, dependency and handoff arrows; parallel branches; live critical path; keyboard-first editing and floating toolbars; boards, reference view and projects; autosave with undo/redo; PNG, SVG and JSON export and import; Claude chat that edits the board through the same operations as the UI. Merged to `master`.

## In flight
- Human playtest of the full app (keyboard-only and chat-only builds against the 2-minute target in the spec).
- Live API check: `$env:LIVE_API=1; npx playwright test tests/e2e/live.spec.ts` plus one real "draft an agentic version" request. Needs the user's go-ahead because it spends API credit.

## Ideas and deferred
- Trim board summaries from older chat messages so long chats stop growing in cost.
- Detect a second tab on the same project (revision check on save or a BroadcastChannel warning).
- Close the resize undo entry when a touch-screen resize is interrupted by an unmount (mouse already works).
- Decide whether single-letter shortcuts should yield to typing-to-edit.
- Layout items to judge in the playtest: toolbar covering the top plus button, plus buttons overlapping arrows, arrow toolbar hiding titles on short arrows, status dot outside decision and connector shapes, wide laned boards opening at low zoom.
- Small cleanups: cache lane nodes and prune render caches, share one critical-path computation between canvas and top bar.

## Scrapped
- None.

## Heading
Playtest, then polish from its findings, then team sharing: hosted storage behind authentication and real-time co-editing (Yjs), which ADR 0002 and ADR 0004 anticipate.

## Timeline
| Date | Milestone |
|---|---|
| 2026-09-25/26 | Spec, plan, v1 built and merged; private GitHub repo created |
