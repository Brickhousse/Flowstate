import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { Board, BoardEdge, XY } from '../model/types';
import { reattach, setBends, type ArrowEnd } from '../ops/arrowPath';
import { layoutPrefs } from '../store/layoutPrefs';
import { flowStore } from '../store/store';
import { mods } from './assist/modifiers';
import { GRID } from './assist/snap';
import { bendReshape, reshapedBends, segmentReshape, type Reshape } from './reshape';
import { runSafely } from './safe';
import { dotAt } from './sideDots';

const DRAG_SLOP = 3;

const arrowDrag = createStore<{ reattaching: boolean }>()(() => ({ reattaching: false }));

export function useReattaching(): boolean {
  return useStore(arrowDrag, (s) => s.reattaching);
}

type Session = Reshape | { kind: 'end'; end: ArrowEnd };

export interface HandleEvents {
  onPointerDown(e: ReactPointerEvent<SVGElement>): void;
}

export interface ArrowDrag {
  ghost: { end: ArrowEnd; at: XY } | null;
  end(end: ArrowEnd): HandleEvents;
  segment(index: number): HandleEvents;
  bend(index: number): HandleEvents;
}

function snap(v: number): number {
  return layoutPrefs.getState().prefs.gridSnap && !mods.alt ? Math.round(v / GRID) * GRID : v;
}

export function useArrowDrag(edge: BoardEdge, points: XY[]): ArrowDrag {
  const rf = useReactFlow();
  const [ghost, setGhost] = useState<ArrowDrag['ghost']>(null);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const toFlow = (e: { clientX: number; clientY: number }) => rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });

  // why: listen on window, because a segment that lines up with its neighbour vanishes mid-drag along with its bar.
  const track = (e: ReactPointerEvent<SVGElement>, s: Session) => {
    if (e.button !== 0 || stop.current) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const boardId = flowStore.getState().activeBoardId;
    const change = (fn: (b: Board) => void) =>
      runSafely(() =>
        flowStore.getState().changeBoard((b) => {
          if (b.edges.some((x) => x.id === edge.id)) fn(b);
        }, boardId),
      );
    const current = () => flowStore.getState().project.boards.find((b) => b.id === boardId)?.edges.find((x) => x.id === edge.id);
    const original = current();
    const pressed = { x: e.clientX, y: e.clientY };
    let moving = false;
    if (s.kind === 'end') arrowDrag.setState({ reattaching: true });
    const onMove = (ev: PointerEvent) => {
      if (s.kind === 'end') {
        setGhost({ end: s.end, at: toFlow(ev) });
        return;
      }
      if (!moving) {
        if (Math.hypot(ev.clientX - pressed.x, ev.clientY - pressed.y) < DRAG_SLOP) return;
        // why: no transaction is open below the threshold, so an undo or delete may have made the captured shape stale.
        if (current() !== original) {
          finish(null);
          return;
        }
        moving = true;
        flowStore.getState().begin();
      }
      change((b) => setBends(b, edge.id, reshapedBends(s, toFlow(ev), snap)));
    };
    const finish = (drop: PointerEvent | null) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      stop.current = null;
      if (s.kind !== 'end') {
        if (moving) flowStore.getState().commit();
        return;
      }
      arrowDrag.setState({ reattaching: false });
      setGhost(null);
      const dot = drop && dotAt(drop.clientX, drop.clientY);
      if (dot) change((b) => reattach(b, edge.id, s.end, dot.nodeId, dot.side));
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
    end: (end) => ({ onPointerDown: (e) => track(e, { kind: 'end', end }) }),
    segment: (index) => ({ onPointerDown: (e) => track(e, segmentReshape(points, edge.bends, index, toFlow(e))) }),
    bend: (index) => ({ onPointerDown: (e) => track(e, bendReshape(edge.bends, index, toFlow(e))) }),
  };
}
