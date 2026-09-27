# 0011: Ctrl+drag copy reads the modifier from the drop event and runs inside the drag transaction

Status: Accepted (2026-09-26)

## Context
The layout assists spec (`docs/superpowers/specs/2026-09-26-layout-assists-design.md`, section 4) makes Ctrl+drag (Cmd on macOS) copy the dragged nodes. The choice is made at the drop, so pressing or releasing Ctrl mid-drag changes the outcome, as in PowerPoint. The move and the copy must be one undo step, and the copy must be able to snap to the original it came from.

Two sources of modifier state exist during a drag. `src/canvas/assist/modifiers.ts` tracks Ctrl, Shift and Alt from window events so snapping reacts live. React Flow's `onNodeDragStop` receives d3-drag's `sourceEvent`, the mouseup or touchend itself, whose `ctrlKey` and `metaKey` describe the release moment (`@xyflow/system` XYDrag 'end' handler, d3-drag `mouseupped`). The drag's `begin()` transaction is still open when `onNodeDragStop` runs, and the final snapped positions have already landed (ADR 0009).

## Decision
`useDragAssist.finish(event)` returns a `CopyDrop` (dragged ids, every start position including dragged group members, and the snapped delta) only when the stop event carries Ctrl or Cmd and the delta is not zero. Called without an event, as the unmount and vanish paths do, it returns null.

`Canvas.onNodeDragStop` then, still inside the drag transaction, restores the originals to their start positions, pastes `copySubgraph` of the dragged ids at the delta, selects the copies, and only then commits. One history entry holds the whole action.

While Ctrl is held, the originals' start rects join the snap candidates, so a copy aligns with its own original.

Rejected:
- Reading `modifiers.ts` in `finish`: the same value at a real drop, but `finish` also runs on unmount and when the dragged node vanishes, where a held Ctrl would paste from a path that is not a drop. The event makes "no drop, no copy" explicit.
- Copying after `commit()`: two history entries, and undoing the second would leave the original displaced.
- Leaving the originals at the drop point and pasting the copies at the start positions: the copies carry no external arrows, so every arrow would appear to jump to the moved node. Restoring the originals keeps each external arrow on the node that did not move, which matches Ctrl+C then Ctrl+V.

## Consequences
The copy depends on three React Flow and d3 details that an upgrade must re-check:
- `onNodeDragStop` passes d3's live `sourceEvent`. A wrapper that synthesised its own event would make the Ctrl decision stale.
- The final positions land before `onNodeDragStop` (ADR 0009), so restoring the originals is a plain position write.
- d3-drag swallows the click that follows a real drag (`yesdrag(view, mousemoving)`, with React Flow's `nodeClickDistance` at 0). Without that, React Flow's `onSelectNodeHandler` would re-select the original after the copies were selected. Raising `nodeClickDistance` would reopen this for short drags.

A snapped delta of zero creates nothing and leaves no history entry. Ctrl+dragging the selection rectangle copies the whole selection, because React Flow routes rectangle drags through the same handlers. A copy of a group member alone drops its group membership, as paste does.

`tests/e2e/assists.spec.ts` guards the copy, the Ctrl+Shift in-line copy, snapping to the original, Ctrl released before the drop, a pair with its internal arrow, and the zero-delta case.
