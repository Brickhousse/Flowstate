import { useCallback, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import type { Board, XY } from '../../model/types';
import { flowStore } from '../../store/store';
import type { Route } from '../arrowRoutes';
import { reportedFirst } from './arrowsAt';
import type { ArrowsAtScreen } from './useArrowsAt';
import { usePickPanel } from './usePickPanel';
import { useSideDotClicks } from './useSideDotClicks';

type Picker = { onEdgeClick: (event: ReactMouseEvent, edge: { id: string }) => void; panel: ReactNode; open: boolean };

export function useArrowPicker(boardId: string, editable: boolean, board: Board | undefined, routes: ReadonlyMap<string, Route> | null, hitsAt: ArrowsAtScreen): Picker {
  const { open: openPanel, panel, isOpen } = usePickPanel(boardId, board, routes);

  const choose = useCallback(
    (ids: string[], at: XY) => {
      flowStore.getState().select([], [ids[0]]);
      if (ids.length > 1) openPanel(ids, at);
    },
    [openPanel],
  );

  const onDotClick = useCallback(
    (at: XY, detail: number) => {
      const ids = hitsAt(at);
      if (!ids.length) return false;
      if (detail < 2) choose(ids, at);
      return true;
    },
    [hitsAt, choose],
  );
  useSideDotClicks(editable, onDotClick);

  const onEdgeClick = useCallback(
    (e: ReactMouseEvent, edge: { id: string }) => {
      if (!editable || e.shiftKey || e.detail > 1) return;
      // Toolbar and label clicks bubble here through their portals.
      if (!(e.target instanceof Element) || !e.target.closest('.react-flow__edge')) return;
      const at = { x: e.clientX, y: e.clientY };
      const ids = reportedFirst(edge.id, hitsAt(at));
      if (ids.length > 1) choose(ids, at);
    },
    [editable, hitsAt, choose],
  );

  return { onEdgeClick, panel, open: isOpen };
}
