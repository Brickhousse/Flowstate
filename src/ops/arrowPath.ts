import { searchAround, type AroundOptions } from '../layout/route/around';
import { nearestOnSegment } from '../layout/route/path';
import { simplify, samePoints } from '../layout/route/polyline';
import { edgeSides, portAt } from '../layout/route/ports';
import type { Board, Side, XY } from '../model/types';
import { assertLinkable } from './edges';
import { OpError } from './errors';
import { findEdge, getEdge, getNode } from './query';

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
    if (findEdge(b, source.id, target.id, e.type)) {
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

export function setSeparate(b: Board, ids: string[], separate: boolean): void {
  for (const id of ids) getEdge(b, id).separate = separate;
}

// why: the new bend sits on a straight line on purpose, so it skips collinear cleanup (ADR-0014).
export function addBend(b: Board, id: string, at: XY, route: XY[]): void {
  const e = getEdge(b, id);
  const corners = simplify(route);
  let best = { index: 0, point: corners[0], d: Infinity };
  for (let i = 0; i < corners.length - 1; i++) {
    const point = nearestOnSegment(corners[i], corners[i + 1], at);
    const d = (point.x - at.x) ** 2 + (point.y - at.y) ** 2;
    if (d < best.d) best = { index: i, point, d };
  }
  const inner = corners.slice(1, -1);
  const bends = [...inner.slice(0, best.index), best.point, ...inner.slice(best.index)];
  e.bends = bends.filter((p, i) => i === 0 || p.x !== bends[i - 1].x || p.y !== bends[i - 1].y);
}

export function removeBend(b: Board, id: string, index: number): void {
  const e = getEdge(b, id);
  if (index < 0 || index >= e.bends.length) throw new OpError(`Arrow ${id} has no bend ${index + 1}.`);
  e.bends = simplify(e.bends.filter((_, i) => i !== index));
}

export function routeAround(b: Board, id: string, opts?: AroundOptions): boolean {
  const e = getEdge(b, id);
  const source = getNode(b, e.source);
  const target = getNode(b, e.target);
  const sides = edgeSides(b.direction, e);
  const boxes = b.nodes.filter((n) => n.kind !== 'group');
  const route = searchAround({ source: portAt(source, sides.source), sourceSide: sides.source, target: portAt(target, sides.target), targetSide: sides.target, boxes }, opts);
  const loop = route && route.length === 2 && route[0].x === route[1].x && route[0].y === route[1].y;
  if (!route || loop) return false;
  e.bends = route.slice(1, -1);
  return true;
}
