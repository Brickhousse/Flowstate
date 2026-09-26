import type { Rect } from '../../layout/geometry';
import type { NodeKind } from '../../model/types';

export const GRID = 20;
export const SNAP_PX = 6;
export const RESIZE_MIN: Record<NodeKind, { w: number; h: number }> = {
  step: { w: 40, h: 32 },
  text: { w: 60, h: 24 },
  group: { w: 160, h: 100 },
};

export type Axis = 'x' | 'y';
export type Guide =
  | { kind: 'line'; axis: Axis; at: number; from: number; to: number }
  | { kind: 'gap'; axis: Axis; start: number; end: number; cross: number };

export interface SnapPrefs {
  gridSnap: boolean;
  smartGuides: boolean;
  spacingGuides: boolean;
}

export interface Candidates {
  boxes: Rect[];
  xLines: number[];
  yLines: number[];
}

export interface MoveMods {
  alt: boolean;
  lock: Axis | null;
}

export interface MoveResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

const KEYS = {
  x: { pos: 'x', size: 'w', crossPos: 'y', crossSize: 'h' },
  y: { pos: 'y', size: 'h', crossPos: 'x', crossSize: 'w' },
} as const;
const EPS = 0.5;

export function linesOf(r: Rect, a: Axis): number[] {
  const k = KEYS[a];
  return [r[k.pos], r[k.pos] + r[k.size] / 2, r[k.pos] + r[k.size]];
}

function extraLines(c: Candidates, a: Axis): number[] {
  return a === 'x' ? c.xLines : c.yLines;
}

export function targetLines(c: Candidates, a: Axis): number[] {
  return [...c.boxes.flatMap((b) => linesOf(b, a)), ...extraLines(c, a)];
}

export function nearest(values: number[], targets: number[], t: number): number | null {
  let best: number | null = null;
  for (const target of targets) {
    for (const v of values) {
      const d = target - v;
      if (Math.abs(d) <= t && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best;
}

export function alignGuides(m: Rect, c: Candidates, a: Axis): Guide[] {
  const k = KEYS[a];
  const out: Guide[] = [];
  for (const v of linesOf(m, a)) {
    const hits = c.boxes.filter((b) => linesOf(b, a).some((l) => Math.abs(l - v) < EPS));
    const onLane = extraLines(c, a).some((l) => Math.abs(l - v) < EPS);
    if (!hits.length && !onLane) continue;
    const span = [m, ...hits];
    out.push({
      kind: 'line',
      axis: a,
      at: v,
      from: Math.min(...span.map((r) => r[k.crossPos])),
      to: Math.max(...span.map((r) => r[k.crossPos] + r[k.crossSize])),
    });
  }
  return out;
}

function spacingOffset(m: Rect, boxes: Rect[], a: Axis, t: number): { d: number; guides: Guide[] } | null {
  const k = KEYS[a];
  const start = (r: Rect) => r[k.pos];
  const end = (r: Rect) => r[k.pos] + r[k.size];
  const row = boxes
    .filter((b) => b[k.crossPos] < m[k.crossPos] + m[k.crossSize] && m[k.crossPos] < b[k.crossPos] + b[k.crossSize])
    .sort((p, q) => start(p) - start(q));
  const mid = start(m) + m[k.size] / 2;
  const gaps: Array<[number, number]> = [];
  for (let i = 1; i < row.length; i++) {
    const s = end(row[i - 1]);
    const e = start(row[i]);
    if (e > s && !(s < mid && mid < e)) gaps.push([s, e]);
  }
  const before = row.filter((b) => end(b) <= start(m) + t);
  const after = row.filter((b) => start(b) >= end(m) - t);
  const left = before.length ? before.reduce((p, q) => (end(q) > end(p) ? q : p)) : null;
  const right = after.length ? after.reduce((p, q) => (start(q) < start(p) ? q : p)) : null;
  const options: Array<{ d: number; spans: Array<[number, number]> }> = [];
  for (const [s, e] of gaps) {
    const g = e - s;
    if (left) options.push({ d: end(left) + g - start(m), spans: [[end(left), end(left) + g], [s, e]] });
    if (right) options.push({ d: start(right) - g - end(m), spans: [[start(right) - g, start(right)], [s, e]] });
  }
  if (left && right) {
    const g = (start(right) - end(left) - m[k.size]) / 2;
    if (g > 0) options.push({ d: end(left) + g - start(m), spans: [[end(left), end(left) + g], [start(right) - g, start(right)]] });
  }
  let best: (typeof options)[number] | null = null;
  for (const o of options) if (Math.abs(o.d) <= t && (!best || Math.abs(o.d) < Math.abs(best.d))) best = o;
  if (!best) return null;
  const cross = m[k.crossPos] + m[k.crossSize] / 2;
  return { d: best.d, guides: best.spans.map(([s, e]): Guide => ({ kind: 'gap', axis: a, start: s, end: e, cross })) };
}

export function snapMove(m: Rect, c: Candidates, prefs: SnapPrefs, zoom: number, mods: MoveMods): MoveResult {
  if (mods.alt) return { dx: 0, dy: 0, guides: [] };
  const t = SNAP_PX / zoom;
  const offsets = { x: 0, y: 0 };
  const gapGuides: Guide[] = [];
  for (const a of ['x', 'y'] as const) {
    if (mods.lock && mods.lock !== a) continue;
    let d = prefs.smartGuides ? nearest(linesOf(m, a), targetLines(c, a), t) : null;
    if (d === null && prefs.spacingGuides) {
      const spaced = spacingOffset(m, c.boxes, a, t);
      if (spaced) {
        d = spaced.d;
        gapGuides.push(...spaced.guides);
      }
    }
    if (d === null && prefs.gridSnap) d = Math.round(m[KEYS[a].pos] / GRID) * GRID - m[KEYS[a].pos];
    offsets[a] = d || 0;
  }
  const snapped = { ...m, x: m.x + offsets.x, y: m.y + offsets.y };
  const guides = prefs.smartGuides ? [...alignGuides(snapped, c, 'x'), ...alignGuides(snapped, c, 'y')] : [];
  for (const g of gapGuides) if (g.kind === 'gap') guides.push({ ...g, cross: g.cross + (g.axis === 'x' ? offsets.y : offsets.x) });
  return { dx: offsets.x, dy: offsets.y, guides };
}

export function lockAxis(dx: number, dy: number): Axis {
  return Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
}

export interface ResizeEdges {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

function snapEdge(v: number, targets: number[], t: number, prefs: SnapPrefs): number {
  const d = prefs.smartGuides ? nearest([v], targets, t) : null;
  if (d !== null) return v + d;
  return prefs.gridSnap ? Math.round(v / GRID) * GRID : v;
}

export function snapResize(
  r: Rect,
  edges: ResizeEdges,
  c: Candidates,
  prefs: SnapPrefs,
  zoom: number,
  alt: boolean,
  min: { w: number; h: number },
): { rect: Rect; guides: Guide[] } {
  if (alt) return { rect: r, guides: [] };
  const t = SNAP_PX / zoom;
  const xs = targetLines(c, 'x');
  const ys = targetLines(c, 'y');
  let { x, y, w, h } = r;
  if (edges.left) {
    const nx = snapEdge(x, xs, t, prefs);
    if (x + w - nx >= min.w) {
      w += x - nx;
      x = nx;
    }
  } else if (edges.right) {
    const right = snapEdge(x + w, xs, t, prefs);
    if (right - x >= min.w) w = right - x;
  }
  if (edges.top) {
    const ny = snapEdge(y, ys, t, prefs);
    if (y + h - ny >= min.h) {
      h += y - ny;
      y = ny;
    }
  } else if (edges.bottom) {
    const bottom = snapEdge(y + h, ys, t, prefs);
    if (bottom - y >= min.h) h = bottom - y;
  }
  const rect = { x, y, w, h };
  return { rect, guides: prefs.smartGuides ? [...alignGuides(rect, c, 'x'), ...alignGuides(rect, c, 'y')] : [] };
}
