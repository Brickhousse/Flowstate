import { fitGroup } from '../layout/place';
import type { TidyResult } from '../layout/tidy';
import type { Board, Direction } from '../model/types';

export function setDirection(b: Board, direction: Direction): void {
  b.direction = direction;
}

export function renameBoard(b: Board, name: string): void {
  b.name = name.trim() || b.name;
}

export function applyTidy(b: Board, result: TidyResult): void {
  for (const n of b.nodes) {
    const p = result.positions[n.id];
    if (p) {
      n.x = p.x;
      n.y = p.y;
    }
  }
  for (const lane of b.lanes) {
    const h = result.laneHeights[lane.id];
    if (h) lane.height = h;
  }
  for (const g of b.nodes) if (g.kind === 'group') fitGroup(b, g.id);
}
