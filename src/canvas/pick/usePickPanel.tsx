import { useStoreApi } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Board } from '../../model/types';
import { useFlow } from '../../store/store';
import type { Route } from '../arrowRoutes';
import type { MenuAnchor } from '../menu/Popup';
import { ArrowPickPanel } from './ArrowPickPanel';
import { panelArrow } from './panelArrow';

type PickState = { at: MenuAnchor; ids: string[]; n: number };

type PickPanel = { open: (ids: string[], at: MenuAnchor) => void; panel: ReactNode; isOpen: boolean };

export function usePickPanel(boardId: string, board: Board | undefined, routes: ReadonlyMap<string, Route> | null): PickPanel {
  const rfStore = useStoreApi();
  const [pick, setPick] = useState<PickState | null>(null);
  const opens = useRef(0);
  const close = useCallback(() => setPick(null), []);
  const open = useCallback((ids: string[], at: MenuAnchor) => setPick({ at, ids, n: ++opens.current }), []);

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

  const isOpen = !!(pick && arrow && board && routes);
  const panel = isOpen ? <ArrowPickPanel key={pick.n} at={pick.at} ids={pick.ids} arrow={arrow} board={board} routes={routes} onClose={close} /> : null;
  return { open, panel, isOpen };
}
