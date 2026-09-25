import { useReactFlow } from '@xyflow/react';
import { useEffect } from 'react';
import { tidyBoard } from '../layout/tidyBoard';
import { ACTORS, SHAPES, type Actor, type FlagKind } from '../model/types';
import { copySubgraph, pasteSubgraph } from '../ops/clipboard';
import { deleteEdges } from '../ops/edges';
import { addStep, deleteSteps, updateSteps } from '../ops/steps';
import { addNext, addSibling } from '../ops/structure';
import { addText } from '../ops/text';
import { flowStore } from '../store/store';
import { notify } from '../ui/toast';
import { addFlagAndFocus, editBoard } from './boardChange';
import { cursor } from './cursor';
import { nearestInDirection, type Dir } from './navigate';
import { reveal } from './reveal';
import { viewCenter } from './viewport';

const FLAG_KEYS: Record<string, FlagKind> = { b: 'blocker', w: 'warning', q: 'question' };
const ARROWS: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function nextActor(actor: Actor | null): Actor | null {
  const i = actor ? ACTORS.indexOf(actor) : -1;
  return i === ACTORS.length - 1 ? null : ACTORS[i + 1];
}

export function useKeyboard(boardId: string, enabled: boolean): void {
  const rf = useReactFlow();

  useEffect(() => {
    if (!enabled) return;
    let pasteCount = 0;

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return;
      const st = flowStore.getState();
      if (st.activeBoardId !== boardId || st.editingId) return;
      const board = st.project.boards.find((b) => b.id === boardId);
      if (!board) return;
      const focusNew = (id: string | undefined) => {
        if (!id) return;
        st.select([id]);
        st.setEditing(id);
        reveal([id]);
      };
      const sel = st.selection;
      const one = sel.length === 1 ? sel[0] : null;
      const oneStep = one && board.nodes.find((n) => n.id === one)?.kind === 'step' ? one : null;
      const steps = sel.filter((id) => board.nodes.find((n) => n.id === id)?.kind === 'step');
      const key = e.key.toLowerCase();

      if (e.ctrlKey || e.metaKey) {
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) st.redo();
          else st.undo();
        } else if (key === 'y') {
          e.preventDefault();
          st.redo();
        } else if (key === 'a') {
          e.preventDefault();
          st.select(board.nodes.map((n) => n.id));
        } else if (key === 'c' && sel.length) {
          st.setClipboard(copySubgraph(board, sel));
          pasteCount = 0;
        } else if (key === 'v' && st.clipboard) {
          e.preventDefault();
          pasteCount += 1;
          const clip = st.clipboard;
          const ids = editBoard((b) => pasteSubgraph(b, clip, 40 * pasteCount, 40 * pasteCount));
          if (ids) st.select(ids);
        } else if (key === 'd' && sel.length) {
          e.preventDefault();
          const ids = editBoard((b) => pasteSubgraph(b, copySubgraph(b, sel), 40, 40));
          if (ids) st.select(ids);
        }
        return;
      }
      if (e.altKey) return;

      if (e.code === 'Digit1' && e.shiftKey) {
        e.preventDefault();
        rf.fitView({ padding: 0.2, duration: 300 });
        return;
      }
      const dir = ARROWS[e.key];
      if (dir) {
        if (one) {
          e.preventDefault();
          const next = nearestInDirection(board, one, dir);
          if (next) {
            st.select([next]);
            reveal([next]);
          }
        }
        return;
      }

      switch (e.key) {
        case 'Tab':
          e.preventDefault();
          if (oneStep) focusNew(editBoard((b) => addNext(b, oneStep)));
          else if (sel.length === 0) {
            const c = viewCenter(rf);
            focusNew(editBoard((b) => addStep(b, { x: c.x - 90, y: c.y - 36 })));
          }
          return;
        case 'Enter':
          if (oneStep) {
            e.preventDefault();
            focusNew(editBoard((b) => addSibling(b, oneStep)));
          }
          return;
        case 'F2':
          if (one) {
            e.preventDefault();
            st.setEditing(one);
          }
          return;
        case 'Escape':
          st.select([]);
          return;
        case 'Delete':
        case 'Backspace':
          if (!sel.length && !st.edgeSelection.length) return;
          e.preventDefault();
          editBoard((b) => {
            if (sel.length) deleteSteps(b, sel, { reconnect: e.shiftKey });
            const edges = st.edgeSelection.filter((id) => b.edges.some((x) => x.id === id));
            if (edges.length) deleteEdges(b, edges);
          });
          st.select([]);
          return;
      }

      if (e.key.length !== 1 || e.key === ' ') return;
      if (/^[1-9]$/.test(e.key)) {
        if (steps.length) {
          e.preventDefault();
          const shape = SHAPES[Number(e.key) - 1];
          editBoard((b) => updateSteps(b, steps.map((id) => ({ id, shape }))));
        }
        return;
      }
      const flagTarget = one ?? (st.edgeSelection.length === 1 ? st.edgeSelection[0] : null);
      if (key === 'a' && steps.length) {
        const actor = nextActor(board.nodes.find((n) => n.id === steps[0])!.actor);
        editBoard((b) => updateSteps(b, steps.map((id) => ({ id, actor }))));
      } else if (FLAG_KEYS[key] && flagTarget) {
        e.preventDefault();
        addFlagAndFocus(flagTarget, FLAG_KEYS[key]);
      } else if (key === 't') {
        e.preventDefault();
        const at = cursor.flow ?? viewCenter(rf);
        focusNew(editBoard((b) => addText(b, { text: '', x: at.x, y: at.y })));
      } else if (key === 'c') {
        st.toggleCriticalPath();
      } else if (key === 'l') {
        tidyBoard(flowStore, boardId).catch((err: unknown) => notify(`Tidy failed: ${err instanceof Error ? err.message : String(err)}`));
      } else if (one) {
        e.preventDefault();
        st.setEditing(one, e.key);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rf, boardId, enabled]);
}
