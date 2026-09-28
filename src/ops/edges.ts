import { allocId } from '../model/factory';
import type { Board, BoardNode, EdgeType, Side } from '../model/types';
import { assertColor } from './color';
import { OpError } from './errors';
import { findEdge, getEdge, getNode } from './query';

export interface ConnectArgs {
  source: string;
  target: string;
  type?: EdgeType;
  label?: string;
  sourceSide?: Side | null;
  targetSide?: Side | null;
}

export function assertLinkable(source: BoardNode, target: BoardNode): void {
  if (source.kind === 'group' || target.kind === 'group') {
    throw new OpError('Groups cannot be connected. Connect the steps inside them.');
  }
  if (source.id === target.id) throw new OpError(`Cannot connect ${source.id} to itself.`);
}

export function connect(b: Board, args: ConnectArgs): string {
  const source = getNode(b, args.source);
  const target = getNode(b, args.target);
  assertLinkable(source, target);
  const type = args.type ?? 'flow';
  const existing = findEdge(b, source.id, target.id, type);
  if (existing) {
    if (args.label) existing.label = args.label.trim();
    return existing.id;
  }
  const id = allocId(b, 'e');
  b.edges.push({
    id,
    source: source.id,
    target: target.id,
    sourceSide: args.sourceSide ?? null,
    targetSide: args.targetSide ?? null,
    type,
    label: (args.label ?? '').trim(),
    flags: [],
    separate: false,
    bends: [],
    color: null,
  });
  return id;
}

export function disconnect(b: Board, args: { source: string; target: string; type?: EdgeType }): number {
  const before = b.edges.length;
  b.edges = b.edges.filter((e) => !(e.source === args.source && e.target === args.target && (!args.type || e.type === args.type)));
  const removed = before - b.edges.length;
  if (removed === 0) throw new OpError(`${args.source} is not connected to ${args.target}.`);
  return removed;
}

export function deleteEdges(b: Board, ids: string[]): void {
  for (const id of ids) getEdge(b, id);
  const doomed = new Set(ids);
  b.edges = b.edges.filter((e) => !doomed.has(e.id));
}

export function updateEdge(b: Board, id: string, patch: { type?: EdgeType; label?: string; color?: string | null }): void {
  const e = getEdge(b, id);
  if (patch.color) assertColor(patch.color);
  if (patch.type) e.type = patch.type;
  if (patch.label !== undefined) e.label = patch.label.trim();
  if (patch.color !== undefined) e.color = patch.color;
}
