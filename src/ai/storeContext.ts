import type { StoreApi } from 'zustand/vanilla';
import type { FlowStore } from '../store/store';
import type { ToolContext } from './executor';

// With pinnedBoardId, tool calls that name no board target that board for the whole turn, whatever tab the user is on.
export function storeToolContext(store: StoreApi<FlowStore>, tidy: (boardId: string) => Promise<void>, pinnedBoardId?: string): ToolContext {
  let pinned = pinnedBoardId;
  return {
    getProject: () => store.getState().project,
    activeBoardId: () => pinned ?? store.getState().activeBoardId,
    changeBoard: (boardId, fn) => store.getState().changeBoard(fn, boardId),
    createBoard: (name, activate) => {
      const id = store.getState().addBoard(name, activate);
      if (activate && pinned !== undefined) pinned = id;
      return id;
    },
    tidy,
  };
}
