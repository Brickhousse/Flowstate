import { ViewportPortal } from '@xyflow/react';
import { useState } from 'react';
import { roundedPath } from '../../layout/route/path';
import type { Board, BoardEdge } from '../../model/types';
import { flowStore } from '../../store/store';
import type { Route } from '../arrowRoutes';
import { EdgeOptions } from '../EdgeOptions';
import { EdgeTypeIcon } from '../labels';
import { ContextMenu, type MenuAnchor, type MenuEntry } from '../menu/ContextMenu';

function nameOf(board: Board, edge: BoardEdge): string {
  if (edge.label) return edge.label;
  const title = (id: string) => board.nodes.find((n) => n.id === id)?.title || 'Untitled';
  return `${title(edge.source)} → ${title(edge.target)}`;
}

function Glow({ route }: { route: Route }) {
  return (
    <ViewportPortal>
      <svg className="fs-pick-glow" width={1} height={1} aria-hidden>
        <path d={roundedPath(route.points)} />
      </svg>
    </ViewportPortal>
  );
}

type Props = { at: MenuAnchor; ids: string[]; arrow: BoardEdge; board: Board; routes: ReadonlyMap<string, Route>; onClose: () => void };

export function ArrowPickPanel({ at, ids, arrow, board, routes, onClose }: Props) {
  const [previewed, setPreviewed] = useState<string | null>(null);
  const entries: MenuEntry[] = [];
  for (const id of ids) {
    const edge = board.edges.find((e) => e.id === id);
    if (!edge) continue;
    entries.push({
      kind: 'item',
      label: nameOf(board, edge),
      icon: <EdgeTypeIcon type={edge.type} />,
      checked: id === arrow.id,
      radio: true,
      keepOpen: true,
      preview: () => setPreviewed(id),
      run: () => flowStore.getState().select([], [id]),
    });
  }
  const glow = previewed ? routes.get(previewed) : undefined;
  return (
    <>
      {glow && <Glow route={glow} />}
      <ContextMenu
        at={at}
        entries={entries}
        label="Arrows here"
        passKeys
        onClose={onClose}
        onListLeave={() => setPreviewed(null)}
        footer={
          <div role="group" aria-label="Arrow options" className="fs-edge-options">
            <EdgeOptions key={arrow.id} edge={arrow} />
          </div>
        }
      />
    </>
  );
}
