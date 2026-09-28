import { allocId, makeNode } from '../model/factory';
import type { Board, BoardEdge, BoardNode, Flag } from '../model/types';

export interface Clip {
  nodes: BoardNode[];
  edges: BoardEdge[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function copySubgraph(b: Board, ids: string[]): Clip {
  const picked = new Set(ids);
  for (const n of b.nodes) if (n.groupId && picked.has(n.groupId)) picked.add(n.id);
  return {
    nodes: clone(b.nodes.filter((n) => picked.has(n.id))),
    edges: clone(b.edges.filter((e) => picked.has(e.source) && picked.has(e.target))),
  };
}

export function pasteSubgraph(b: Board, clip: Clip, dx: number, dy: number): string[] {
  const idMap = new Map<string, string>();
  const freshFlags = (flags: Flag[]) => flags.map((f) => ({ ...f, id: allocId(b, 'f') }));
  const laneIds = new Set(b.lanes.map((l) => l.id));
  const created: BoardNode[] = [];
  for (const src of clip.nodes) {
    const copy = makeNode(b, src.kind, { ...src, x: src.x + dx, y: src.y + dy, flags: [] });
    copy.flags = freshFlags(src.flags);
    copy.laneId = src.laneId && laneIds.has(src.laneId) ? src.laneId : null;
    idMap.set(src.id, copy.id);
    created.push(copy);
  }
  for (const copy of created) copy.groupId = copy.groupId ? (idMap.get(copy.groupId) ?? null) : null;
  b.nodes.push(...created);
  for (const e of clip.edges) {
    const bends = e.bends.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    b.edges.push({ ...e, id: allocId(b, 'e'), source: idMap.get(e.source)!, target: idMap.get(e.target)!, flags: freshFlags(e.flags), bends });
  }
  return created.map((n) => n.id);
}
