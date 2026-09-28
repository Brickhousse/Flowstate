import { useReactFlow, useStoreApi } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { Board, XY } from '../../model/types';
import { flowStore, useFlow } from '../../store/store';
import type { Route } from '../arrowRoutes';
import type { MenuAnchor } from '../menu/ContextMenu';
import type { FlowEdgeType } from '../toFlow';
import { ArrowPickPanel } from './ArrowPickPanel';
import { arrowsAt, pickTolerance, stackOrder } from './arrowsAt';
import { panelArrow } from './panelArrow';

type PickState = { at: MenuAnchor; ids: string[]; n: number };

type Picker = { onEdgeClick: (event: ReactMouseEvent, edge: { id: string }) => void; panel: ReactNode; open: boolean };

export function useArrowPicker(boardId: string, editable: boolean, board: Board | undefined, routes: ReadonlyMap<string, Route> | null, edges: readonly FlowEdgeType[]): Picker {
  const rf = useReactFlow();
  const rfStore = useStoreApi();
  const [pick, setPick] = useState<PickState | null>(null);
  const opens = useRef(0);
  // why: a stable onEdgeClick keeps React Flow from re-rendering every edge on each board change.
  const latest = useRef({ routes, edges });
  useEffect(() => {
    latest.current = { routes, edges };
  }, [routes, edges]);
  const close = useCallback(() => setPick(null), []);

  useEffect(() => setPick(null), [boardId]);

  const arrowId = useFlow((s) => (pick ? panelArrow(pick.ids, s.edgeSelection, s.selection) : null));
  const arrow = arrowId ? board?.edges.find((e) => e.id === arrowId) : undefined;
  useEffect(() => {
    if (pick && !arrow) setPick(null);
  }, [pick, arrow]);

  useEffect(() => {
    if (!pick) return;
    const [x, y, zoom] = rfStore.getState().transform;
    return rfStore.subscribe(({ transform: t }) => {
      if (t[0] !== x || t[1] !== y || t[2] !== zoom) setPick(null);
    });
  }, [pick, rfStore]);

  const hitsAt = useCallback(
    (at: XY): string[] => {
      const { routes, edges } = latest.current;
      if (!routes) return [];
      return arrowsAt(routes, stackOrder(edges), rf.screenToFlowPosition(at), pickTolerance(rfStore.getState().transform[2]));
    },
    [rf, rfStore],
  );

  const choose = useCallback((ids: string[], at: MenuAnchor) => {
    flowStore.getState().select([], [ids[0]]);
    if (ids.length > 1) setPick({ at, ids, n: ++opens.current });
  }, []);

  useEffect(() => {
    if (!editable) return;
    let down: XY | null = null;
    const onDot = (t: EventTarget | null) => t instanceof Element && !!t.closest('.react-flow__handle') && !!rfStore.getState().domNode?.contains(t);
    const onDown = (e: PointerEvent) => {
      down = e.button === 0 && onDot(e.target) ? { x: e.clientX, y: e.clientY } : null;
    };
    // why: ADR-0016
    const onClick = (e: MouseEvent) => {
      const start = down;
      down = null;
      if (!start || e.shiftKey || !onDot(e.target)) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > rfStore.getState().connectionDragThreshold) return;
      const at = { x: e.clientX, y: e.clientY };
      const ids = hitsAt(at);
      if (!ids.length) return;
      e.stopPropagation();
      if (e.detail < 2) choose(ids, at);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('click', onClick, true);
    };
  }, [editable, rfStore, hitsAt, choose]);

  const onEdgeClick = useCallback(
    (e: ReactMouseEvent, edge: { id: string }) => {
      if (!editable || e.shiftKey || e.detail > 1) return;
      // Toolbar and label clicks bubble here through their portals.
      if (!(e.target instanceof Element) || !e.target.closest('.react-flow__edge')) return;
      const at = { x: e.clientX, y: e.clientY };
      // why: ADR-0016
      const ids = [edge.id, ...hitsAt(at).filter((id) => id !== edge.id)];
      if (ids.length > 1) choose(ids, at);
    },
    [editable, hitsAt, choose],
  );

  const open = !!(pick && arrow && board && routes);
  const panel = open ? <ArrowPickPanel key={pick.n} at={pick.at} ids={pick.ids} arrow={arrow} board={board} routes={routes} onClose={close} /> : null;
  return { onEdgeClick, panel, open };
}
