import { describe, expect, it } from 'vitest';
import type { XY } from '../../model/types';
import type { Rect } from '../geometry';
import { searchAround, type AroundInput } from './around';
import { STUB, stubEnd } from './ports';

const A = { x: 0, y: 0, w: 180, h: 72 };
const B = { x: 300, y: 0, w: 180, h: 72 };
const C = { x: 600, y: 0, w: 180, h: 72 };
const from = { x: 185.5, y: 36 };
const to = { x: 594.5, y: 36 };

const leg = (p: XY, q: XY) => Math.abs(q.x - p.x) + Math.abs(q.y - p.y);

const PAD = 16;
const padded = (r: Rect): Rect => ({ x: r.x - PAD, y: r.y - PAD, w: r.w + PAD * 2, h: r.h + PAD * 2 });

function clearOfPadding(route: XY[], input: AroundInput): boolean {
  const between = [stubEnd(input.source, input.sourceSide), ...route.slice(1, -1), stubEnd(input.target, input.targetSide)];
  return input.boxes.every((box) => !cuts(between, padded(box)));
}

function cuts(points: XY[], r: Rect): boolean {
  return points.slice(1).some((q, i) => {
    const p = points[i];
    if (p.y === q.y) return r.y < p.y && p.y < r.y + r.h && Math.max(Math.min(p.x, q.x), r.x) < Math.min(Math.max(p.x, q.x), r.x + r.w);
    return r.x < p.x && p.x < r.x + r.w && Math.max(Math.min(p.y, q.y), r.y) < Math.min(Math.max(p.y, q.y), r.y + r.h);
  });
}

describe('searchAround', () => {
  it('finds a right-angled route that avoids every box in the way', () => {
    const input = { source: from, sourceSide: 'right', target: to, targetSide: 'left', boxes: [A, B, C] } as const;
    const route = searchAround({ ...input, boxes: [...input.boxes] });
    expect(route).not.toBeNull();
    const points = route ?? [];
    expect(points[0]).toEqual(from);
    expect(points[points.length - 1]).toEqual(to);
    expect(points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y)).toBe(true);
    expect(clearOfPadding(points, { ...input, boxes: [...input.boxes] })).toBe(true);
  });

  it('goes straight when nothing is in the way', () => {
    expect(searchAround({ source: from, sourceSide: 'right', target: to, targetSide: 'left', boxes: [A, C] })).toEqual([from, to]);
  });

  it('gives up with no route once the time limit passes', () => {
    let t = 0;
    const now = () => (t += 100);
    expect(searchAround({ source: from, sourceSide: 'right', target: to, targetSide: 'left', boxes: [A, B, C] }, { limitMs: 50, now })).toBeNull();
  });

  it('reports no route once the search runs out of room around a caged end', () => {
    const cage = [{ x: 500, y: -100, w: 20, h: 300 }, { x: 500, y: -100, w: 460, h: 20 }, { x: 500, y: 180, w: 460, h: 20 }, { x: 940, y: -100, w: 20, h: 300 }];
    let reads = 0;
    const now = () => (reads++, 0);
    expect(searchAround({ source: from, sourceSide: 'right', target: to, targetSide: 'left', boxes: [A, C, ...cage] }, { now })).toBeNull();
    expect(reads).toBeGreaterThan(2);
  });

  it('reports no route without searching when a stub end sits inside a padded box', () => {
    let reads = 0;
    const now = () => (reads++, 0);
    const wall = { x: 540, y: 20, w: 20, h: 30 };
    expect(searchAround({ source: from, sourceSide: 'right', target: to, targetSide: 'left', boxes: [A, C, wall] }, { now })).toBeNull();
    expect(reads).toBe(1);
  });

  it('leaves and enters each port along its side for at least a full stub', () => {
    const D = { x: -400, y: 300, w: 180, h: 72 };
    const E = { x: 400, y: -300, w: 180, h: 72 };
    const F = { x: 216, y: -52, w: 180, h: 72 };
    const G = { x: -300, y: -300, w: 180, h: 72 };
    const H = { x: 231, y: 300, w: 180, h: 72 };
    const cases = [
      { source: from, sourceSide: 'right', target: { x: -405.5, y: 336 }, targetSide: 'left', boxes: [A, D, E] },
      { source: { x: 90, y: 77.5 }, sourceSide: 'bottom', target: { x: 585.5, y: -264 }, targetSide: 'right', boxes: [A, D, E] },
      { source: from, sourceSide: 'right', target: { x: -114.5, y: -264 }, targetSide: 'right', boxes: [A, F, H, G] },
      { source: { x: 90, y: -5.5 }, sourceSide: 'top', target: { x: 585.5, y: -264 }, targetSide: 'right', boxes: [A, D, E] },
    ] as const;
    for (const c of cases) {
      const route = searchAround({ ...c, boxes: [...c.boxes] });
      expect(route).not.toBeNull();
      const points = route ?? [];
      const first = leg(points[0], points[1]);
      const last = leg(points[points.length - 2], points[points.length - 1]);
      expect(first).toBeGreaterThanOrEqual(STUB);
      expect(points[1]).toEqual(stubEnd(c.source, c.sourceSide, first));
      expect(last).toBeGreaterThanOrEqual(STUB);
      expect(points[points.length - 2]).toEqual(stubEnd(c.target, c.targetSide, last));
    }
  });

  it('routes across a 200-box board inside the time limit', () => {
    const boxes: Rect[] = [];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 20; c++) boxes.push({ x: c * 252, y: r * 200, w: 180, h: 72 });
    const input: AroundInput = { source: { x: 5 * 252 + 185.5, y: 36 }, sourceSide: 'right', target: { x: 15 * 252 - 5.5, y: 9 * 200 + 36 }, targetSide: 'left', boxes };
    const route = searchAround(input);
    expect(route).not.toBeNull();
    expect(clearOfPadding(route ?? [], input)).toBe(true);
  });
});
