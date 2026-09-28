import { moveSegment, samePoints, segmentAxis, simplify, splitStubs } from '../layout/route/polyline';
import type { Axis } from '../layout/route/ports';
import type { XY } from '../model/types';

export type Reshape =
  | { kind: 'segment'; points: XY[]; bends: XY[]; index: number; across: Axis; offset: number }
  | { kind: 'bend'; bends: XY[]; index: number; offset: XY };

export function handlePoints(route: XY[]): XY[] {
  return splitStubs(simplify(route));
}

export function segmentReshape(points: XY[], bends: XY[], index: number, pointer: XY): Reshape {
  const across = segmentAxis(points[index], points[index + 1]) === 'x' ? 'y' : 'x';
  return { kind: 'segment', points, bends, index, across, offset: points[index][across] - pointer[across] };
}

export function bendReshape(bends: XY[], index: number, pointer: XY): Reshape {
  const p = bends[index];
  return { kind: 'bend', bends, index, offset: { x: p.x - pointer.x, y: p.y - pointer.y } };
}

export function reshapedBends(r: Reshape, at: XY, snap: (v: number) => number): XY[] {
  if (r.kind === 'segment') {
    const moved = simplify(moveSegment(r.points, r.index, snap(at[r.across] + r.offset)));
    // why: storing an unchanged route's corners would silently turn an automatic arrow hand-shaped.
    return samePoints(moved, simplify(r.points)) ? r.bends : moved.slice(1, -1);
  }
  return r.bends.map((p, i) => (i === r.index ? { x: snap(at.x + r.offset.x), y: snap(at.y + r.offset.y) } : p));
}
