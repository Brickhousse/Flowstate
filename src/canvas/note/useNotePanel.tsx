import { useReactFlow } from '@xyflow/react';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { Board } from '../../model/types';
import { holdDraft } from '../../store/drafts';
import { flowStore } from '../../store/store';
import { boardOf } from '../commands';
import type { NoteControls } from './noteControls';
import { NotePanel } from './NotePanel';
import { createNoteSession } from './noteSession';

const PANEL_GAP = 8;

type NotePanelHandle = { controls: NoteControls; panel: ReactNode };

export function useNotePanel(boardId: string, editable: boolean, board: Board | undefined): NotePanelHandle {
  const rf = useReactFlow();
  const session = useMemo(() => createNoteSession(flowStore, boardId), [boardId]);
  const nodeId = useStore(session.state, (s) => s.nodeId);
  const node = nodeId ? board?.nodes.find((n) => n.id === nodeId) : undefined;

  useEffect(() => {
    const release = holdDraft(session.close);
    return () => {
      release();
      session.close();
    };
  }, [session]);
  useEffect(() => {
    if (nodeId && !node) session.close();
  }, [session, nodeId, node]);

  const at = useMemo(() => {
    const n = nodeId ? boardOf(boardId)?.nodes.find((x) => x.id === nodeId) : undefined;
    if (!n) return null;
    const p = rf.flowToScreenPosition({ x: n.x, y: n.y + n.h });
    return { x: p.x, y: p.y + PANEL_GAP };
  }, [rf, boardId, nodeId]);

  const panel = node && at ? <NotePanel key={node.id} at={at} note={node.note} editable={editable} onEdit={session.edit} onClose={session.close} /> : null;
  return { controls: session, panel };
}
