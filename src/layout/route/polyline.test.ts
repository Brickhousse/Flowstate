import { describe, expect, it } from 'vitest';
import { SIDES, type XY } from '../../model/types';
import { elbow } from './elbow';
import { STUB } from './ports';
import { through } from './through';
import { innerSegments, moveSegment, samePoints, simplify, splitStubs } from './polyline';

const rightAngled = (points: XY[]) => points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y);

describe('simplify', () => {
  it('drops repeated and collinear points but keeps both ends', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 50 }, { x: 30, y: 80 }];
    expect(simplify(pts)).toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 80 }]);
  });

  it('drops a point where the line doubles back on itself', () => {
    expect(simplify([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }])).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }]);
  });
});

describe('samePoints', () => {
  it('is true for two equal point lists', () => {
    expect(samePoints([{ x: 0, y: 0 }, { x: 10, y: 5 }], [{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe(true);
  });

  it('is false when lengths differ', () => {
    expect(samePoints([{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe(false);
  });

  it('is false when a point differs', () => {
    expect(samePoints([{ x: 0, y: 0 }, { x: 10, y: 5 }], [{ x: 0, y: 0 }, { x: 10, y: 6 }])).toBe(false);
  });
});

describe('segments', () => {
  const route = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 150, y: 100 }, { x: 150, y: 200 }, { x: 200, y: 200 }];

  it('lists only the segments between the two end stubs', () => {
    expect(innerSegments(route)).toEqual([1, 2, 3]);
    expect(innerSegments([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 60 }])).toEqual([]);
  });

  it('slides a segment sideways and keeps its neighbours at right angles', () => {
    const moved = moveSegment(route, 2, 140);
    expect(moved[2]).toEqual({ x: 50, y: 140 });
    expect(moved[3]).toEqual({ x: 150, y: 140 });
    expect(rightAngled(moved)).toBe(true);
    expect(moveSegment(route, 1, 80).slice(1, 3)).toEqual([{ x: 80, y: 0 }, { x: 80, y: 100 }]);
  });
});

describe('splitStubs', () => {
  const s = { x: 0, y: 0 };

  it('gives a straight route both stub ends, so it gets one bar', () => {
    const split = splitStubs([s, { x: 100, y: 0 }]);
    expect(split).toEqual([s, { x: STUB, y: 0 }, { x: 100 - STUB, y: 0 }, { x: 100, y: 0 }]);
    expect(innerSegments(split)).toEqual([1]);
  });

  it('gives an L-shaped route both stub ends, so it gets two bars', () => {
    const split = splitStubs([s, { x: 100, y: 0 }, { x: 100, y: 80 }]);
    expect(split).toEqual([s, { x: STUB, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 - STUB }, { x: 100, y: 80 }]);
    expect(innerSegments(split)).toEqual([1, 2]);
  });

  it('adds nothing at an end whose first corner is exactly one stub out', () => {
    const route = [s, { x: STUB, y: 0 }, { x: STUB, y: 100 }, { x: 200, y: 100 }];
    expect(splitStubs(route)).toEqual([...route.slice(0, -1), { x: 200 - STUB, y: 100 }, { x: 200, y: 100 }]);
  });

  it('adds nothing at an end whose segment is shorter than a stub', () => {
    const route = [s, { x: 10, y: 0 }, { x: 10, y: 100 }, { x: 10 - 200, y: 100 }];
    expect(splitStubs(route)).toEqual([s, { x: 10, y: 0 }, { x: 10, y: 100 }, { x: 10 - 200 + STUB, y: 100 }, { x: 10 - 200, y: 100 }]);
    expect(splitStubs([s, { x: 0, y: STUB }])).toEqual([s, { x: 0, y: STUB }]);
  });

  it('still gives a straight route shorter than two stubs one bar, its stub points crossed', () => {
    const split = splitStubs([s, { x: 0, y: 30 }]);
    expect(split).toEqual([s, { x: 0, y: STUB }, { x: 0, y: 30 - STUB }, { x: 0, y: 30 }]);
    expect(innerSegments(split)).toEqual([1]);
  });

  it('rebuilds straight, L and Z automatic routes unchanged from the split corners', () => {
    const shapes = [
      { auto: simplify(elbow(s, 'right', { x: 300, y: 0 }, 'left')), corners: 2, target: { x: 300, y: 0 }, side: 'left' as const },
      { auto: simplify(elbow(s, 'right', { x: 300, y: 200 }, 'top')), corners: 3, target: { x: 300, y: 200 }, side: 'top' as const },
      { auto: simplify(elbow(s, 'right', { x: 300, y: 200 }, 'left')), corners: 4, target: { x: 300, y: 200 }, side: 'left' as const },
    ];
    for (const { auto, corners, target, side } of shapes) {
      expect(auto).toHaveLength(corners);
      expect(splitStubs(auto).length).toBe(corners + 2);
      expect(through(s, 'right', splitStubs(auto).slice(1, -1), target, side)).toEqual(auto);
    }
  });

  it('rebuilds every automatic route unchanged from the split corners', () => {
    const targets = [{ x: 400, y: 220 }, { x: -200, y: -20 }, { x: 140, y: 400 }, { x: 60, y: -200 }, { x: 300, y: 100 }, { x: 400, y: 5 }, { x: 10, y: 10 }, { x: 30, y: 0 }, { x: 0, y: 40 }, { x: -200, y: 0 }];
    for (const a of SIDES) {
      for (const b of SIDES) {
        for (const target of targets) {
          const auto = simplify(elbow(s, a, target, b));
          expect(through(s, a, splitStubs(auto).slice(1, -1), target, b), `${a} to ${b} at ${target.x},${target.y}`).toEqual(auto);
        }
      }
    }
  });
});
