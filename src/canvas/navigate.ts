import type { Board } from '../model/types';

export type Dir = 'left' | 'right' | 'up' | 'down';

const VECTOR: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const CONNECTED_BONUS = 0.6;

export function nearestInDirection(board: Board, fromId: string, dir: Dir): string | null {
  const from = board.nodes.find((n) => n.id === fromId);
  if (!from) return null;
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const [vx, vy] = VECTOR[dir];
  const linked = new Set(board.edges.flatMap((e) => (e.source === fromId ? [e.target] : e.target === fromId ? [e.source] : [])));
  let best: string | null = null;
  let bestScore = Infinity;
  for (const n of board.nodes) {
    if (n.id === fromId || n.kind === 'group') continue;
    const dx = n.x + n.w / 2 - cx;
    const dy = n.y + n.h / 2 - cy;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) continue;
    const along = (dx * vx + dy * vy) / dist;
    if (along < 0.5) continue;
    const score = dist * (2 - along) * (linked.has(n.id) ? CONNECTED_BONUS : 1);
    if (score < bestScore) {
      bestScore = score;
      best = n.id;
    }
  }
  return best;
}
