import { axes, laneBands, overlaps, type Rect } from '../../layout/place';
import type { Board, BoardNode } from '../../model/types';
import type { Candidates } from './snap';

export const CANDIDATE_CAP = 200;

export type SizeOf = (id: string) => { w: number; h: number } | undefined;

export function rectOf(n: BoardNode, sizeOf?: SizeOf): Rect {
  const s = sizeOf?.(n.id);
  return { x: n.x, y: n.y, w: s?.w ?? n.w, h: s?.h ?? n.h };
}

export function excludedFor(b: Board, ids: string[]): Set<string> {
  const dragged = new Set(ids);
  const out = new Set(ids);
  for (const n of b.nodes) {
    if (dragged.has(n.id) && n.groupId) out.add(n.groupId);
    if (n.groupId && dragged.has(n.groupId)) out.add(n.id);
  }
  return out;
}

export function laneLines(b: Board): { xLines: number[]; yLines: number[] } {
  const bands = laneBands(b);
  if (!bands.length) return { xLines: [], yLines: [] };
  const lines = [bands[0].start, ...bands.map((band) => band.start + band.size)];
  return axes(b).cross === 'y' ? { xLines: [], yLines: lines } : { xLines: lines, yLines: [] };
}

export function buildCandidates(b: Board, ids: string[], moving: Rect, view: Rect, sizeOf?: SizeOf, cap = CANDIDATE_CAP): Candidates {
  const skip = excludedFor(b, ids);
  const cx = moving.x + moving.w / 2;
  const cy = moving.y + moving.h / 2;
  const boxes = b.nodes
    .filter((n) => !skip.has(n.id))
    .map((n) => rectOf(n, sizeOf))
    .filter((r) => overlaps(r, view, 0))
    .map((r) => ({ r, d: (r.x + r.w / 2 - cx) ** 2 + (r.y + r.h / 2 - cy) ** 2 }))
    .sort((p, q) => p.d - q.d)
    .slice(0, cap)
    .map((e) => e.r);
  return { boxes, ...laneLines(b) };
}
