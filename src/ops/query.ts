import type { Board, BoardEdge, BoardNode, EdgeType } from '../model/types';
import { OpError } from './errors';

export function getNode(b: Board, id: string): BoardNode {
  const n = b.nodes.find((x) => x.id === id);
  if (!n) throw new OpError(`Unknown step "${id}".`);
  return n;
}

export function getEdge(b: Board, id: string): BoardEdge {
  const e = b.edges.find((x) => x.id === id);
  if (!e) throw new OpError(`Unknown arrow "${id}".`);
  return e;
}

export function findEdge(b: Board, source: string, target: string, type?: EdgeType): BoardEdge | undefined {
  return b.edges.find((e) => e.source === source && e.target === target && (!type || e.type === type));
}

export function flowPreds(b: Board, id: string): string[] {
  return b.edges.filter((e) => e.target === id && e.type === 'flow').map((e) => e.source);
}

export function flowSuccs(b: Board, id: string): string[] {
  return b.edges.filter((e) => e.source === id && e.type === 'flow').map((e) => e.target);
}
