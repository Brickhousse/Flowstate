import type { Board, FlagKind } from '../model/types';
import { addFlag } from '../ops/flags';
import { flowStore } from '../store/store';
import { requestFocus } from './focusKey';
import { runSafely } from './safe';

export function editBoard<R>(fn: (b: Board) => R): R | undefined {
  return runSafely(() => flowStore.getState().changeBoard(fn));
}

export function addFlagAndFocus(hostId: string, kind: FlagKind): void {
  const id = editBoard((b) => addFlag(b, hostId, kind, ''));
  if (id) requestFocus(`flag:${id}`);
}
