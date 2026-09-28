import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { moveSegment, segmentAxis, simplify } from '../layout/route/through';
import type { BoardEdge, XY } from '../model/types';
import { setBends } from '../ops/arrowPath';
import { layoutPrefs } from '../store/layoutPrefs';
import { flowStore } from '../store/store';
import { mods } from './assist/modifiers';
import { GRID } from './assist/snap';
import { runSafely } from './safe';

type Session =
  | { kind: 'segment'; points: XY[]; index: number; across: 'x' | 'y'; offset: number }
  | { kind: 'bend'; bends: XY[]; index: number; offset: XY };

export interface HandleEvents {
  onPointerDown(e: ReactPointerEvent<SVGElement>): void;
}

export interface ArrowDrag {
  segment(index: number): HandleEvents;
  bend(index: number): HandleEvents;
}

function snap(v: number): number {
  return layoutPrefs.getState().prefs.gridSnap && !mods.alt ? Math.round(v / GRID) * GRID : v;
}

function bendsFor(s: Session, at: XY): XY[] {
  if (s.kind === 'segment') return simplify(moveSegment(s.points, s.index, snap(at[s.across] + s.offset))).slice(1, -1);
  return s.bends.map((p, i) => (i === s.index ? { x: snap(at.x + s.offset.x), y: snap(at.y + s.offset.y) } : p));
}

export function useArrowDrag(edge: BoardEdge, corners: XY[]): ArrowDrag {
  const rf = useReactFlow();
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const toFlow = (e: { clientX: number; clientY: number }) => rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });

  // why: listen on window, because a segment that lines up with its neighbour vanishes mid-drag along with its bar.
  const track = (e: ReactPointerEvent<SVGElement>, s: Session) => {
    if (e.button !== 0 || stop.current) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    flowStore.getState().begin();
    const onMove = (ev: PointerEvent) => {
      const bends = bendsFor(s, toFlow(ev));
      runSafely(() =>
        flowStore.getState().changeBoard((b) => {
          if (b.edges.some((x) => x.id === edge.id)) setBends(b, edge.id, bends);
        }),
      );
    };
    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      stop.current = null;
      flowStore.getState().commit();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    stop.current = finish;
  };

  return {
    segment: (index) => ({
      onPointerDown: (e) => {
        const across = segmentAxis(corners[index], corners[index + 1]) === 'x' ? 'y' : 'x';
        track(e, { kind: 'segment', points: corners, index, across, offset: corners[index][across] - toFlow(e)[across] });
      },
    }),
    bend: (index) => ({
      onPointerDown: (e) => {
        const at = toFlow(e);
        const p = edge.bends[index];
        track(e, { kind: 'bend', bends: edge.bends, index, offset: { x: p.x - at.x, y: p.y - at.y } });
      },
    }),
  };
}
