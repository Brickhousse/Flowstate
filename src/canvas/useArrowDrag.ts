import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { BoardEdge, XY } from '../model/types';
import type { ArrowEnd } from '../ops/arrowPath';
import { flowStore } from '../store/store';
import type { DragContext, DragSession } from './dragSession';
import { reattachSession, type Ghost } from './reattachSession';
import { bendReshape, segmentReshape } from './reshape';
import { reshapeSession } from './reshapeSession';
import { runSafely } from './safe';

export interface HandleEvents {
  onPointerDown(e: ReactPointerEvent<SVGElement>): void;
}

export interface ArrowDrag {
  ghost: Ghost;
  end(end: ArrowEnd): HandleEvents;
  segment(index: number): HandleEvents;
  bend(index: number): HandleEvents;
}

export function useArrowDrag(edge: BoardEdge, points: XY[]): ArrowDrag {
  const rf = useReactFlow();
  const [ghost, setGhost] = useState<Ghost>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const toFlow = (e: { clientX: number; clientY: number }) => rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });

  // why: ADR-0014
  // why: the session starts after the button and one-at-a-time filters, so a right-click never flags a reattach.
  const track = (e: ReactPointerEvent<SVGElement>, start: (ctx: DragContext) => DragSession) => {
    if (e.button !== 0 || stop.current) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const boardId = flowStore.getState().activeBoardId;
    const session = start({
      edgeId: edge.id,
      boardId,
      pressed: { x: e.clientX, y: e.clientY },
      toFlow,
      change: (fn) =>
        runSafely(() =>
          flowStore.getState().changeBoard((b) => {
            if (b.edges.some((x) => x.id === edge.id)) fn(b);
          }, boardId),
        ),
    });
    const onMove = (ev: PointerEvent) => {
      if (!session.move(ev)) finish(null);
    };
    const finish = (drop: PointerEvent | null) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      stop.current = null;
      session.finish(drop);
    };
    const onUp = (ev: PointerEvent) => finish(ev);
    const onCancel = () => finish(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    stop.current = onCancel;
  };

  return {
    ghost,
    end: (end) => ({ onPointerDown: (e) => track(e, (ctx) => reattachSession(ctx, end, setGhost)) }),
    segment: (index) => ({ onPointerDown: (e) => track(e, (ctx) => reshapeSession(ctx, segmentReshape(points, edge.bends, index, ctx.toFlow(e)))) }),
    bend: (index) => ({ onPointerDown: (e) => track(e, (ctx) => reshapeSession(ctx, bendReshape(edge.bends, index, ctx.toFlow(e)))) }),
  };
}
