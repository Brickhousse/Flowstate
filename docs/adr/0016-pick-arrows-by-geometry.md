# 0016: Arrow clicks are resolved from the routes, and side dots do not connect on click

Status: Accepted (2026-09-27)

## Context
Arrows leaving the same side share a line, so React Flow's DOM hit testing only ever reaches the top one. Arrows also start and end on the invisible side dots, whose hit rings sit above the edge layer, so a click near an arrow end landed on a dot and started React Flow's click-to-connect.

## Decision
- On a plain click on an arrow or a side dot, find every arrow within reach of the point from the computed routes, in stacking order (`src/canvas/pick/arrowsAt.ts`). Select the top one; when there are two or more, open a list to pick from.
- Reach is `9 * max(1, 1 / zoom)` board units: never less than React Flow's hit stroke (`interactionWidth` 18, drawn in board units), and never less than 9 screen pixels when zoomed out.
- `connectOnClick={false}`. A dot click is taken in a window capture listener before React sees it, so the step under the dot is not selected instead. A press that moves past React Flow's `connectionDragThreshold` is left alone, so dragging from a dot still connects.
- A dot click that finds an arrow stops there, including the second click of a double-click. One that finds none goes on to React Flow, which selects the step.
- A click on an arrow always keeps the arrow React Flow reports first, because its hit stroke follows the rounded corners and the reach does not.

Rejected:
- Click-cycling through stacked arrows: the user judged it undiscoverable.
- DOM hit testing (`elementsFromPoint`): it misses arrows under dots and boxes.

## Consequences
- Clicking a side dot selects the step only when no arrow is in reach.
- An arrow hidden under a box is listed when the click lands on another arrow or a dot, but a click on the box itself still selects the box.
