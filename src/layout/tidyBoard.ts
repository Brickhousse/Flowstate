import type { ELK } from 'elkjs/lib/elk-api';
import type { StoreApi } from 'zustand/vanilla';
import { applyTidy } from '../ops/board';
import type { FlowStore } from '../store/store';
import { getElk } from './elkClient';
import { computeTidy } from './tidy';

export async function tidyBoard(store: StoreApi<FlowStore>, boardId: string, elk: ELK = getElk()): Promise<void> {
  const board = store.getState().project.boards.find((b) => b.id === boardId);
  if (!board) return;
  const result = await computeTidy(elk, board);
  store.getState().changeBoard((b) => applyTidy(b, result), boardId);
}
