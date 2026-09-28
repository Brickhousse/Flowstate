import { ViewportPortal } from '@xyflow/react';
import { useRef, useState } from 'react';
import { roundedPath } from '../../layout/route/path';
import type { Board, BoardEdge } from '../../model/types';
import { flowStore } from '../../store/store';
import type { Route } from '../arrowRoutes';
import { EdgeOptions } from '../EdgeOptions';
import { EdgeTypeIcon } from '../labels';
import { focusStops, MenuFooter } from '../menu/MenuFooter';
import { MenuList, type MenuEntry } from '../menu/MenuList';
import { Popup, type MenuAnchor } from '../menu/Popup';

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
  const list = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
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
  const toFooter = (back: boolean) => focusStops(foot.current).at(back ? -1 : 0)?.focus();
  return (
    <>
      {glow && <Glow route={glow} />}
      <Popup at={at} onClose={onClose} wheelInside="scroll" className="has-footer">
        <MenuList entries={entries} close={onClose} label="Arrows here" passKeys listRef={list} onTab={toFooter} onLeave={() => setPreviewed(null)} />
        <MenuFooter ref={foot} list={list} onClose={onClose}>
          <div role="group" aria-label="Arrow options" className="fs-edge-options">
            <EdgeOptions key={arrow.id} edge={arrow} />
          </div>
        </MenuFooter>
      </Popup>
    </>
  );
}
