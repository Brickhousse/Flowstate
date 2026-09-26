# 0008: Shift is the multi-select and axis-lock key, not the marquee key

Status: Accepted (2026-09-26)

## Context
The canvas sets React Flow's `multiSelectionKeyCode` to Shift so Shift+click extends the selection, as in PowerPoint. React Flow's separate `selectionKeyCode` was left at its default, which is also Shift. With that default, the pane's capture-phase pointerdown handler (`Pane` in `@xyflow/react`) treats any Shift+press inside the pane as the start of a marquee, including a press on a node, and calls `preventDefault()`. That suppresses the compatibility `mousedown` d3-drag listens for, so a Shift+drag on a node never moved it. It selected the node through the marquee instead. Nothing noticed until the layout assists spec required Shift to lock a drag to one axis (`docs/superpowers/specs/2026-09-26-layout-assists-design.md`, section 2), which needs the node drag to start.

## Decision
`selectionKeyCode={null}` on the `ReactFlow` element. Shift no longer means "marquee". A plain left drag on empty canvas still draws the marquee because `selectionOnDrag` is on, so no capability is lost. Shift+drag on a node now reaches XYDrag: the node is added to the selection by the multi-select rule and the drag proceeds with the axis lock.

Rejected:
- The `nokey` class on node wrappers, which exempts them from the marquee capture: React Flow also uses `nokey` to ignore keydown events whose target is inside it, so a focused node would stop reporting Shift and Control presses to React Flow's own key handling.
- Moving multi-select to Control: Ctrl+drag is reserved for copy by the same spec.

## Consequences
Shift+left drag on the empty canvas behaves exactly like a plain left drag (marquee). The distinct "hold Shift to select" mode React Flow offers is gone, which matters only for setups that pan on a plain left drag; this canvas pans on middle and right drag. A future maintainer who restores React Flow's default `selectionKeyCode` will silently break Shift+drag on nodes again; the Shift case in `tests/e2e/assists.spec.ts` guards it.
