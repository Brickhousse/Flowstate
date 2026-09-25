import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { runSafely } from '../canvas/safe';
import { renameBoard } from '../ops/board';
import { flowStore, useFlow } from '../store/store';
import { InlineRename } from './controls';
import { notify } from './toast';

export function BoardTabs() {
  const boards = useFlow((s) => s.project.boards);
  const active = useFlow((s) => s.activeBoardId);
  const split = useFlow((s) => s.splitBoardId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const st = flowStore.getState;

  return (
    <nav className="board-tabs" aria-label="Boards">
      {boards.map((b) => (
        <div key={b.id} className={`board-tab ${b.id === active ? 'is-active' : ''} ${b.id === split ? 'is-split' : ''}`}>
          {renaming === b.id ? (
            <InlineRename
              label="Board name"
              value={b.name}
              onDone={(name) => {
                setRenaming(null);
                if (name) runSafely(() => st().changeBoard((x) => renameBoard(x, name), b.id));
              }}
            />
          ) : (
            <button
              type="button"
              className="board-tab-btn"
              title="Click to open. Shift+click to view beside. Double-click to rename."
              onClick={(e) => (e.shiftKey ? st().setSplitBoard(b.id === split ? null : b.id) : st().setActiveBoard(b.id))}
              onDoubleClick={() => setRenaming(b.id)}
            >
              {b.name}
            </button>
          )}
          {boards.length > 1 && (
            <button
              type="button"
              className="board-tab-close"
              aria-label={`Delete ${b.name}`}
              title="Delete board (Ctrl+Z to undo)"
              onClick={() => {
                runSafely(() => st().deleteBoard(b.id));
                if (!st().project.boards.some((x) => x.id === b.id)) notify(`Deleted "${b.name}". Ctrl+Z to undo.`);
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="board-tab-add"
        aria-label="New board"
        title="New board"
        onClick={() => {
          const id = st().addBoard(`Board ${boards.length + 1}`);
          setRenaming(id);
        }}
      >
        <Plus size={14} />
      </button>
    </nav>
  );
}
