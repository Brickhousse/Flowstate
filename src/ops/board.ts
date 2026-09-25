import type { Board, Direction } from '../model/types';

export function setDirection(b: Board, direction: Direction): void {
  b.direction = direction;
}

export function renameBoard(b: Board, name: string): void {
  b.name = name.trim() || b.name;
}
