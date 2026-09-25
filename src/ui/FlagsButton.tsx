import { Flag } from 'lucide-react';
import { useMemo } from 'react';
import { FLAG_LABEL } from '../canvas/labels';
import { reveal } from '../canvas/reveal';
import type { Board } from '../model/types';
import { openFlags } from '../ops/flags';
import { flowStore, selectActiveBoard, useFlow } from '../store/store';
import { MenuButton } from './Popover';

function hostName(board: Board, id: string, kind: 'node' | 'edge'): string {
  const title = (nodeId: string) => board.nodes.find((n) => n.id === nodeId)?.title || nodeId;
  if (kind === 'node') return title(id);
  const e = board.edges.find((x) => x.id === id);
  return e ? `${title(e.source)} to ${title(e.target)}` : id;
}

function focusHost(board: Board, id: string, kind: 'node' | 'edge'): void {
  const st = flowStore.getState();
  if (kind === 'node') {
    st.select([id]);
    reveal([id]);
    return;
  }
  const e = board.edges.find((x) => x.id === id);
  st.select([], [id]);
  if (e) reveal([e.source]);
}

export function FlagsButton() {
  const board = useFlow(selectActiveBoard);
  const flags = useMemo(() => openFlags(board), [board]);
  return (
    <MenuButton
      title="Open flags"
      className={flags.length ? 'has-flags' : ''}
      label={
        <>
          <Flag size={14} />
          <span>{flags.length}</span>
        </>
      }
    >
      {(close) =>
        flags.length === 0 ? (
          <div className="menu-empty">No open flags</div>
        ) : (
          flags.map(({ flag, hostId, hostKind }) => (
            <button
              key={flag.id}
              type="button"
              role="menuitem"
              className="menu-item flag-item"
              onClick={() => {
                close();
                focusHost(board, hostId, hostKind);
              }}
            >
              <span className={`fs-flag-dot flag-${flag.kind}`} />
              <span className="flag-text">{flag.text || FLAG_LABEL[flag.kind]}</span>
              <span className="flag-host">{hostName(board, hostId, hostKind)}</span>
            </button>
          ))
        )
      }
    </MenuButton>
  );
}
