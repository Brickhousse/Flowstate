import { simplify, samePoints } from '../layout/route/polyline';
import { edgeSides } from '../layout/route/ports';
import type { Board, Side, XY } from '../model/types';
import { assertLinkable } from './edges';
import { OpError } from './errors';
import { getEdge, getNode } from './query';

export type ArrowEnd = 'source' | 'target';

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
  const e = getEdge(b, id);
  const next = simplify(bends);
  if (!samePoints(next, e.bends)) e.bends = next;
}

export function resetPath(b: Board, ids: string[]): void {
  for (const id of ids) {
    const e = getEdge(b, id);
    if (e.bends.length) e.bends = [];
  }
}
