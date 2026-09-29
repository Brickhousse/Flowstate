# 0018: Arrows React Flow culls are drawn by an overlay while their route is on screen

Status: Accepted (2026-09-29)

## Context
`onlyRenderVisibleElements` in `src/canvas/Canvas.tsx` makes React Flow mount only the nodes and edges that overlap the pane. One flag couples both: there is no per-edge override, and an edge is visible only when the bounding box of its two boxes overlaps the pane (`isEdgeVisible` in `@xyflow/system`, read by `useVisibleEdgeIds` in `@xyflow/react`). Flowstate draws its own routes (ADR-0014), and a hand-shaped or routed-around route can run far outside that box, so the arrow vanished while only its detour was on screen and popped back when a box came into view.

Turning culling off was measured first (`.superpowers/sdd/2026-09-27-arrow-routing/culling-fix-report.md`): the 200-step budget still passed, but the 1000-step drag p95 went from 16.8ms to about 150ms and the 1000-step pan p95 from 16.7ms to 33 to 50ms, against an always-on limit of 50ms. Part of that cost was Canvas handing React Flow fresh handler identities on every render, which re-rendered every mounted node and edge wrapper per drag frame; fixing that alone took the 200-step drag p95 from 33.4ms to 16.7ms but left culling off at 83 to 100ms.

## Decision
- Culling stays on. `src/canvas/culled/CulledArrows.tsx` draws, in a `ViewportPortal`, exactly the arrows React Flow culled whose route overlaps the pane, and nothing while exporting, because exports turn culling off.
- It decides from React Flow's own store (`nodeLookup`, pane width and height, transform) with `isEdgeVisible` ported line for line into `src/canvas/culled/edgeVisible.ts`, because `@xyflow/react` does not export it and `@xyflow/system` is not a declared dependency. `edgeVisible.test.ts` compares the port with the installed `@xyflow/system` on random panes and at the exact edges of the two-box bounds, so React Flow and the overlay never both draw or both skip an arrow.
- Only an arrow whose route leaves its two-box bounds can be culled while on screen. `culling.ts` picks those candidates once per routes or nodes change, with the route's bounding box cached per Route object, so a pan frame tests that small set (20 of 200 arrows on the perf board with detours).
- `Arrow.tsx` is the one drawing unit (path, arrowhead, label, toolbar, handles). React Flow's `FlowEdge` and the overlay both render it, so a culled arrow looks and behaves the same, including selection, critical and dimmed styling. The arrowhead url is a port of React Flow's marker id (`markerUrl.ts`); the marker definitions exist for every edge in the store.
- The overlay group carries React Flow's edge class and `data-id`, so its pan filter, the arrow picker (ADR-0016) and the right-click menu treat it as an arrow line, and a click selects through React Flow's store actions, so the same node and edge changes reach the Flowstate store as for a mounted arrow.
- The layer follows the nodes in the DOM, so a plain arrow draws at z-index -1 (under the steps, over groups and lanes, as React Flow's edges do) and a critical arrow keeps its z-index 1.

Rejected:
- Culling off: drag p95 150ms and pan p95 up to 50ms on the 1000-step board, a user-visible regression, and the always-on perf assertions fail.
- Culling off with a viewport-filtered `nodes` array instead: React Flow draws no edge whose node is missing from the array, so the same arrows would vanish, and every edge wrapper would stay mounted.
- Importing `isEdgeVisible` from `@xyflow/system`: an undeclared transitive dependency, or a second declared copy that can drift from the one React Flow runs.
- Owning edge culling by rendering every edge through the overlay: it would take over React Flow's edge layer and its interaction code for one bug.
- Leaving it a documented limit: the arrow vanishes exactly where the user shaped it, which reads as lost work.

## Consequences
- Two draw paths share one drawing unit. A change to how an arrow looks or behaves goes into `Arrow.tsx`, not `FlowEdge.tsx` or `CulledArrows.tsx`.
- A React Flow upgrade that changes `isEdgeVisible`, its inputs in `useVisibleEdgeIds`, the marker id format or the edge class name must be checked: `edgeVisible.test.ts` catches the first, and `tests/e2e/arrows.spec.ts` ("drawn exactly once as its box pans onto the screen") catches a double draw and a marker mismatch.
- The layer tests the route's bounding box, not the stroke: a hairline of stroke or arrowhead beyond that box is not drawn while the box is off screen.
- The candidate set is refreshed when React Flow's `nodes` array changes; a measurement that resizes a node without that array changing waits one render.
- A wheel zoom during a handle drag can hand the arrow between the two draw paths, which ends the drag, as culling already did for a mounted arrow.
- A culled arrow is not a tab stop, which a mounted edge is through React Flow's default `tabIndex`; keyboard a11y is disabled on the canvas.
- `tests/e2e/perf.spec.ts` pans a board where 20 arrows have long detours and holds it to the pan budget (ADR-0015).
