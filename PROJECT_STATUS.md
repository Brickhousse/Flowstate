# Project status

**As of:** 2026-09-29

## Complete
- v1 as specified in `docs/superpowers/specs/2026-09-25-flowstate-design.md`: infinite canvas with 9 shapes, free text, groups and swimlanes; actors, durations, owners, status and flags; flow, dependency and handoff arrows; parallel branches; live critical path; keyboard-first editing and floating toolbars; boards, reference view and projects; autosave with undo/redo; PNG, SVG and JSON export and import; Claude chat that edits the board through the same operations as the UI. Merged to `master`.
- Layout assists: all 14 tasks built on `feat/layout-assists`, drag and resize snapping with smart guides and spacing guides, Ctrl+drag copy, align and distribute, custom colour, Ctrl+X, nudge and layer shortcuts, the right-click menu, and AI arrange. Step titles now fit the box height. Awaiting a final playtest and merge.
- Arrow routing: attach an arrow to any side dot, "Don't merge" for its own line, hand-shaped arrows with segment bars and bend squares, route around boxes, arrow colour, an arrow right-click menu, and the assistant's `update_arrows`, within the measured drag and load budget (ADR 0014, ADR 0015). Built on `feat/arrow-routing`; awaiting the final playtest and merge.
- Step notes: a multi-paragraph note in a panel under the step (toolbar Note button, Shift+F2, or the marker on the box), readable in the reference view, saved on every close as one undo step (ADR 0019). The assistant puts explanations in the note, sees notes cut at 300 characters marked `note-truncated`, and reads the rest with `read_notes`. Built on `feat/step-notes`; awaiting the final playtest and merge after `feat/arrow-routing`.

## In flight
- Playtest layout assists Tasks 7 to 13 (Ctrl+drag copy, right-click menu including Shift+F10, align and distribute, layer order, custom colour, Ctrl+arrow nudge, Ctrl+X), then merge `feat/layout-assists`. Also check: menu Custom colour in Firefox (the picker blurs the window), no native menu beside ours on Shift+F10, Alt held before a drag then Delete, and dragging steps taller and shorter. The live app now runs this branch from the `D:\Projects\Flowstate-live` worktree (5173/8797, real workspace), so everyday use doubles as the playtest.
- Final playtest of arrow routing, then merge `feat/arrow-routing`. Schema 2 (arrow `separate`, `bends`, `color`) does not open on older branches, so never run this branch against the real `workspace/`; a playtest copy runs on 5175 against a scratch copy. The user deferred it on 2026-09-28; checklist:
  1. Two arrows leaving the same side, both "Don't merge": do they spread without crossing at the box?
  2. An arrow sharing a line, "Don't merge": does it move off while the other stays put?
  3. Route around boxes under a step: sensible route? Any false "no route", especially with a step close to an arrow end?
  4. Several arrows, Reset path or Don't merge from the menu: one Ctrl+Z?
  5. Right-click an arrow's label, a bend square and a side dot: always the arrow menu? Colour placement and swatches beside the step menu's?
  6. Bend an arrow far out, then pan so only the bend is on screen: does it stay drawn, clickable and right-clickable (ADR-0018)?
  7. End drag: only the circle moves and the aimed dot has no highlight; after a drop the circles partly cover the arrowhead. Acceptable?
  8. Labelled straight arrow: is the drag bar hidden under the label?
  9. Overlapping arrows: pick list position and hover glow OK?
  10. With API credit approved: "attach the arrow from A to B to the bottom of A".
  11. Anything wrong on existing boards?
- Final playtest of step notes, then merge `feat/step-notes` (after `feat/arrow-routing`). The user was away when it was built; checklist:
  1. Write a two-paragraph note from the toolbar Note button; close with Escape; the box shows the first line and the marker; one Ctrl+Z removes the note.
  2. Select a step, Shift+F2, write, Ctrl+Enter.
  3. Click the marker on an unselected step: the note opens, the step is not selected; press-and-drag on the marker does not move the step; a second click closes it.
  4. A long note: the textarea grows to about 12 lines, then scrolls; the wheel inside scrolls it; the wheel outside closes it.
  5. A single-line note too long for the box shows the marker; widening the box until it fits removes it.
  6. Alt-tab away mid-note and back: the panel is still open with the text.
  7. Reference view (Shift+click a board tab): the marker opens the note as read-only paragraphs.
  8. Export PNG: no marker in the image.
  9. Light and dark theme, low zoom, a sticky note and a decision shape: does the marker look right? After a marquee selection, can you still click a marker?
  10. With API credit approved: ask the assistant to explain a step (the explanation goes in the note, the title stays short), and to edit a note longer than 300 characters (nothing is lost).
  11. Right-click in the note text: the browser menu shows spelling suggestions and paste.
  12. Tab out of the note: it saves and closes.
  13. While reading a reference note, keys (Delete, Tab, arrows) do nothing to the active board.
  14. A note on a step near the bottom edge of the window, and Shift+F2 on a selected step that is off screen: where does the panel land?
  15. With API credit approved: ask the assistant to change the step whose note is open. Does the panel stay put, and does a deleted step say "Note not saved"?
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
  - Keep an arrow's colour and "Don't merge" when the assistant replaces it (`insert_between`, `delete_steps` with reconnect, `branch_parallel` in `src/ops/structure.ts`).
  - Open the arrow menu from the keyboard: Shift+F10 does nothing when only arrows are selected.

## Scrapped
- None.

## Heading
Finish layout assists, arrow routing and step notes, then interactive HTML and PDF export (specced in `docs/superpowers/specs/2026-09-27-interactive-html-and-pdf-export-design.md`, now also moving SVG and PNG export onto its renderer), then the co-building assistant, then team sharing: hosted storage behind authentication and real-time co-editing (Yjs), which ADR 0002 and ADR 0004 anticipate.

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
| 2026-09-28/29 | Step notes specced, planned and built; awaiting playtest and merge |
