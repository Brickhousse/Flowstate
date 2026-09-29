# Project status

**As of:** 2026-09-28

## Complete
- v1 as specified in `docs/superpowers/specs/2026-09-25-flowstate-design.md`: infinite canvas with 9 shapes, free text, groups and swimlanes; actors, durations, owners, status and flags; flow, dependency and handoff arrows; parallel branches; live critical path; keyboard-first editing and floating toolbars; boards, reference view and projects; autosave with undo/redo; PNG, SVG and JSON export and import; Claude chat that edits the board through the same operations as the UI. Merged to `master`.
- Layout assists: all 14 tasks built on `feat/layout-assists`, drag and resize snapping with smart guides and spacing guides, Ctrl+drag copy, align and distribute, custom colour, Ctrl+X, nudge and layer shortcuts, the right-click menu, and AI arrange. Step titles now fit the box height. Awaiting a final playtest and merge.
- Arrow routing: attach an arrow to any side dot, "Don't merge" for its own line, hand-shaped arrows with segment bars and bend squares, route around boxes, arrow colour, an arrow right-click menu, and the assistant's `update_arrows`, within the measured drag and load budget (ADR 0014, ADR 0015). Built on `feat/arrow-routing`; awaiting the final playtest and merge.

## In flight
- Playtest layout assists Tasks 7 to 13 (Ctrl+drag copy, right-click menu including Shift+F10, align and distribute, layer order, custom colour, Ctrl+arrow nudge, Ctrl+X), then merge `feat/layout-assists`. Also check: menu Custom colour in Firefox (the picker blurs the window), no native menu beside ours on Shift+F10, Alt held before a drag then Delete, and dragging steps taller and shorter. The live app now runs this branch from the `D:\Projects\Flowstate-live` worktree (5173/8797, real workspace), so everyday use doubles as the playtest.
- Final playtest of arrow routing ("Don't merge", route around boxes, arrow colour, the right-click menu, the assistant's `update_arrows`), then merge `feat/arrow-routing`. Schema 2 (arrow `separate`, `bends`, `color`) does not open on older branches, so never run this branch against the real `workspace/`; a playtest copy runs on 5175 against a scratch copy.
- Human playtest of the full app (keyboard-only and chat-only builds against the 2-minute target in the spec).
- Live API check: `$env:LIVE_API=1; npx playwright test tests/e2e/live.spec.ts` plus one real "draft an agentic version" request. Needs the user's go-ahead because it spends API credit.

## Ideas and deferred
- SVG export is broken: it wraps HTML in `foreignObject`, so step shapes render black, the background covers only part of the image, files are about 4MB, and design tools cannot open it. Decided: SVG, and PNG drawn from it, move onto the export work's vector renderer.
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
  - `endResize` belongs beside the resize wiring, not in `overlay.ts`.
  - Right-clicking the node toolbar or the arrow toolbar opens the pane menu.
- Arrow routing follow-ups from the whole-branch review:
  - Cull arrows by their route bounds, so bent arrows do not vanish while panning (needs a budget rerun).
  - Keep an arrow's colour and "Don't merge" when the assistant replaces it (`insert_between`, `delete_steps` with reconnect, `branch_parallel` in `src/ops/structure.ts`).
  - Open the arrow menu from the keyboard: Shift+F10 does nothing when only arrows are selected.

## Scrapped
- None.

## Heading
Finish layout assists, then arrow routing, then multi-paragraph step notes (a multi-line note that keeps paragraphs, a marker on the box, and the assistant told to put spoken explanations there), then interactive HTML and PDF export (specced in `docs/superpowers/specs/2026-09-27-interactive-html-and-pdf-export-design.md`, now also moving SVG and PNG export onto its renderer), then the co-building assistant, then team sharing: hosted storage behind authentication and real-time co-editing (Yjs), which ADR 0002 and ADR 0004 anticipate.

## Timeline
| Date | Milestone |
|---|---|
| 2026-09-25/26 | Spec, plan, v1 built and merged; private GitHub repo created |
| 2026-09-26 | Layout assists specced and planned; Tasks 1 to 6 built on `feat/layout-assists` |
| 2026-09-26 | Tasks 1 to 6 playtest approved |
| 2026-09-26 | Layout assists Tasks 7 to 14 built and reviewed |
| 2026-09-27 | Title fit; arrow routing and HTML/PDF export specced; arrow routing plan written, Tasks 0 to 2 built |
| 2026-09-27/28 | Arrow routing Tasks 3 to 15 with two playtest rounds and an SRP refactor; live app moved to a worktree |
| 2026-09-28 | Arrow routing Tasks 16 to 19: arrow menu, assistant update_arrows, docs; awaiting playtest and merge |
