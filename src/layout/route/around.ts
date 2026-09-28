import type { Side, XY } from '../../model/types';
import { overlaps, type Rect } from '../geometry';
import { sideAxis, stubEnd } from './ports';
import { simplify } from './through';

export const AROUND_PAD = 16;
export const AROUND_LIMIT_MS = 50;
export const TURN_COST = 40;
export const AROUND_MARGIN = 400;

export interface AroundInput {
  source: XY;
  sourceSide: Side;
  target: XY;
  targetSide: Side;
  boxes: Rect[];
}

export interface AroundOptions {
  limitMs?: number;
  now?: () => number;
}

interface State {
  ix: number;
  iy: number;
  axis: 0 | 1;
  cost: number;
  score: number;
  from: State | null;
}

class Heap {
  private items: State[] = [];
  get size(): number {
    return this.items.length;
  }
  push(s: State): void {
    const a = this.items;
    a.push(s);
    let i = a.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (a[up].score <= a[i].score) break;
      [a[up], a[i]] = [a[i], a[up]];
      i = up;
    }
  }
  pop(): State | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].score < a[m].score) m = l;
        if (r < a.length && a[r].score < a[m].score) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const lines = (values: number[], lo: number, hi: number) => [...new Set(values.filter((v) => v >= lo && v <= hi))].sort((a, b) => a - b);

export function searchAround(input: AroundInput, opts: AroundOptions = {}): XY[] | null {
  const now = opts.now ?? (() => performance.now());
  const limit = opts.limitMs ?? AROUND_LIMIT_MS;
  const started = now();
  const s = stubEnd(input.source, input.sourceSide);
  const t = stubEnd(input.target, input.targetSide);
  const region = { x: Math.min(s.x, t.x) - AROUND_MARGIN, y: Math.min(s.y, t.y) - AROUND_MARGIN, w: Math.abs(s.x - t.x) + AROUND_MARGIN * 2, h: Math.abs(s.y - t.y) + AROUND_MARGIN * 2 };
  const walls = input.boxes
    .map((r) => ({ x: r.x - AROUND_PAD, y: r.y - AROUND_PAD, w: r.w + AROUND_PAD * 2, h: r.h + AROUND_PAD * 2 }))
    .filter((r) => overlaps(r, region, 0));
  const xs = lines([s.x, t.x, region.x, region.x + region.w, ...walls.flatMap((r) => [r.x, r.x + r.w])], region.x, region.x + region.w);
  const ys = lines([s.y, t.y, region.y, region.y + region.h, ...walls.flatMap((r) => [r.y, r.y + r.h])], region.y, region.y + region.h);
  const inside = (x: number, y: number) => walls.some((r) => r.x < x && x < r.x + r.w && r.y < y && y < r.y + r.h);
  const crosses = (lo: number, hi: number, from: number, size: number) => Math.max(lo, from) < Math.min(hi, from + size);
  const blocked = (a: XY, b: XY) =>
    walls.some((r) =>
      a.y === b.y
        ? r.y < a.y && a.y < r.y + r.h && crosses(Math.min(a.x, b.x), Math.max(a.x, b.x), r.x, r.w)
        : r.x < a.x && a.x < r.x + r.w && crosses(Math.min(a.y, b.y), Math.max(a.y, b.y), r.y, r.h),
    );
  if (inside(s.x, s.y) || inside(t.x, t.y)) return null;
  const goal = { ix: xs.indexOf(t.x), iy: ys.indexOf(t.y) };
  const endAxis = sideAxis(input.targetSide) === 'x' ? 0 : 1;
  const guess = (ix: number, iy: number) => Math.abs(xs[ix] - t.x) + Math.abs(ys[iy] - t.y);
  const best = new Map<number, number>();
  const key = (ix: number, iy: number, axis: number) => (iy * xs.length + ix) * 2 + axis;
  const open = new Heap();
  const ix0 = xs.indexOf(s.x);
  const iy0 = ys.indexOf(s.y);
  open.push({ ix: ix0, iy: iy0, axis: sideAxis(input.sourceSide) === 'x' ? 0 : 1, cost: 0, score: guess(ix0, iy0), from: null });
  let pops = 0;
  while (open.size) {
    if ((pops++ & 63) === 0 && now() - started > limit) return null;
    const cur = open.pop();
    if (!cur) break;
    if (cur.ix === goal.ix && cur.iy === goal.iy) {
      const path: XY[] = [input.target];
      for (let st: State | null = cur; st; st = st.from) path.push({ x: xs[st.ix], y: ys[st.iy] });
      path.push(input.source);
      return simplify(path.reverse());
    }
    if ((best.get(key(cur.ix, cur.iy, cur.axis)) ?? Infinity) < cur.cost) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ix = cur.ix + dx;
      const iy = cur.iy + dy;
      if (ix < 0 || iy < 0 || ix >= xs.length || iy >= ys.length) continue;
      const a = { x: xs[cur.ix], y: ys[cur.iy] };
      const b = { x: xs[ix], y: ys[iy] };
      if (inside(b.x, b.y) || blocked(a, b)) continue;
      const axis = dx !== 0 ? 0 : 1;
      const atGoal = ix === goal.ix && iy === goal.iy;
      const cost = cur.cost + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + (axis !== cur.axis ? TURN_COST : 0) + (atGoal && axis !== endAxis ? TURN_COST : 0);
      const k = key(ix, iy, axis);
      if ((best.get(k) ?? Infinity) <= cost) continue;
      best.set(k, cost);
      open.push({ ix, iy, axis, cost, score: cost + guess(ix, iy), from: cur });
    }
  }
  return null;
}
