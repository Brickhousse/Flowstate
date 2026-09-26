# 0009: Snapping rewrites React Flow's node changes instead of using its snapToGrid

Status: Accepted (2026-09-26)

## Context
The layout assists spec (`docs/superpowers/specs/2026-09-26-layout-assists-design.md`, section 2) requires several things at once. Smart guides and equal spacing must beat the 20px grid. Alt must suspend all snapping, and Shift must lock a drag to one axis, both taking effect live mid-drag. Each assist must switch off independently. Resizes must snap only the edge being dragged.

React Flow offers a `snapToGrid` prop. It snaps the pointer position inside `XYDrag` before any app code sees it, so a guide cannot override the grid. Toggling it for Alt or a preference means re-rendering the whole canvas.

Two React Flow behaviours also constrain where snapping can live:
- The drag-end change (`updateNodePositions(dragItems, false)`) carries XYDrag's own unsnapped positions. It lands before `onNodeDragStop`.
- `XYResizer` starts each resize from `node.measured`. Its final `resizing: false` change repeats the unsnapped size.

## Decision
Snapping math is pure and UI-free, in `src/canvas/assist/snap.ts` and `candidates.ts`.

`useDragAssist` opens a session at drag start. It records start positions and picks up to 200 candidate boxes once.

`Canvas.onNodesChange` rewrites changes before they reach the board:
- Every position change during an active session is rewritten, including the final `dragging: false` one.
- Every `resizing: true` dimension change is rewritten.
- `measured` records the snapped size, and React Flow's `resizing: false` change is ignored, so the next resize starts from what is on screen.

Guides render from a separate small store in a `ViewportPortal`, so a move only re-renders the overlay.

Rejected:
- React Flow's `snapToGrid`: guides could not win over the grid, and Alt or a preference toggle would re-render the canvas.
- Snapping in `onNodeDrag`: it fires after `onNodesChange` has already applied the positions.
- Replacing React Flow's drag handling with our own: it would throw away working selection, group and touch handling.
- Doing nothing: the spec's assists cannot be built on the built-in prop.

## Consequences
The integration depends on two React Flow ordering details:
- Final drag positions land before `onNodeDragStop`.
- The resizer anchors to `measured`.

A React Flow upgrade must re-check both. `tests/e2e/assists.spec.ts` guards them: grid snap on drop, a second resize starting from the snapped size, and a text node keeping its height.

Resize edge detection compares the raw rect with the board rect. That holds only because React Flow pins each node wrapper to the `height` that `toFlow` passes. Letting text nodes size their wrapper to their content would break it, and a guard test covers that.

A 1000-step board drags with guides on at a p95 of about 17ms per frame (`tests/e2e/perf.spec.ts`).
