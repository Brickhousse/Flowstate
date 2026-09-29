# Architecture decision records

| ADR | Title | Status |
|---|---|---|
| [0001](0001-react-flow-canvas.md) | React Flow for the canvas | Accepted |
| [0002](0002-client-side-agent-loop.md) | Agent loop in the browser, thin server proxy | Accepted |
| [0003](0003-local-placement-with-elk-tidy.md) | Local placement for edits, ELK only on request | Accepted |
| [0004](0004-local-only-api-guard.md) | Host, Origin and Content-Type guard on the local API | Accepted |
| [0005](0005-undo-ignored-during-open-transactions.md) | Undo and redo are ignored while a transaction is open | Accepted |
| [0006](0006-full-schema-validation-of-project-files.md) | Validate project files against a full schema on load and save | Accepted |
| [0007](0007-pin-ai-turn-to-its-board.md) | Pin each AI turn to the board it was sent from | Accepted |
| [0008](0008-shift-is-not-the-marquee-key.md) | Shift is the multi-select and axis-lock key, not the marquee key | Accepted |
| [0009](0009-snap-by-rewriting-node-changes.md) | Snapping rewrites React Flow's node changes instead of using its snapToGrid | Accepted |
| [0010](0010-layout-prefs-per-user.md) | Layout assist switches are per-user browser prefs, not project data | Accepted |
| [0011](0011-ctrl-drag-copy-reads-the-drop-event.md) | Ctrl+drag copy reads the modifier from the drop event and runs inside the drag transaction | Accepted |
| [0012](0012-right-click-menu-on-pointerup.md) | Right-click menu opens on pointerup and yields to right-drag panning | Accepted |
| [0013](0013-honest-layer-order.md) | Layer order is the board's node order and selection does not raise nodes | Accepted |
| [0014](0014-flowstate-routes-its-own-arrows.md) | Flowstate routes its own arrows | Accepted |
| [0015](0015-arrow-routing-performance-budget.md) | Arrow routing is held to a measured drag and load budget | Accepted |
| [0016](0016-pick-arrows-by-geometry.md) | Arrow clicks are resolved from the routes, and side dots do not connect on click | Accepted |
| [0017](0017-colour-is-lenient-in-files-strict-in-operations.md) | Colour fields accept any string in the file and only colours in operations | Accepted |
| [0018](0018-draw-culled-arrows-in-an-overlay.md) | Arrows React Flow culls are drawn by an overlay while their route is on screen | Accepted |
