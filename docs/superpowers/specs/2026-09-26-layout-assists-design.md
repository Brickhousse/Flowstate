# Flowstate: Layout Assists Design Spec

Date: 2026-09-26
Status: Draft, awaiting review

## 1. Purpose

Bring PowerPoint and Figma-style layout comfort to the canvas: snapping, alignment guides, right-click alignment and arrangement, Ctrl+drag copies, standard shortcuts, colour on any selection, and reliable dot-to-dot connections. The AI chat gets the same alignment and colour abilities as the UI.

**Success criteria**
- Dragging a step near another shows a guide and drops it exactly aligned, with no manual fiddling.
- Every assist can be switched off, and switching it off fully disables it.
- A plain drag from a connection dot to another shape's dot creates an arrow between those two sides.
- Every action in this spec is one undo step.
- A 1000-step board still drags at 60fps with guides on.

**Current state (verified in code, 2026-09-26)**
- No grid snap; the 20px dots are decoration only.
- No align, distribute, match size or z-order.
- Right-drag pans (`panOnDrag={[1, 2]}`) and the pane context menu is suppressed.
- Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+D exist. Ctrl+X does not.
- Colour exists as six theme-aware tints, only through the single-step floating toolbar, fill only.
- Connection dots sit half under `.fs-step-body` (`z-index: 1`), so a plain drag on a dot mostly moves the shape. Ctrl+drag connects; the reason is not yet proven.

## 2. Drag assists

A new UI-free module `src/canvas/assist/` exports `snap(moving, others, settings, zoom)` returning `{ dx, dy, guides }`. `moving` is the bounding box of everything being dragged (a group counts as one box).

**Precedence per axis:** smart guide, then equal spacing, then grid. The first match within the threshold wins; the axes resolve independently.
- **Threshold:** 6 screen pixels, converted to flow units by the current zoom.
- **Smart guides:** left, centre and right edges (x) and top, middle and bottom edges (y) of the moving box against the same lines on candidate nodes. Lane boundaries are also candidate lines. Arrows are never candidates.
- **Equal spacing:** when the gap between the moving box and a neighbour in the same row or column equals an existing gap between two other nodes in that row or column, snap to it.
- **Grid:** 20px, snapping the moving box's top-left corner.
- **Candidates:** computed once at drag start. They are nodes overlapping the viewport, capped at the 200 nearest to the moving box, with their guide lines and row/column gaps precomputed.
  - Excluded: the dragged nodes, members of a dragged group, and the dragged node's own group (its frame refits around it, so snapping to it is circular).
  - During a Ctrl+drag copy, the originals' start positions are candidates.
  - Box sizes use React Flow's measured sizes, so auto-sized text nodes are correct.

**Rendering:** guides draw in a `ViewportPortal` overlay as 1px accent lines spanning the matched nodes. Equal-spacing matches draw small measured brackets on each equal gap. The overlay clears on drop.

**Integration:**
- At drag start, record each dragged node's start position.
- On every position change during an active pointer drag, `Canvas.onNodesChange`:
  1. Takes the raw delta (reference node's position minus its start).
  2. Calls `snap`.
  3. Applies the snapped delta to every dragged node before `setPositions`.
- The final change must be snapped too. React Flow's drag-end change (`dragging: false`) carries its own unsnapped positions (`XYDrag` `updateNodePositions(dragItems, false)`), and handling only `dragging: true` would undo the snap on drop. It uses the last known modifier state.
- **Resize** (`resizing: true`), when resize snap is on: infer the moving edges from which of x, y, w and h changed, then snap only those edges to the grid and to other nodes' edges. This also applies to the final resize change.

**Modifiers,** read live from the drag's pointer events:
- **Shift:** lock movement to the axis with the larger total displacement since drag start.
  - Shift is also React Flow's multi-select key, so Shift+drag on an unselected node adds it to the selection and drags the whole selection. This matches PowerPoint.
- **Alt:** suspend all snapping while held.
  - On Windows, releasing Alt focuses the browser menu, which would swallow the next shortcut. Call `preventDefault` on that Alt keyup when the Alt press happened during a drag.

**Never snapped:** AI edits, Tidy, paste, keyboard-created steps and imports. Only pointer drags and resizes snap.

**Reference view** (`editable: false`) gets no snapping, guides, context menu or shortcuts.

## 3. Layout preferences

A `layoutPrefs` zustand store, persisted to localStorage (per user, not per project):

| Pref | Default |
|---|---|
| `gridSnap` | on |
| `smartGuides` | on |
| `spacingGuides` | on |
| `resizeSnap` | on |
| `arrowNudge` | on |

- Storage reads and writes are wrapped so a blocked or corrupt store falls back to the defaults.
- A "Layout" dropdown in `TopBar` holds one switch per pref.
- The pane context menu repeats them as checkmark items.
- Ctrl+' toggles `gridSnap`, matched on `e.code === 'Quote'`.

## 4. Ctrl+drag copy

- **Drag start:** record the start position of every dragged node. The existing `begin()` transaction is already open.
- **During the drag:** the real nodes move as normal. While Ctrl (Cmd on macOS) is held, faint ghost outlines render at the start positions.
- **Drop with Ctrl held:**
  1. Compute the delta.
  2. Restore the originals to their start positions.
  3. Call `pasteSubgraph(copySubgraph(board, ids), dx, dy)`.
  4. Select the copies.
  5. Commit.

  All of this happens inside the same transaction, so it is one undo step. A zero delta creates nothing.
- **Timing:** React Flow applies the final positions before `onNodeDragStop` (`XYDrag` end handler), so the restore in step 2 runs after the snapped drop has landed.
- **Why Ctrl is read at drop:** pressing or releasing Ctrl mid-drag changes the outcome, as in PowerPoint.
- **Edges:** copies keep arrows among themselves only. Originals keep every arrow. This matches Ctrl+C / Ctrl+V.
- **Ctrl+Shift+drag:** the same, with the Shift axis lock from section 2.

## 5. Connection dots (bug fix, test first)

1. Write a Playwright test: create two steps, then plain-drag from step A's right dot to step B's left dot. Assert one new edge with `sourceSide: right` and `targetSide: left`.
2. Run it and confirm it fails. Record why Ctrl+drag currently connects.
   - React Flow already gives handles the `nodrag` class (`@xyflow/react` Handle), and on Windows Ctrl is only its zoom-activation key, so the drag filter is not what blocks a plain drag.
   - Expected cause: the press lands on `.fs-step-body`, which covers the inner half of the dot.
   - Ctrl+drag must be re-checked after the fix, because slice 3 gives it a new meaning.
3. Fix:
   - Give `.fs-handle` a z-index above `.fs-step-body`.
   - Keep the dot 9px visually, with a transparent 20px hit area.
   - Show all dots on every step while a connection is in progress.
   - Set `connectionRadius` to about 20.
   - Releasing on a step body still connects to the nearest side, as today.

## 6. Context menu

**Opening rule:**
- On the canvas wrapper, listen in the capture phase.
- Always `preventDefault` the native `contextmenu` event, on the pane, nodes and edges.
- On right-button pointerdown, record the position. On right-button pointerup, open our menu only if the pointer moved less than 4px; otherwise it was a pan.
- Opening on pointerup instead of on `contextmenu` works on every platform. macOS fires `contextmenu` on pointerdown, before any movement is known.
- Shift+F10 and the ContextMenu key open the menu anchored to the selection.
- Right-clicking an unselected node selects it first.
- Right-clicking inside a multi-selection keeps it.

**Component:** a custom `ContextMenu` with no new dependency.
- Nested submenus.
- Arrow keys, Enter, Esc and Right/Left for submenus.
- Closes on outside click, pan, zoom or board switch.
- Flips to stay inside the viewport.
- Disabled items are greyed, with the shortcut shown right-aligned.

**Node or selection menu:**

| Item | Enabled when | Shortcut |
|---|---|---|
| Cut, Copy, Duplicate, Delete | selection | Ctrl+X, Ctrl+C, Ctrl+D, Del |
| Paste | clipboard | Ctrl+V |
| Align ▸ Left, Center, Right, Top, Middle, Bottom | 2+ nodes | |
| Distribute ▸ Horizontally, Vertically | 3+ nodes | |
| Match size ▸ Width, Height, Both | 2+ nodes | |
| Arrange ▸ Bring to front | selection | Ctrl+Shift+] |
| Arrange ▸ Bring forward | selection | Ctrl+] |
| Arrange ▸ Send backward | selection | Ctrl+[ |
| Arrange ▸ Send to back | selection | Ctrl+Shift+[ |
| Colour ▸ 6 presets, Default, Custom… | steps or text | |

- **Align** uses the selection's bounding box.
- **Distribute** keeps the two outermost nodes fixed and equalises gaps.
- **Match size** uses the right-clicked node as the reference.

**Pane menu:**
- Paste here (at the pointer)
- Select all
- Tidy layout (L)
- The five layout prefs as checkmarks

## 7. Operations (`src/ops/arrange.ts`)

These are pure board operations run through `changeBoard`, so each is one undo step and they are shared by the UI and the AI:
- `alignNodes(b, ids, edge)`
- `distributeNodes(b, ids, axis)`
- `matchSize(b, ids, referenceId, dims)`
- `reorder(b, ids, 'front' | 'forward' | 'backward' | 'back')`
- `setColor(b, ids, color)`

**Rules:**
- Moving a group moves its members (`withGroupMembers`). Moving a member refits its group (`setPositions`).
- `reorder` changes only the order of steps and text within `b.nodes`, which is already their render order. Groups stay at `zIndex -1` and lanes at `-2`, so nothing can go behind a lane.
- Set `elevateNodesOnSelect={false}`. React Flow's default raises selected nodes, which would make Send to back look like a no-op until you deselect.
  - The floating toolbar is a `NodeToolbar` portal, so it stays on top.
  - A selected node's resize handles can be covered by an overlapping node above it, as in PowerPoint.
- Position decides lane membership (`syncLane`), so aligning steps from different lanes on the lane axis moves them into one lane. This is consistent with dragging, and one undo reverts it.
- `setColor` accepts a preset name, `#rrggbb`, or null. Anything else throws a validation error. The file schema already stores `color` as a nullable string, so no migration is needed.

**Rendering a hex colour:** apply the colour as an inline fill on `.fs-shape-body`. Choose dark or light text by relative luminance (WCAG contrast against the text tokens). Preset tints keep their theme-aware classes.

## 8. Keyboard

| Keys | Action |
|---|---|
| Ctrl+X | Copy then delete, without reconnecting |
| Ctrl+Arrow | Nudge the selection 20px (when `arrowNudge` is on) |
| Ctrl+Shift+Arrow | Nudge the selection 1px (when `arrowNudge` is on) |
| Ctrl+] / Ctrl+[ | Bring forward / send backward |
| Ctrl+Shift+] / Ctrl+Shift+[ | Bring to front / send to back |
| Ctrl+' | Toggle grid snap |

- Plain arrows keep their current job of moving the selection to the nearest node.
- Each nudge is its own undo step, as in PowerPoint. Merging nudges would need an open transaction, and undo is ignored while one is open (ADR 0005), so Ctrl+Z straight after a nudge would do nothing.
- The bracket shortcuts match on `e.code` (`BracketLeft`, `BracketRight`) so they work on any keyboard layout.

## 9. AI chat

**New tool `arrange`:**
```
{ board, ids: string[] (2+ for align and match, 3+ for distribute, 1+ otherwise),
  action: align_left | align_center | align_right | align_top | align_middle | align_bottom
        | distribute_horizontal | distribute_vertical
        | match_width | match_height | match_size
        | bring_to_front | bring_forward | send_backward | send_to_back,
  reference?: string (required for match_*) }
```
The executor maps each action to the `arrange.ts` function.

**Other changes:**
- `update_steps` gains `color` (preset name, `#rrggbb`, or null).
- The system prompt gains one line: use `arrange` to line up or order specific steps, and `tidy` to re-lay out a whole board.

## 10. Testing

- **Unit tests:**
  - `snap` precedence, thresholds scaled by zoom, equal spacing, lane lines, the 200-candidate cap, Alt suspend and Shift lock.
  - Every `arrange.ts` function, including groups, lanes and ordering.
  - Cut, colour validation, and the `arrange` tool and `color` through the executor tests.
- **Browser tests:**
  - Guide appears and the drop lands aligned.
  - Grid snap.
  - Alt+drag lands unsnapped.
  - Ctrl+drag copy, undone by one Ctrl+Z.
  - Dot-to-dot connect (section 5).
  - Right-click opens the menu, and right-drag pans with no menu.
  - Menu align and distribute.
  - Each pref switch disables its feature.
- **Performance:** the existing 1000-step check gains a drag-with-guides case at 60fps.
- **Human playtest** after slice 2.

## 11. Build order

Each slice is committed separately:
1. Connection dot fix (test first).
2. `assist/` snapping, guides overlay, `layoutPrefs`, Layout dropdown, Shift lock, Alt suspend. **Playtest.**
3. Ctrl+drag and Ctrl+Shift+drag copy.
4. `arrange.ts`, Ctrl+X, nudge, z-order shortcuts.
5. Context menu, colour presets and custom, Custom in the floating toolbar.
6. AI `arrange` tool and `update_steps.color`.
7. ADRs: right-click vs right-drag disambiguation; layout prefs stored per user, not per project.

## 12. Out of scope

- Context menu on arrows (the edge toolbar covers it).
- A multi-selection toolbar.
- Separate border and text colours.
- Rotation.
- Grid size setting.
