import type { Board } from '../model/types';

export const GAP_MAIN = 72;
export const GAP_CROSS = 40;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Axes {
  main: 'x' | 'y';
  cross: 'x' | 'y';
  mainSize: 'w' | 'h';
  crossSize: 'w' | 'h';
}

export function axes(board: Board): Axes {
  return board.direction === 'LR'
    ? { main: 'x', cross: 'y', mainSize: 'w', crossSize: 'h' }
    : { main: 'y', cross: 'x', mainSize: 'h', crossSize: 'w' };
}

export function overlaps(a: Rect, b: Rect, pad = 16): boolean {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
