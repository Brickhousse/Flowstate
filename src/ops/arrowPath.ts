import { edgeSides } from '../layout/route/ports';
import { simplify } from '../layout/route/through';
import type { Board, Side, XY } from '../model/types';
import { assertLinkable } from './edges';
import { OpError } from './errors';
import { getEdge, getNode } from './query';

export type ArrowEnd = 'source' | 'target';

const EPS = 0.01;

export function shiftBends(b: Board, moved: ReadonlyMap<string, XY>): void {
  for (const e of b.edges) {
    const s = moved.get(e.source);
    const t = moved.get(e.target);
    if (!e.bends.length || !s || !t) continue;
    if (Math.abs(s.x - t.x) > EPS || Math.abs(s.y - t.y) > EPS || (s.x === 0 && s.y === 0)) continue;
    e.bends = e.bends.map((p) => ({ x: p.x + s.x, y: p.y + s.y }));
  }
}

export function reattach(b: Board, id: string, end: ArrowEnd, nodeId: string, side: Side): void {
  const e = getEdge(b, id);
  const node = getNode(b, nodeId);
  const current = end === 'source' ? e.source : e.target;
  if (node.id === current && edgeSides(b.direction, e)[end] === side) return;
  if (node.id !== current) {
    const source = end === 'source' ? node : getNode(b, e.source);
    const target = end === 'target' ? node : getNode(b, e.target);
    assertLinkable(source, target);
    if (b.edges.some((x) => x.id !== e.id && x.source === source.id && x.target === target.id && x.type === e.type)) {
      throw new OpError(`${source.id} already has a ${e.type} arrow to ${target.id}.`);
    }
    e.bends = [];
    if (end === 'source') e.source = node.id;
    else e.target = node.id;
  }
  if (end === 'source') e.sourceSide = side;
  else e.targetSide = side;
}

export function setBends(b: Board, id: string, bends: XY[]): void {
  getEdge(b, id).bends = simplify(bends);
}

export function resetPath(b: Board, ids: string[]): void {
  for (const id of ids) {
    const e = getEdge(b, id);
    if (e.bends.length) e.bends = [];
  }
}
