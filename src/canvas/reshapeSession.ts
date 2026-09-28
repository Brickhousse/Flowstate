import { setBends } from '../ops/arrowPath';
import { layoutPrefs } from '../store/layoutPrefs';
import { flowStore } from '../store/store';
import { mods } from './assist/modifiers';
import { GRID } from './assist/snap';
import type { DragContext, DragSession } from './dragSession';
import { reshapedBends, type Reshape } from './reshape';

const DRAG_SLOP = 3;

function snap(v: number): number {
  return layoutPrefs.getState().prefs.gridSnap && !mods.alt ? Math.round(v / GRID) * GRID : v;
}

export function reshapeSession(ctx: DragContext, r: Reshape): DragSession {
  const current = () => flowStore.getState().project.boards.find((b) => b.id === ctx.boardId)?.edges.find((x) => x.id === ctx.edgeId);
  const original = current();
  let moving = false;
  return {
    move(ev) {
      if (!moving) {
        if (Math.hypot(ev.clientX - ctx.pressed.x, ev.clientY - ctx.pressed.y) < DRAG_SLOP) return true;
        // why: no transaction is open below the threshold, so an undo or delete may have made the captured shape stale.
        if (current() !== original) return false;
        moving = true;
        flowStore.getState().begin();
      }
      ctx.change((b) => setBends(b, ctx.edgeId, reshapedBends(r, ctx.toFlow(ev), snap)));
      return true;
    },
    finish() {
      if (moving) flowStore.getState().commit();
    },
  };
}
