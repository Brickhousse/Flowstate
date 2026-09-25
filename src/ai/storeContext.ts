import type { StoreApi } from 'zustand/vanilla';
import type { FlowStore } from '../store/store';
import type { ToolContext } from './executor';

export function storeToolContext(store: StoreApi<FlowStore>, tidy: (boardId: string) => Promise<void>): ToolContext {
  return {
    getProject: () => store.getState().project,
    activeBoardId: () => store.getState().activeBoardId,
    changeBoard: (boardId, fn) => store.getState().changeBoard(fn, boardId),
    createBoard: (name, activate) => store.getState().addBoard(name, activate),
    tidy,
  };
}
