import type { BoardEdge, Direction, Side, XY } from '../../model/types';
import type { Rect } from '../geometry';

export const STUB = 22;
export const CORNER_RADIUS = 14;
// why: React Flow anchors an arrow at the outer edge of the side dot (9px plus a 1px rendered border, centred on the box edge).
export const PORT_OUTSET = 5.5;

export type Axis = 'x' | 'y';

export const SIDE_DIR: Record<Side, XY> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

export function sideAxis(side: Side): Axis {
  return side === 'left' || side === 'right' ? 'x' : 'y';
}

export function autoSides(direction: Direction): { source: Side; target: Side } {
  return direction === 'LR' ? { source: 'right', target: 'left' } : { source: 'bottom', target: 'top' };
}

export function edgeSides(direction: Direction, edge: Pick<BoardEdge, 'sourceSide' | 'targetSide'>): { source: Side; target: Side } {
  const auto = autoSides(direction);
  return { source: edge.sourceSide ?? auto.source, target: edge.targetSide ?? auto.target };
}

export function portAt(box: Rect, side: Side, t = 0.5): XY {
  const d = SIDE_DIR[side];
  if (sideAxis(side) === 'y') return { x: box.x + box.w * t, y: (side === 'top' ? box.y : box.y + box.h) + d.y * PORT_OUTSET };
  return { x: (side === 'left' ? box.x : box.x + box.w) + d.x * PORT_OUTSET, y: box.y + box.h * t };
}

export function stubEnd(port: XY, side: Side, length = STUB): XY {
  const d = SIDE_DIR[side];
  return { x: port.x + d.x * length, y: port.y + d.y * length };
}
