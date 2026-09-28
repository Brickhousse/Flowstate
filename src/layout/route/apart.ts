import type { Side, XY } from '../../model/types';
import { overlaps, type Rect } from '../geometry';
import { sideAxis, type Axis } from './ports';
import { innerSegments, moveSegment, segmentAxis } from './through';

export const SHIFT_STEP = 10;
export const SHIFT_TRIES = 5;

type End = 'source' | 'target';

export interface ArrowEnds {
  id: string;
  separate: boolean;
  source: { node: string; side: Side; box: Rect };
  target: { node: string; side: Side; box: Rect };
}

export type PortSpots = Map<string, Record<End, number>>;

const center = (r: Rect, axis: Axis) => (axis === 'x' ? r.x + r.w / 2 : r.y + r.h / 2);
const along = (side: Side): Axis => (sideAxis(side) === 'x' ? 'y' : 'x');

interface Slot {
  id: string;
  end: End;
  separate: boolean;
  key: number;
  mid: number;
}

export function spreadPorts(arrows: ArrowEnds[]): PortSpots {
  const sides = new Map<string, Slot[]>();
  for (const a of arrows) {
    for (const end of ['source', 'target'] as const) {
      const me = a[end];
      const other = a[end === 'source' ? 'target' : 'source'];
      const axis = along(me.side);
      const k = `${me.node}|${me.side}`;
      const list = sides.get(k) ?? [];
      sides.set(k, list);
      list.push({ id: a.id, end, separate: a.separate, key: center(other.box, axis), mid: center(me.box, axis) });
    }
  }
  const out: PortSpots = new Map();
  const place = (slots: Slot[], from: number, to: number) => {
    slots.forEach((s, i) => {
      const spot = out.get(s.id) ?? { source: 0.5, target: 0.5 };
      spot[s.end] = from + ((to - from) * (i + 1)) / (slots.length + 1);
      out.set(s.id, spot);
    });
  };
  for (const list of sides.values()) {
    const apart = list.filter((s) => s.separate).sort((p, q) => p.key - q.key || (p.id < q.id ? -1 : 1));
    if (!apart.length) continue;
    if (apart.length === list.length) place(apart, 0, 1);
    else {
      place(apart.filter((s) => s.key < s.mid), 0, 0.5);
      place(apart.filter((s) => s.key >= s.mid), 0.5, 1);
    }
  }
  return out;
}

function boundsOf(points: XY[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function sharesLine(a: XY, b: XY, c: XY, d: XY): boolean {
  const axis = segmentAxis(a, b);
  if (segmentAxis(c, d) !== axis) return false;
  const across = axis === 'x' ? 'y' : 'x';
  if (Math.abs(a[across] - c[across]) > 0.5) return false;
  const lo = Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
  const hi = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]));
  return hi - lo > 1;
}

function clashes(points: XY[], i: number, others: XY[][]): boolean {
  return others.some((o) => o.slice(1).some((q, j) => sharesLine(points[i], points[i + 1], o[j], q)));
}

export function shiftLines(routes: ReadonlyMap<string, XY[]>, movable: string[]): Map<string, XY[]> {
  const current = new Map(routes);
  const boxes = new Map([...routes].map(([id, points]) => [id, boundsOf(points)]));
  const out = new Map<string, XY[]>();
  for (const id of movable) {
    const start = current.get(id);
    const box = boxes.get(id);
    if (!start || !box) continue;
    let points = start;
    const near: XY[][] = [];
    for (const [other, p] of current) {
      const b = boxes.get(other);
      if (other !== id && b && overlaps(b, box, SHIFT_STEP * 3)) near.push(p);
    }
    for (const i of innerSegments(points)) {
      if (!clashes(points, i, near)) continue;
      const across = segmentAxis(points[i], points[i + 1]) === 'x' ? 'y' : 'x';
      const base = points[i][across];
      let tried = points;
      for (let k = 1; k <= SHIFT_TRIES; k++) {
        tried = moveSegment(points, i, base + SHIFT_STEP * Math.ceil(k / 2) * (k % 2 ? 1 : -1));
        if (!clashes(tried, i, near)) break;
      }
      points = tried;
    }
    current.set(id, points);
    boxes.set(id, boundsOf(points));
    out.set(id, points);
  }
  return out;
}
