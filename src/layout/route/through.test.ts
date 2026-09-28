import { describe, expect, it } from 'vitest';
import { SIDES, type XY } from '../../model/types';
import { elbow } from './elbow';
import { innerSegments, moveSegment, simplify, through } from './through';

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

describe('through', () => {
  const s = { x: 0, y: 0 };
  const t = { x: 400, y: 200 };

  it('passes through every bend at right angles', () => {
    const bends = [{ x: 100, y: -60 }, { x: 250, y: 300 }];
    const route = through(s, 'right', bends, t, 'left');
    expect(rightAngled(route)).toBe(true);
    for (const b of bends) expect(route).toContainEqual(b);
    expect(route[0]).toEqual(s);
    expect(route[route.length - 1]).toEqual(t);
  });

  it('leaves the box along its side and enters the target along its side', () => {
    const route = through(s, 'bottom', [{ x: 200, y: 100 }], t, 'top');
    expect(route[1].x).toBe(0);
    expect(route[1].y).toBeGreaterThan(0);
    expect(route[route.length - 2].x).toBe(400);
    expect(route[route.length - 2].y).toBeLessThan(200);
  });

  it('keeps the bends when one end moves and re-routes only the end piece', () => {
    const bends = [{ x: 200, y: 0 }, { x: 200, y: 200 }];
    const moved = through(s, 'right', bends, { x: 400, y: 260 }, 'left');
    expect(moved.slice(0, 3)).toEqual([s, ...bends]);
    expect(rightAngled(moved)).toBe(true);
  });

  it('rebuilds an automatic route unchanged from its own corners', () => {
    const targets = [{ x: 400, y: 220 }, { x: -200, y: -20 }, { x: 140, y: 400 }, { x: 60, y: -200 }, { x: 300, y: 100 }, { x: 400, y: 5 }, { x: 10, y: 10 }];
    for (const a of SIDES) {
      for (const b of SIDES) {
        for (const target of targets) {
          const auto = simplify(elbow(s, a, target, b));
          expect(through(s, a, auto.slice(1, -1), target, b), `${a} to ${b} at ${target.x},${target.y}`).toEqual(auto);
        }
      }
    }
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
