import { produce } from 'immer';
import type { Board } from '../model/types';

export function runOp<R>(board: Board, fn: (draft: Board) => R): { board: Board; result: R } {
  let result!: R;
  const next = produce(board, (draft) => {
    result = fn(draft as Board);
  });
  return { board: next, result };
}
