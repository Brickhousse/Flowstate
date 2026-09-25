import type { Board, BoardEdge } from '../model/types';

export interface CriticalPathResult {
  nodeIds: string[];
  edgeIds: string[];
  totalMin: number;
  ignoredEdgeIds: string[];
  missingDuration: string[];
}

function backEdges(ids: string[], edges: BoardEdge[]): Set<string> {
  const out = new Map<string, BoardEdge[]>();
  const hasIncoming = new Set<string>();
  for (const e of edges) {
    out.set(e.source, [...(out.get(e.source) ?? []), e]);
    hasIncoming.add(e.target);
  }
  const color = new Map<string, 1 | 2>();
  const back = new Set<string>();
  const roots = [...ids.filter((id) => !hasIncoming.has(id)), ...ids];
  for (const root of roots) {
    if (color.has(root)) continue;
    color.set(root, 1);
    const stack: Array<{ id: string; i: number }> = [{ id: root, i: 0 }];
    while (stack.length) {
      const top = stack[stack.length - 1];
      const list = out.get(top.id) ?? [];
      if (top.i < list.length) {
        const e = list[top.i++];
        const c = color.get(e.target);
        if (c === 1) back.add(e.id);
        else if (c === undefined) {
          color.set(e.target, 1);
          stack.push({ id: e.target, i: 0 });
        }
      } else {
        color.set(top.id, 2);
        stack.pop();
      }
    }
  }
  return back;
}

export function criticalPath(board: Board): CriticalPathResult {
  const steps = board.nodes.filter((n) => n.kind === 'step');
  const byId = new Map(steps.map((s) => [s.id, s]));
  const edges = board.edges.filter((e) => e.type !== 'handoff' && byId.has(e.source) && byId.has(e.target));
  const ignored = backEdges(steps.map((s) => s.id), edges);
  const dag = edges.filter((e) => !ignored.has(e.id));

  const incoming = new Map<string, BoardEdge[]>();
  const outgoing = new Map<string, BoardEdge[]>();
  const indegree = new Map(steps.map((s) => [s.id, 0]));
  for (const e of dag) {
    incoming.set(e.target, [...(incoming.get(e.target) ?? []), e]);
    outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e]);
    indegree.set(e.target, indegree.get(e.target)! + 1);
  }
  const queue = steps.filter((s) => indegree.get(s.id) === 0).map((s) => s.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const e of outgoing.get(id) ?? []) {
      indegree.set(e.target, indegree.get(e.target)! - 1);
      if (indegree.get(e.target) === 0) queue.push(e.target);
    }
  }

  const score = new Map<string, { dist: number; hops: number }>();
  const via = new Map<string, BoardEdge>();
  const better = (a: { dist: number; hops: number }, b: { dist: number; hops: number }) =>
    a.dist > b.dist || (a.dist === b.dist && a.hops > b.hops);
  let end: string | undefined;
  for (const id of order) {
    let best = { dist: 0, hops: 0 };
    let bestEdge: BoardEdge | undefined;
    for (const e of incoming.get(id) ?? []) {
      const s = score.get(e.source)!;
      if (!bestEdge || better(s, best)) {
        best = s;
        bestEdge = e;
      }
    }
    score.set(id, { dist: best.dist + (byId.get(id)!.durationMin ?? 0), hops: best.hops + 1 });
    if (bestEdge) via.set(id, bestEdge);
    if (!end || better(score.get(id)!, score.get(end)!)) end = id;
  }
  if (!end) return { nodeIds: [], edgeIds: [], totalMin: 0, ignoredEdgeIds: [], missingDuration: [] };

  const nodeIds = [end];
  const edgeIds: string[] = [];
  for (let cur = end; via.has(cur); ) {
    const e = via.get(cur)!;
    edgeIds.unshift(e.id);
    cur = e.source;
    nodeIds.unshift(cur);
  }
  return {
    nodeIds,
    edgeIds,
    totalMin: score.get(end)!.dist,
    ignoredEdgeIds: [...ignored],
    missingDuration: nodeIds.filter((id) => byId.get(id)!.durationMin === null),
  };
}
