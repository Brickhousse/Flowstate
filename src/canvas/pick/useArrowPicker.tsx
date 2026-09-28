import { useReactFlow, useStoreApi } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { Board, XY } from '../../model/types';
import { flowStore } from '../../store/store';
import type { Route } from '../arrowRoutes';
import type { MenuAnchor } from '../menu/ContextMenu';
import type { FlowEdgeType } from '../toFlow';
import { ArrowPickList } from './ArrowPickList';
import { arrowsAt, pickTolerance, stackOrder } from './arrowsAt';

type Pick = { at: MenuAnchor; ids: string[]; n: number };

type Picker = { onEdgeClick: (event: ReactMouseEvent) => void; list: ReactNode };

export function useArrowPicker(boardId: string, editable: boolean, board: Board | undefined, routes: ReadonlyMap<string, Route> | null, edges: readonly FlowEdgeType[]): Picker {
  const rf = useReactFlow();
  const rfStore = useStoreApi();
  const [pick, setPick] = useState<Pick | null>(null);
  const opens = useRef(0);
  // why: a stable onEdgeClick keeps React Flow from re-rendering every edge on each board change.
  const latest = useRef({ routes, edges });
  useEffect(() => {
    latest.current = { routes, edges };
  }, [routes, edges]);
  const close = useCallback(() => setPick(null), []);

  useEffect(() => setPick(null), [board, boardId]);

  useEffect(() => {
    if (!pick) return;
    const [x, y, zoom] = rfStore.getState().transform;
    return rfStore.subscribe(({ transform: t }) => {
      if (t[0] !== x || t[1] !== y || t[2] !== zoom) setPick(null);
    });
  }, [pick, rfStore]);

  const choose = useCallback(
    (x: number, y: number, fewest: number) => {
      const { routes, edges } = latest.current;
      if (!routes) return;
      const tolerance = pickTolerance(rfStore.getState().transform[2]);
      const ids = arrowsAt(routes, stackOrder(edges), rf.screenToFlowPosition({ x, y }), tolerance);
      if (ids.length < fewest) return;
      flowStore.getState().select([], [ids[0]]);
      if (ids.length > 1) setPick({ at: { x, y }, ids, n: ++opens.current });
    },
    [rf, rfStore],
  );

  useEffect(() => {
    if (!editable) return;
    let down: XY | null = null;
    const onDot = (t: EventTarget | null) => t instanceof Element && !!t.closest('.react-flow__handle') && !!rfStore.getState().domNode?.contains(t);
    const onDown = (e: PointerEvent) => {
      down = e.button === 0 && onDot(e.target) ? { x: e.clientX, y: e.clientY } : null;
    };
    // why: ADR-0014
    const onClick = (e: MouseEvent) => {
      const start = down;
      down = null;
      if (!start || e.shiftKey || !onDot(e.target)) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > rfStore.getState().connectionDragThreshold) return;
      e.stopPropagation();
      if (e.detail < 2) choose(e.clientX, e.clientY, 1);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('click', onClick, true);
    };
  }, [editable, rfStore, choose]);

  const onEdgeClick = useCallback(
    (e: ReactMouseEvent) => {
      if (editable && !e.shiftKey && e.detail < 2) choose(e.clientX, e.clientY, 2);
    },
    [editable, choose],
  );

  const list = pick && board && routes ? <ArrowPickList key={pick.n} at={pick.at} ids={pick.ids} board={board} routes={routes} onClose={close} /> : null;
  return { onEdgeClick, list };
}
