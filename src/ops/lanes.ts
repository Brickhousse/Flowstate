import { axes, laneAt } from '../layout/place';
import type { Board, BoardNode } from '../model/types';
import { OpError } from './errors';

export function assertLane(b: Board, laneId: string): void {
  if (!b.lanes.some((l) => l.id === laneId)) {
    const known = b.lanes.map((l) => `${l.id} "${l.name}"`).join(', ') || 'none';
    throw new OpError(`Unknown lane "${laneId}". Lanes: ${known}.`);
  }
}

export function syncLane(b: Board, node: BoardNode): void {
  if (b.lanes.length === 0 || node.kind !== 'step') return;
  const ax = axes(b);
  node.laneId = laneAt(b, node[ax.cross] + node[ax.crossSize] / 2);
}
