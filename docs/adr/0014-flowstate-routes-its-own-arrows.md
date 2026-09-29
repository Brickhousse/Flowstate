# 0014: Flowstate routes its own arrows

Status: Accepted (2026-09-28)

## Context
The arrow routing spec (`docs/superpowers/specs/2026-09-27-arrow-routing-design.md`) needs arrows that attach to any side dot, stay off shared lines when marked "Don't merge", and keep bends the user placed. React Flow's smooth-step edge draws from two handle positions only: it has no bends, and one edge cannot see the others. Existing boards had to look the same after the change.

## Decision
- Pure modules in `src/layout/route/` compute each arrow's corner points from board data, and `FlowEdge` draws them. React Flow still receives `sourceHandle` and `targetHandle`, so it still decides whether an edge renders.
- Automatic arrows use `elbow.ts`, a line-for-line port of `getPoints` in `@xyflow/system`. An arrow starts `PORT_OUTSET` (5.5px) outside its box, where React Flow anchored it at device pixel ratio 1.
- `src/canvas/arrowRoutes.ts` caches each route on the arrow and its two boxes, so a drag re-routes only the arrows attached to moving boxes.
- Bends are absolute canvas points. A segment drag and "Add bend here" turn every corner of the drawn route into bends. "Add bend here" keeps its new point although it is collinear, until the next edit of that arrow; every other edit removes collinear points. Moving an end to another step clears the bends.
- A stub is the 22px piece an arrow leaves its box by (`STUB`). `splitStubs` makes each stub end an explicit corner, so every arrow, straight and L-shaped included, gets a draggable bar. A piece of 22px or less gets no stub corner, so a very short arrow can have no bar.
- "Don't merge": separate ends on one side are spread evenly, ordered by their other end. With shared arrows on that side, each separate end takes the half of the side that faces its other end. Only automatic separate arrows shift off shared lines; hand-shaped ones still spread their ends but are drawn through their bends as placed.
- Handles draw in a `ViewportPortal` above the nodes, because the end circles sit on the side dots, and show only while the arrow is the only selected item. Handle drags listen on `window`, because a segment that lines up with its neighbour vanishes mid-drag along with its bar. A press that moves under 3px (`DRAG_SLOP` in `reshapeSession.ts`) opens no undo transaction, so a click on a handle is not a drag.
- "Route around boxes" searches a right-angled route (`around.ts`, 50ms limit) and stores it as bends.
- Picking arrows under the pointer: ADR-0016. Arrow colour validation: ADR-0017.

Rejected:
- React Flow's reconnectable edges: they move ends only, and their anchors sit under the node layer, beside the side dots.
- Computing paths inside `FlowEdge` from React Flow's handle positions: no board-wide view for "Don't merge", and no cache shared across edges.
- A routing library: a new dependency for orthogonal routes with user bends, which small pure modules cover.

## Consequences
- A React Flow upgrade can change `getSmoothStepPath`. `src/layout/route/elbow.test.ts` compares `elbow.ts` with the installed version for all 16 side pairs and fails if they drift.
- `PORT_OUTSET` depends on the `.fs-handle` size and border. At device pixel ratio 2, React Flow's own anchor would sit 0.5px further out, which is not visible. `tests/e2e/arrows.spec.ts` checks the anchor against the real dot.
- Arrows to a free text box still do not render, because text boxes have no side dots.
- React Flow decides whether to draw an edge from the bounding box of its two boxes only (`onlyRenderVisibleElements` in `src/canvas/Canvas.tsx`, `isEdgeVisible` in `@xyflow/system`), not from our route. A hand-shaped or routed-around arrow whose detour runs outside that box vanishes while only the detour is on screen. A follow-up would cull arrows by their route bounds.
- Tidy clears every bend (one undo restores them). The assistant is told so and can move ends, separate arrows and route around boxes with `update_arrows`, but cannot place bends.
