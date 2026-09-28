import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { XY } from '../model/types';
import { reattach, type ArrowEnd } from '../ops/arrowPath';
import type { DragContext, DragSession } from './dragSession';
import { dotAt } from './sideDots';

export type Ghost = { end: ArrowEnd; at: XY } | null;

const arrowDrag = createStore<{ reattaching: boolean }>()(() => ({ reattaching: false }));

export function useReattaching(): boolean {
  return useStore(arrowDrag, (s) => s.reattaching);
}

export function reattachSession(ctx: DragContext, end: ArrowEnd, setGhost: (ghost: Ghost) => void): DragSession {
  arrowDrag.setState({ reattaching: true });
  return {
    move(ev) {
      setGhost({ end, at: ctx.toFlow(ev) });
      return true;
    },
    finish(drop) {
      arrowDrag.setState({ reattaching: false });
      setGhost(null);
      const dot = drop && dotAt(drop.clientX, drop.clientY);
      if (dot) ctx.change((b) => reattach(b, ctx.edgeId, end, dot.nodeId, dot.side));
    },
  };
}
