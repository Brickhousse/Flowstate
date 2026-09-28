import { GROUP_MIN } from '../model/factory';
import type { Board, BoardNode } from '../model/types';
import { axes, boundsOf, GAP_CROSS, GAP_MAIN, overlaps } from './geometry';

export { axes, boundsOf, GAP_CROSS, GAP_MAIN, overlaps } from './geometry';
export type { Axes, Rect } from './geometry';

export interface LaneBand {
  id: string;
  start: number;
  size: number;
}

const GROUP_PAD = 32;
const GROUP_HEADER = 16;

export function positionAfter(board: Board, anchor: BoardNode, node: BoardNode): void {
  const ax = axes(board);
  node[ax.main] = anchor[ax.main] + anchor[ax.mainSize] + GAP_MAIN;
  node[ax.cross] = anchor[ax.cross] + (anchor[ax.crossSize] - node[ax.crossSize]) / 2;
}

export function positionBefore(board: Board, anchor: BoardNode, node: BoardNode): void {
  const ax = axes(board);
  node[ax.main] = anchor[ax.main] - GAP_MAIN - node[ax.mainSize];
  node[ax.cross] = anchor[ax.cross] + (anchor[ax.crossSize] - node[ax.crossSize]) / 2;
}

export function positionBeside(board: Board, anchor: BoardNode, node: BoardNode, dir: 1 | -1): void {
  const ax = axes(board);
  node[ax.main] = anchor[ax.main] + (anchor[ax.mainSize] - node[ax.mainSize]) / 2;
  node[ax.cross] = dir === 1 ? anchor[ax.cross] + anchor[ax.crossSize] + GAP_CROSS : anchor[ax.cross] - GAP_CROSS - node[ax.crossSize];
}

export function positionAtEnd(board: Board, node: BoardNode): void {
  const ax = axes(board);
  const others = board.nodes.filter((n) => n.kind !== 'group' && n.id !== node.id);
  if (others.length === 0) {
    node.x = 0;
    node.y = 0;
    return;
  }
  const last = others.reduce((a, b) => (b[ax.main] + b[ax.mainSize] > a[ax.main] + a[ax.mainSize] ? b : a));
  positionAfter(board, last, node);
}

export function nudgeFree(board: Board, node: BoardNode, prefer: 1 | -1 = 1, along: 'cross' | 'main' = 'cross'): void {
  const ax = axes(board);
  const coord = along === 'cross' ? ax.cross : ax.main;
  const size = along === 'cross' ? ax.crossSize : ax.mainSize;
  const obstacles = board.nodes.filter((n) => n.id !== node.id && n.kind !== 'group');
  const start = node[coord];
  const step = node[size] + (along === 'cross' ? GAP_CROSS : GAP_MAIN);
  for (let i = 0; i < 400; i++) {
    const ring = Math.ceil(i / 2);
    const sign = i % 2 === 1 ? prefer : -prefer;
    node[coord] = start + ring * step * sign;
    if (!obstacles.some((o) => overlaps(node, o))) return;
  }
  node[coord] = start;
}

export function shiftDownstream(board: Board, rootId: string, delta: number, exclude: Set<string> = new Set()): void {
  const ax = axes(board);
  const seen = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || exclude.has(id)) continue;
    seen.add(id);
    for (const e of board.edges) if (e.source === id && e.type !== 'handoff') queue.push(e.target);
  }
  const groups = new Set<string>();
  for (const n of board.nodes) {
    if (!seen.has(n.id)) continue;
    n[ax.main] += delta;
    if (n.groupId) groups.add(n.groupId);
  }
  for (const g of groups) fitGroup(board, g);
  for (const e of board.edges) {
    if (!e.bends.length || !seen.has(e.source) || !seen.has(e.target)) continue;
    e.bends = e.bends.map((p) => (ax.main === 'x' ? { x: p.x + delta, y: p.y } : { x: p.x, y: p.y + delta }));
  }
}

export function ensureGap(board: Board, fromId: string, toId: string, exclude: Set<string> = new Set([fromId])): void {
  const ax = axes(board);
  const from = board.nodes.find((n) => n.id === fromId)!;
  const to = board.nodes.find((n) => n.id === toId)!;
  const needed = from[ax.main] + from[ax.mainSize] + GAP_MAIN - to[ax.main];
  if (needed > 0) shiftDownstream(board, toId, needed, exclude);
}

export function laneBands(board: Board): LaneBand[] {
  let start = 0;
  return [...board.lanes]
    .sort((a, b) => a.order - b.order)
    .map((lane) => {
      const band = { id: lane.id, start, size: lane.height };
      start += lane.height;
      return band;
    });
}

export function laneAt(board: Board, crossCenter: number): string | null {
  const band = laneBands(board).find((b) => crossCenter >= b.start && crossCenter < b.start + b.size);
  return band?.id ?? null;
}

export function placeInLane(board: Board, node: BoardNode, laneId: string): void {
  const ax = axes(board);
  const band = laneBands(board).find((b) => b.id === laneId);
  if (!band) return;
  node.laneId = laneId;
  node[ax.cross] = band.start + (band.size - node[ax.crossSize]) / 2;
}

export function fitGroup(board: Board, groupId: string): void {
  const group = board.nodes.find((n) => n.id === groupId);
  if (!group) return;
  const box = boundsOf(board.nodes.filter((n) => n.groupId === groupId));
  if (!box) return;
  group.x = box.x - GROUP_PAD;
  group.y = box.y - GROUP_PAD - GROUP_HEADER;
  group.w = Math.max(GROUP_MIN.w, box.w + GROUP_PAD * 2);
  group.h = Math.max(GROUP_MIN.h, box.h + GROUP_PAD * 2 + GROUP_HEADER);
}
