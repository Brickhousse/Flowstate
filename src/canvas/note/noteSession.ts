import { createStore, type StoreApi } from 'zustand/vanilla';
import { noteToSave } from '../../model/note';
import { updateSteps } from '../../ops/steps';
import type { FlowStore } from '../../store/store';

export interface NoteSession {
  state: StoreApi<{ nodeId: string | null }>;
  open(nodeId: string): void;
  toggle(nodeId: string): void;
  edit(text: string): void;
  close(): void;
}

export function createNoteSession(flow: StoreApi<FlowStore>, boardId: string, onDraftLost: () => void): NoteSession {
  const state = createStore<{ nodeId: string | null }>()(() => ({ nodeId: null }));
  let draft: string | null = null;

  const close = () => {
    const { nodeId } = state.getState();
    const text = draft;
    draft = null;
    if (!nodeId) return;
    state.setState({ nodeId: null });
    const node = flow.getState().project.boards.find((b) => b.id === boardId)?.nodes.find((n) => n.id === nodeId);
    if (!node) {
      if (text?.trim()) onDraftLost();
      return;
    }
    const note = text !== null ? noteToSave(node.note, text) : null;
    if (note !== null) flow.getState().changeBoard((b) => updateSteps(b, [{ id: nodeId, note }]), boardId);
  };

  const open = (nodeId: string) => {
    if (state.getState().nodeId === nodeId) return;
    close();
    state.setState({ nodeId });
  };

  return {
    state,
    open,
    toggle(nodeId) {
      if (state.getState().nodeId === nodeId) close();
      else open(nodeId);
    },
    edit(text) {
      if (state.getState().nodeId) draft = text;
    },
    close,
  };
}
