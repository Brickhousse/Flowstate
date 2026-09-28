import type { Side, XY } from '../../model/types';
import { overlaps, type Rect } from '../geometry';
import { SIDE_DIR, sideAxis, stubEnd } from './ports';
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

interface Grid {
  xs: number[];
  ys: number[];
  walls: Rect[];
}

interface Blocking {
  stepX: Uint8Array;
  stepY: Uint8Array;
}

interface Ends {
  start: { ix: number; iy: number; axis: 0 | 1; back: XY };
  goal: { ix: number; iy: number; axis: 0 | 1; away: XY };
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
const axisOf = (side: Side): 0 | 1 => (sideAxis(side) === 'x' ? 0 : 1);

function buildGrid(s: XY, t: XY, boxes: Rect[]): Grid {
  const region = { x: Math.min(s.x, t.x) - AROUND_MARGIN, y: Math.min(s.y, t.y) - AROUND_MARGIN, w: Math.abs(s.x - t.x) + AROUND_MARGIN * 2, h: Math.abs(s.y - t.y) + AROUND_MARGIN * 2 };
  const walls = boxes
    .map((r) => ({ x: r.x - AROUND_PAD, y: r.y - AROUND_PAD, w: r.w + AROUND_PAD * 2, h: r.h + AROUND_PAD * 2 }))
    .filter((r) => overlaps(r, region, 0));
  const xs = lines([s.x, t.x, region.x, region.x + region.w, ...walls.flatMap((r) => [r.x, r.x + r.w])], region.x, region.x + region.w);
  const ys = lines([s.y, t.y, region.y, region.y + region.h, ...walls.flatMap((r) => [r.y, r.y + r.h])], region.y, region.y + region.h);
  return { xs, ys, walls };
}

function firstIndex(values: number[], past: (v: number) => boolean): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (past(values[mid])) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// A step is blocked when it runs strictly inside a wall's span on one axis and overlaps it on the other.
// Every step onto a point inside a wall meets that, so no point table is needed.
function blockingTables({ xs, ys, walls }: Grid): Blocking {
  const nx = xs.length;
  const stepX = new Uint8Array(nx * ys.length);
  const stepY = new Uint8Array(nx * ys.length);
  for (const r of walls) {
    const colIn = [firstIndex(xs, (v) => v > r.x), firstIndex(xs, (v) => v >= r.x + r.w) - 1];
    const rowIn = [firstIndex(ys, (v) => v > r.y), firstIndex(ys, (v) => v >= r.y + r.h) - 1];
    const colSteps = [Math.max(0, colIn[0] - 1), Math.min(nx - 2, colIn[1])];
    const rowSteps = [Math.max(0, rowIn[0] - 1), Math.min(ys.length - 2, rowIn[1])];
    for (let iy = rowIn[0]; iy <= rowIn[1]; iy++) for (let ix = colSteps[0]; ix <= colSteps[1]; ix++) stepX[iy * nx + ix] = 1;
    for (let iy = rowSteps[0]; iy <= rowSteps[1]; iy++) for (let ix = colIn[0]; ix <= colIn[1]; ix++) stepY[iy * nx + ix] = 1;
  }
  return { stepX, stepY };
}

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

function search({ xs, ys }: Grid, { stepX, stepY }: Blocking, { start, goal }: Ends, expired: () => boolean): XY[] | null {
  const nx = xs.length;
  const guess = (ix: number, iy: number) => Math.abs(xs[ix] - xs[goal.ix]) + Math.abs(ys[iy] - ys[goal.iy]);
  const best = new Float64Array(nx * ys.length * 2).fill(Infinity);
  const open = new Heap();
  open.push({ ix: start.ix, iy: start.iy, axis: start.axis, cost: 0, score: guess(start.ix, start.iy), from: null });
  let pops = 0;
  while (open.size) {
    if ((pops++ & 63) === 0 && expired()) return null;
    const cur = open.pop();
    if (!cur) break;
    if (cur.ix === goal.ix && cur.iy === goal.iy) {
      const path: XY[] = [];
      for (let st: State | null = cur; st; st = st.from) path.push({ x: xs[st.ix], y: ys[st.iy] });
      return path.reverse();
    }
    if (best[(cur.iy * nx + cur.ix) * 2 + cur.axis] < cur.cost) continue;
    const atStart = cur.ix === start.ix && cur.iy === start.iy;
    for (let d = 0; d < 4; d++) {
      const dx = DX[d];
      const dy = DY[d];
      const ix = cur.ix + dx;
      const iy = cur.iy + dy;
      if (ix < 0 || iy < 0 || ix >= nx || iy >= ys.length) continue;
      if (dx !== 0 ? stepX[cur.iy * nx + Math.min(ix, cur.ix)] : stepY[Math.min(iy, cur.iy) * nx + ix]) continue;
      const axis = dx !== 0 ? 0 : 1;
      const atGoal = ix === goal.ix && iy === goal.iy;
      // A state records its axis, not its direction, so doubling back over a stub would look free.
      if ((atStart && dx === start.back.x && dy === start.back.y) || (atGoal && dx === goal.away.x && dy === goal.away.y)) continue;
      const turns = (axis !== cur.axis ? 1 : 0) + (atGoal && axis !== goal.axis ? 1 : 0);
      const cost = cur.cost + Math.abs(xs[ix] - xs[cur.ix]) + Math.abs(ys[iy] - ys[cur.iy]) + turns * TURN_COST;
      const k = (iy * nx + ix) * 2 + axis;
      if (best[k] <= cost) continue;
      best[k] = cost;
      open.push({ ix, iy, axis, cost, score: cost + guess(ix, iy), from: cur });
    }
  }
  return null;
}

export function searchAround(input: AroundInput, opts: AroundOptions = {}): XY[] | null {
  const now = opts.now ?? (() => performance.now());
  const limit = opts.limitMs ?? AROUND_LIMIT_MS;
  const started = now();
  const s = stubEnd(input.source, input.sourceSide);
  const t = stubEnd(input.target, input.targetSide);
  const grid = buildGrid(s, t, input.boxes);
  const inside = (p: XY) => grid.walls.some((r) => r.x < p.x && p.x < r.x + r.w && r.y < p.y && p.y < r.y + r.h);
  if (inside(s) || inside(t)) return null;
  const out = SIDE_DIR[input.sourceSide];
  const ends: Ends = {
    start: { ix: grid.xs.indexOf(s.x), iy: grid.ys.indexOf(s.y), axis: axisOf(input.sourceSide), back: { x: -out.x, y: -out.y } },
    goal: { ix: grid.xs.indexOf(t.x), iy: grid.ys.indexOf(t.y), axis: axisOf(input.targetSide), away: SIDE_DIR[input.targetSide] },
  };
  const corners = search(grid, blockingTables(grid), ends, () => now() - started > limit);
  return corners && simplify([input.source, ...corners, input.target]);
}
