import type { Board, XY } from '../model/types';

export interface DragContext {
  edgeId: string;
  boardId: string;
  pressed: XY;
  change(fn: (b: Board) => void): void;
  toFlow(e: { clientX: number; clientY: number }): XY;
}

// move returns false to end the drag at once, as a cancel.
export interface DragSession {
  move(ev: PointerEvent): boolean;
  finish(drop: PointerEvent | null): void;
}
