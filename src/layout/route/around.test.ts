import { describe, expect, it } from 'vitest';
import type { XY } from '../../model/types';
import type { Rect } from '../geometry';
import { searchAround } from './around';

const A = { x: 0, y: 0, w: 180, h: 72 };
const B = { x: 300, y: 0, w: 180, h: 72 };
const C = { x: 600, y: 0, w: 180, h: 72 };
const from = { x: 185.5, y: 36 };
const to = { x: 594.5, y: 36 };

function cuts(points: XY[], r: Rect): boolean {
  return points.slice(1).some((q, i) => {
    const p = points[i];
    if (p.y === q.y) return r.y < p.y && p.y < r.y + r.h && Math.max(Math.min(p.x, q.x), r.x) < Math.min(Math.max(p.x, q.x), r.x + r.w);
    return r.x < p.x && p.x < r.x + r.w && Math.max(Math.min(p.y, q.y), r.y) < Math.min(Math.max(p.y, q.y), r.y + r.h);
  });
}

describe('searchAround', () => {
  it('finds a right-angled route that avoids every box in the way', () => {
    const route = searchAround({ source: from, sourceSide: 'right', target: to, targetSide: 'left', boxes: [A, B, C] });
    expect(route).not.toBeNull();
    const points = route!;
    expect(points[0]).toEqual(from);
    expect(points[points.length - 1]).toEqual(to);
    expect(points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y)).toBe(true);
    for (const box of [A, B, C]) expect(cuts(points, box)).toBe(false);
  });

  it('goes straight when nothing is in the way', () => {
    expect(searchAround({ source: from, sourceSide: 'right', target: to, targetSide: 'left', boxes: [A, C] })).toEqual([from, to]);
  });

  it('gives up with no route once the time limit passes', () => {
    let t = 0;
    const now = () => (t += 100);
    expect(searchAround({ source: from, sourceSide: 'right', target: to, targetSide: 'left', boxes: [A, B, C] }, { limitMs: 50, now })).toBeNull();
  });

  it('reports no route when an end is boxed in', () => {
    const cage = [{ x: 560, y: -100, w: 20, h: 300 }, { x: 560, y: -100, w: 400, h: 20 }, { x: 560, y: 180, w: 400, h: 20 }, { x: 940, y: -100, w: 20, h: 300 }];
    expect(searchAround({ source: from, sourceSide: 'right', target: to, targetSide: 'left', boxes: [A, C, ...cage] })).toBeNull();
  });

  it('routes across a 200-box board inside the time limit', () => {
    const boxes: Rect[] = [];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 20; c++) boxes.push({ x: c * 252, y: r * 200, w: 180, h: 72 });
    const route = searchAround({ source: { x: 5 * 252 + 185.5, y: 36 }, sourceSide: 'right', target: { x: 15 * 252 - 5.5, y: 9 * 200 + 36 }, targetSide: 'left', boxes });
    expect(route).not.toBeNull();
    for (const box of boxes) expect(cuts(route!, box)).toBe(false);
  });
});
