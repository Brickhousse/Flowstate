import type { XY } from '../../model/types';
import { addBend, removeBend, resetPath, routeAround, setSeparate } from '../../ops/arrowPath';
import { deleteEdges, updateEdge } from '../../ops/edges';
import { flowStore } from '../../store/store';
import { notify } from '../../ui/toast';
import { routeFor } from '../arrowRoutes';
import { boardOf, editArrowLabel, run } from '../commands';
import { colourEntries } from './colourEntries';
import type { MenuEntry } from './MenuList';

function addBendAt(boardId: string, edgeId: string, at: XY): void {
  const board = boardOf(boardId);
  const route = board && routeFor(board, edgeId);
  if (route) run(boardId, (b) => addBend(b, edgeId, at, route.points));
}

function routeAroundArrows(boardId: string, ids: string[]): void {
  const missed = run(boardId, (b) => ids.filter((id) => !routeAround(b, id)));
  if (missed?.length) notify(ids.length === 1 ? 'No route found around the boxes.' : `No route found around the boxes for ${missed.length} of ${ids.length} arrows.`);
}

export function arrowEntries(boardId: string, edgeId: string, at: XY, bend: number | null): MenuEntry[] {
  const st = flowStore.getState();
  const board = boardOf(boardId);
  const edge = board?.edges.find((e) => e.id === edgeId);
  if (!board || !edge) return [];
  const ids = st.edgeSelection.includes(edgeId) ? st.edgeSelection : [edgeId];
  const shaped = board.edges.some((e) => ids.includes(e.id) && e.bends.length > 0);
  const paint = (color: string | null) =>
    run(boardId, (b) => {
      for (const id of ids) updateEdge(b, id, { color });
    });
  const removeBendEntry: MenuEntry[] = bend === null ? [] : [{ kind: 'item', label: 'Remove bend', run: () => run(boardId, (b) => removeBend(b, edgeId, bend)) }];
  return [
    { kind: 'item', label: 'Edit label', run: () => editArrowLabel(edgeId) },
    { kind: 'item', label: "Don't merge", checked: edge.separate, run: () => run(boardId, (b) => setSeparate(b, ids, !edge.separate)) },
    { kind: 'item', label: 'Add bend here', run: () => addBendAt(boardId, edgeId, at) },
    ...removeBendEntry,
    { kind: 'item', label: 'Route around boxes', run: () => routeAroundArrows(boardId, ids) },
    { kind: 'item', label: 'Reset path', disabled: !shaped, run: () => run(boardId, (b) => resetPath(b, ids)) },
    { kind: 'submenu', label: 'Colour', entries: colourEntries(edge.color, paint, { line: true }) },
    { kind: 'sep' },
    { kind: 'item', label: 'Delete arrow', shortcut: 'Del', run: () => run(boardId, (b) => deleteEdges(b, ids)) },
  ];
}
