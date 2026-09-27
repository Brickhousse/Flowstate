# Project status

**As of:** 2026-09-26

## Complete
- v1 as specified in `docs/superpowers/specs/2026-09-25-flowstate-design.md`: infinite canvas with 9 shapes, free text, groups and swimlanes; actors, durations, owners, status and flags; flow, dependency and handoff arrows; parallel branches; live critical path; keyboard-first editing and floating toolbars; boards, reference view and projects; autosave with undo/redo; PNG, SVG and JSON export and import; Claude chat that edits the board through the same operations as the UI. Merged to `master`.
- Layout assists: all 14 tasks built on `feat/layout-assists`, drag and resize snapping with smart guides and spacing guides, Ctrl+drag copy, align and distribute, custom colour, Ctrl+X, nudge and layer shortcuts, the right-click menu, and AI arrange. Awaiting a final playtest and merge.

## In flight
- Playtest layout assists Tasks 7 to 13 (Ctrl+drag copy, right-click menu including Shift+F10, align and distribute, layer order, custom colour, Ctrl+arrow nudge, Ctrl+X), then merge `feat/layout-assists`. Also check: menu Custom colour in Firefox (the picker blurs the window), no native menu beside ours on Shift+F10, and Alt held before a drag then Delete.
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
- Layout assists follow-ups from the whole-branch review:
  - macOS Ctrl+click opens no canvas menu (ADR 0012).
  - The menu's Custom colour is not reachable by keyboard.
  - The perf gate (p95 under 50ms) is too loose to catch a regression.
  - Tidy and its failure toast are repeated in three places.
  - The `XY` type is defined three times.
  - `endResize` belongs beside the resize wiring, not in `overlay.ts`.
  - Right-clicking the node toolbar or an edge label opens the pane menu.

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
| 2026-09-26 | Layout assists Tasks 7 to 14 built and reviewed |
