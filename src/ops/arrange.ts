import { boundsOf, overlaps } from '../layout/geometry';
import { fitGroup } from '../layout/place';
import type { Board, BoardNode } from '../model/types';
import { OpError } from './errors';
import { getNode } from './query';
import { resizeNode, setPositions, withGroupMembers } from './steps';

export const ALIGN_EDGES = ['left', 'center', 'right', 'top', 'middle', 'bottom'] as const;
export type AlignEdge = (typeof ALIGN_EDGES)[number];
export type DistributeAxis = 'horizontal' | 'vertical';
export type MatchDims = 'width' | 'height' | 'both';
export type OrderMove = 'front' | 'forward' | 'backward' | 'back';

type XY = { x: number; y: number };

function topLevel(b: Board, ids: string[], min: number, action: string): BoardNode[] {
  const picked = new Set(ids);
  const nodes = [...picked].map((id) => getNode(b, id)).filter((n) => !(n.groupId && picked.has(n.groupId)));
  if (nodes.length < min) throw new OpError(`${action} needs at least ${min} items that are not inside a selected group.`);
  return nodes;
}

function place(b: Board, positions: Record<string, XY>): void {
  setPositions(b, withGroupMembers(b, positions));
}

export function alignNodes(b: Board, ids: string[], edge: AlignEdge): string[] {
  const nodes = topLevel(b, ids, 2, 'Align');
  const box = boundsOf(nodes);
  if (!box) return [];
  const positions: Record<string, XY> = {};
  for (const n of nodes) {
    const p = { x: n.x, y: n.y };
    if (edge === 'left') p.x = box.x;
    else if (edge === 'center') p.x = box.x + (box.w - n.w) / 2;
    else if (edge === 'right') p.x = box.x + box.w - n.w;
    else if (edge === 'top') p.y = box.y;
    else if (edge === 'middle') p.y = box.y + (box.h - n.h) / 2;
    else p.y = box.y + box.h - n.h;
    positions[n.id] = p;
  }
  place(b, positions);
  return nodes.map((n) => n.id);
}

export function distributeNodes(b: Board, ids: string[], axis: DistributeAxis): string[] {
  const nodes = topLevel(b, ids, 3, 'Distribute');
  const [pos, size] = axis === 'horizontal' ? (['x', 'w'] as const) : (['y', 'h'] as const);
  const sorted = [...nodes].sort((p, q) => p[pos] - q[pos]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const total = sorted.reduce((sum, n) => sum + n[size], 0);
  const gap = (last[pos] + last[size] - first[pos] - total) / (sorted.length - 1);
  const positions: Record<string, XY> = {};
  let at = first[pos];
  for (const n of sorted) {
    positions[n.id] = pos === 'x' ? { x: at, y: n.y } : { x: n.x, y: at };
    at += n[size] + gap;
  }
  place(b, positions);
  return sorted.map((n) => n.id);
}

export function matchSize(b: Board, ids: string[], referenceId: string, dims: MatchDims): string[] {
  const ref = getNode(b, referenceId);
  const others = [...new Set(ids)]
    .filter((id) => id !== referenceId)
    .map((id) => getNode(b, id))
    .filter((n) => n.kind !== 'group');
  if (!others.length) throw new OpError('Match size needs at least one other step or text besides the reference.');
  const groups = new Set<string>();
  for (const n of others) {
    resizeNode(b, n.id, { x: n.x, y: n.y, w: dims === 'height' ? n.w : ref.w, h: dims === 'width' ? n.h : ref.h });
    if (n.groupId) groups.add(n.groupId);
  }
  for (const g of groups) fitGroup(b, g);
  return others.map((n) => n.id);
}

function stepPast(b: Board, id: string, dir: 1 | -1, picked: Set<string>): void {
  const i = b.nodes.findIndex((n) => n.id === id);
  const n = b.nodes[i];
  for (let j = i + dir; j >= 0 && j < b.nodes.length; j += dir) {
    const other = b.nodes[j];
    if (picked.has(other.id) || other.kind === 'group') continue;
    if (overlaps(n, other, 0)) {
      b.nodes.splice(i, 1);
      b.nodes.splice(j, 0, n);
      return;
    }
  }
}

export function reorder(b: Board, ids: string[], move: OrderMove): string[] {
  const picked = new Set(ids.filter((id) => getNode(b, id).kind !== 'group'));
  if (move === 'front' || move === 'back') {
    const chosen = b.nodes.filter((n) => picked.has(n.id));
    const rest = b.nodes.filter((n) => !picked.has(n.id));
    const next = move === 'front' ? [...rest, ...chosen] : [...chosen, ...rest];
    if (next.some((n, i) => n !== b.nodes[i])) b.nodes = next;
  } else {
    const dir = move === 'forward' ? 1 : -1;
    const order = b.nodes.map((n) => n.id).filter((id) => picked.has(id));
    for (const id of dir === 1 ? order.reverse() : order) stepPast(b, id, dir, picked);
  }
  return [...picked];
}
