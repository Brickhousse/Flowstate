import type { Board, XY } from '../model/types';

const EPS = 0.01;

export function shiftBends(b: Board, moved: ReadonlyMap<string, XY>): void {
  for (const e of b.edges) {
    const s = moved.get(e.source);
    const t = moved.get(e.target);
    if (!e.bends.length || !s || !t) continue;
    if (Math.abs(s.x - t.x) > EPS || Math.abs(s.y - t.y) > EPS || (s.x === 0 && s.y === 0)) continue;
    e.bends = e.bends.map((p) => ({ x: p.x + s.x, y: p.y + s.y }));
  }
}
