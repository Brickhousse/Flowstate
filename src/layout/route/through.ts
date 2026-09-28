import type { Side, XY } from '../../model/types';
import { sideAxis, STUB, stubEnd, type Axis } from './ports';

const same = (a: XY, b: XY) => a.x === b.x && a.y === b.y;
const inLine = (a: XY, b: XY, c: XY) => (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);

export function simplify(points: XY[]): XY[] {
  const out: XY[] = [];
  for (const p of points) {
    if (out.length && same(out[out.length - 1], p)) continue;
    if (out.length >= 2 && inLine(out[out.length - 2], out[out.length - 1], p)) out.pop();
    out.push(p);
  }
  return out;
}

export function through(source: XY, sourceSide: Side, bends: XY[], target: XY, targetSide: Side): XY[] {
  const out: XY[] = [source, stubEnd(source, sourceSide)];
  let axis: Axis = sideAxis(sourceSide);
  for (const p of [...bends, stubEnd(target, targetSide)]) {
    const last = out[out.length - 1];
    if (last.x !== p.x && last.y !== p.y) out.push(axis === 'x' ? { x: last.x, y: p.y } : { x: p.x, y: last.y });
    else if (last.x === p.x && last.y !== p.y) axis = 'y';
    else if (last.y === p.y && last.x !== p.x) axis = 'x';
    out.push(p);
  }
  out.push(target);
  return simplify(out);
}

export function innerSegments(points: XY[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length - 2; i++) out.push(i);
  return out;
}

function stubPoint(port: XY, next: XY): XY[] {
  if (Math.abs(next.x - port.x) + Math.abs(next.y - port.y) <= STUB) return [];
  return [{ x: port.x + Math.sign(next.x - port.x) * STUB, y: port.y + Math.sign(next.y - port.y) * STUB }];
}

export function splitStubs(points: XY[]): XY[] {
  if (points.length < 2) return points;
  const last = points.length - 1;
  return [points[0], ...stubPoint(points[0], points[1]), ...points.slice(1, last), ...stubPoint(points[last], points[last - 1]), points[last]];
}

export function segmentAxis(a: XY, b: XY): Axis {
  return a.y === b.y ? 'x' : 'y';
}

export function moveSegment(points: XY[], index: number, to: number): XY[] {
  const horizontal = segmentAxis(points[index], points[index + 1]) === 'x';
  return points.map((p, i) => (i !== index && i !== index + 1 ? p : horizontal ? { x: p.x, y: to } : { x: to, y: p.y }));
}
