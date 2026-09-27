# 0013: Layer order is the board's node order and selection does not raise nodes

Status: Accepted (2026-09-26)

## Decision
- z-order is the order of `board.nodes`, so older files need no migration.
- `elevateNodesOnSelect={false}`, because React Flow's default raises selected nodes and made Send to back look like a no-op until you deselected.

## Consequences
- The floating toolbar is a `NodeToolbar` portal and stays on top.
- A selected node's resize handles can be hidden under an overlapping node, as in PowerPoint.
- Groups stay behind steps and lanes behind everything.
