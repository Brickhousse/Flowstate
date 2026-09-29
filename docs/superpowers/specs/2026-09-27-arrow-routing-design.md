# Arrow routing design

**Date:** 2026-09-27
**Status:** Built on feat/arrow-routing (ADRs 0014 to 0017), awaiting the final playtest

## 1. Goal

Give the user control over arrows whose automatic route is wrong, without making shared lines rare or the app slower.

**What the user asked for:**
- Move where an arrow attaches.
- Mark an arrow "Don't merge" so it gets its own line. Crossings are fine.
- Reshape an arrow by hand.

**Settled in brainstorming:**
- **Shared lines stay the default.** Stacked steps running down one line is normal and wanted. "Don't merge" is an opt-in per arrow, from the right-click menu.
- **Attach points are side dots.** An end can move to any of the four side dots on any box. There is no free sliding along a side.
- **Hand editing** means both segment dragging and bend points.
- **Automatic routing is unchanged.** Routing around boxes happens only on request ("Route around boxes"), and the result is saved as bends.
- **Performance is a hard requirement.** If the budget in section 4 is missed, the feature scales back as described there.

**Success looks like:**
- Any misleading arrow can be made unambiguous in a few seconds.
- Existing boards look the same after upgrading.
- Dragging and board loading stay within the budget.

## 2. Data

`BoardEdge` gains two fields:

| Field | Type | Meaning |
|---|---|---|
| `separate` | `boolean` | `false` (default): the arrow may share lines and attach points. `true`: "Don't merge". |
| `bends` | `XY[]` | Canvas points the route passes through at right angles. Empty means an automatic route. |

`sourceSide` and `targetSide` keep their current meaning.

**Schema:**
- `SCHEMA_VERSION` goes from 1 to 2.
- The first entry in `MIGRATIONS` adds `separate: false, bends: []` to every edge.
- An older build refuses a version 2 file with its existing "saved by a newer Flowstate" error.

**Bends are absolute canvas points:**
- When both ends move together (a selection drag containing both, a group move, a paste), the bends shift by the same delta.
- When only one end moves, the bends stay. Only the end piece of the route re-routes to reach the moved box.
- Copy, paste, duplicate and Ctrl+drag copy carry the bends, shifted by the copy offset.
- Tidy (L) clears all bends. One undo restores them.

**Rules:**
- A side change keeps the bends. Moving an end to a different box clears them.
- Every user action on an arrow is one undo step.

## 3. Drawing

One pure routing module (section 6) returns an arrow's corner points. `FlowEdge` draws them with the current 14px corner radius and 22px stub, and places the label halfway along the path's length.

**Routes:**
- **Automatic:** the elbow route between the two sides. It follows React Flow's `getSmoothStepPath` point logic so existing boards look the same.
- **Hand-shaped:** a right-angled route through the bends, in order. Points that end up collinear are removed.

**"Don't merge" (only when `separate` is true):**
- **Attach points:** separate arrows on the same side of the same box are spread evenly along that side. They are ordered by the position of each arrow's other end, so they do not cross at the box. Arrows without `separate` on that side keep the midpoint.
- **Lines:** where a separate arrow's segment is collinear and overlapping with another arrow's segment, the separate arrow's segment shifts sideways in 10px steps, alternating sides, until it is clear. It stops after 5 steps and stays at the last position. Other arrows never move. Crossings are left alone.

## 4. Performance budget and scale-back

**Keeping it cheap:**
- **Ordinary arrows are routed alone.** An automatic arrow without `separate` depends only on its two boxes, so there is no board-wide pass.
- **The board-wide pass only runs for separate arrows.** It checks only arrows whose bounding box overlaps theirs, and it never runs when no arrow is separate.
- **Drags re-route only what moves.** During a drag, only arrows attached to moving boxes are re-routed. The rest reuse cached routes through the existing render cache.
- **Route around boxes runs only on request.** It never runs during drags, and it has a 50ms limit.

**Budget, enforced by tests:**
- **Drag frame:** the drag performance test grows to 200 steps, 200 arrows and 20 separate arrows. Routing may add at most 2ms to the p95 drag frame.
- **Board load:** opening a 200-arrow board may take at most 10% longer.
- **Baselines:** both are measured on the commit before slice 1, on the same machine, and recorded in the test file.

**Scale-back, decided after slice 1 (section 8):**
1. If our automatic drawing is slower than React Flow's, automatic arrows without `separate` go back to React Flow's `getSmoothStepPath`. Only edited or separate arrows use our routes.
2. If "Don't merge" still breaks the budget, it keeps the spread attach points and drops the sideways line shift. The shift is the only board-wide step.

Each scale-back gets an ADR.

## 5. Interaction

These apply to the editable canvas only. The reference view shows no handles.

**Selecting an arrow shows three kinds of handle,** in the accent colour and sized like the box resize handles:
- **End circles** (grab cursor).
- **A bar on each inner segment** (two-way cursor along the drag axis). The two stubs at the boxes have no bar.
- **A square on each bend** (move cursor).

**Moving an end:**
- While an end is dragged, side dots show on every box.
- Dropping on a dot reattaches the end to that box and side. Dropping anywhere else changes nothing.
- The `connect` rules apply: no self-link, no group frames, no duplicate of an existing arrow of the same type between the same boxes. A refusal shows the existing error toast.

**Dragging a segment:**
- The segment slides perpendicular to its direction and the right angles are kept.
- On an automatic arrow, the first segment drag converts the route into bends.

**Bends:**
- **Add:** right-click the arrow and choose "Add bend here".
- **Move:** drag a bend square.
- **Remove:** right-click a bend and choose "Remove bend".
- Collinear points are removed after every edit.

**Snapping:** segments and bends snap to the grid when `gridSnap` is on. Holding Alt suspends snapping, as with box drags.

**Toolbar:** the arrow's floating toolbar shows "Reset path" when the arrow has bends.

**Undo:** every drag opens a transaction on pointerdown and commits on pointerup, so each drag is one undo step. Menu actions are single `changeBoard` calls.

## 6. Structure

Each unit has one responsibility. Pure routing lives in `src/layout/`, so `ops` never depends on `canvas`.

| Unit | Responsibility |
|---|---|
| `model/types.ts`, `model/migrate.ts` | Edge fields and the v1 to v2 migration |
| `layout/route/elbow.ts` | Automatic route between two sides |
| `layout/route/through.ts` | Right-angled route through bends |
| `layout/route/polyline.ts` | Collinear cleanup, stub corners, segment moves |
| `layout/route/apart.ts` | "Don't merge": port spreading and line shifting |
| `layout/route/around.ts` | Time-limited search around boxes |
| `ops/arrowPath.ts` | Reattach, set `separate`, add and remove bends, reset, route around |
| `layout/place.ts` | Moves bends with their boxes (`carryBends`) |
| `ops/edges.ts` | Unchanged responsibility: create, delete, relabel |
| `canvas/arrowRoutes.ts` | Board-to-route bridge for drawing, with caching |
| `canvas/FlowEdge.tsx` | Draws the path and label; no geometry decisions |
| `canvas/ArrowHandles.tsx`, `canvas/useArrowDrag.ts` | Handles, and turning drags into single undo steps (`reshapeSession.ts`, `reattachSession.ts`) |
| `canvas/menu/arrowEntries.ts` | The arrow menu's items, calling `ops` |
| `canvas/menu/colourEntries.tsx` | The colour submenu builder shared by the arrow and step menus |
| `ai/schemas.ts`, `ai/executor.ts` | `update_arrows`, mapped onto `ops` |

`Canvas.tsx` only gets wiring. Handle logic stays with the arrow.

**Route around boxes:**
- An orthogonal A* search over a sparse grid built from box edges padded by 16px, plus the two end stubs.
- Its cost is path length plus a penalty per turn.
- It stops at 50ms. On timeout, the arrow is unchanged and a toast says no route was found.
- A successful route is saved as bends with collinear points removed.

## 7. Right-click menu and assistant

**Arrow menu:** right-clicking an arrow selects it and opens:
- Edit label
- Don't merge (checkmark)
- Add bend here
- Remove bend (only on a bend)
- Route around boxes
- Reset path (disabled when there are no bends)
- Delete arrow (Del)

**Multiple arrows:** with several arrows selected, Don't merge, Route around boxes and Reset path apply to all of them as one undo step.

**Arrow labels:** right-clicking an arrow's label opens the same menu. Today a label right-click opens the pane menu; this replaces that.

**Assistant:**
- **New tool `update_arrows`:** `{ board, links: [{ from, to, type? }], from_side?, to_side?, separate?, reset_path?, route_around? }`. It maps onto `ops/arrowPath.ts`, and each call is one undo step.
- **No bends.** The assistant cannot place bends.
- **Board summary:** it marks arrows that are separate or hand-shaped.
- **System prompt:** it gains a line that Tidy resets hand-shaped arrows.

## 8. Build order

Each slice ends green before the next starts.

1. **Drawing:** schema v2, the routing module (elbow and through), `FlowEdge` drawing, label placement. Then the performance check and the scale-back decision.
2. **Editing:** end circles, segment bars, bend drag, grid snap, undo. Then a human playtest.
3. **Menu and "Don't merge":** the arrow menu, `apart.ts`, Add and Remove bend, Reset path, Route around boxes, the toolbar button.
4. **Assistant:** `update_arrows`, the summary markers, the prompt line.
5. **Wrap-up:** ADRs (owning arrow routing; the performance budget), README keys, full verification.

## 9. Testing

**Unit:**
- Automatic routes match `getSmoothStepPath` points for all 16 side pairs.
- Routes through bends keep right angles, and collinear cleanup works.
- Bends shift when both ends move and stay when one end moves.
- The v1 to v2 migration.
- Reattach rules, including that a side change keeps bends and a box change clears them.
- Copy and paste carry bends, and Tidy clears them.
- Route around avoids every box in the way and stops at the time limit.
- Port order and the line shift in `apart.ts`.

**Browser:**
- Reattaching to another side and to another box.
- Segment drags and bend drags are each one undo step.
- Add and Remove bend from the menu.
- "Don't merge" spreads attach points and separates an overlapping line, asserted on the rendered path geometry.
- Route around clears a box between the ends.
- The reference view shows no handles.
- The performance budget tests from section 4.

**Assistant:** executor tests for `update_arrows`.

**Human playtests:** after slice 2 and at the end.

## 10. Out of scope

- Free positions along a side.
- Automatic routing that avoids boxes on every render.
- Curved or straight arrow styles.
- The assistant placing bends.
