import { makeNode, SHAPE_SIZE } from '../model/factory';
import type { Actor, Board, EdgeType, Shape, Status } from '../model/types';
import { fitGroup, nudgeFree, placeInLane, positionAfter, positionAtEnd, positionBefore, type Rect } from '../layout/place';
import { connect } from './edges';
import { addToGroup } from './groups';
import { assertLane, syncLane } from './lanes';
import { findEdge, flowPreds, flowSuccs, getNode } from './query';

export interface StepFields {
  title?: string;
  shape?: Shape;
  actor?: Actor | null;
  owner?: string;
  durationMin?: number | null;
  note?: string;
  status?: Status | null;
  replaces?: string;
  color?: string | null;
}

export interface AddStepArgs extends StepFields {
  x?: number;
  y?: number;
  after?: string;
  before?: string;
  edgeType?: EdgeType;
  edgeLabel?: string;
  laneId?: string | null;
  groupId?: string | null;
}

export type StepUpdate = { id: string; laneId?: string | null } & StepFields;

export function cleanFields(fields: StepFields): StepFields {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    out[key] = typeof value === 'string' && key !== 'color' ? value.trim() : value;
  }
  return out as StepFields;
}

export function addStep(b: Board, args: AddStepArgs = {}): string {
  const { x, y, after, before, edgeType = 'flow', edgeLabel = '', laneId, groupId, ...fields } = args;
  const anchor = after ? getNode(b, after) : before ? getNode(b, before) : null;
  const node = makeNode(b, 'step', cleanFields(fields));
  let explicit = false;
  if (anchor && after) positionAfter(b, anchor, node);
  else if (anchor) positionBefore(b, anchor, node);
  else if (x !== undefined && y !== undefined) {
    node.x = x;
    node.y = y;
    explicit = true;
  } else positionAtEnd(b, node);
  if (laneId) {
    assertLane(b, laneId);
    placeInLane(b, node, laneId);
  }
  if (!explicit) nudgeFree(b, node, 1, laneId ? 'main' : 'cross');
  if (!laneId) syncLane(b, node);
  b.nodes.push(node);
  if (after) connect(b, { source: after, target: node.id, type: edgeType, label: edgeLabel });
  else if (before) connect(b, { source: node.id, target: before, type: edgeType, label: edgeLabel });
  if (groupId) addToGroup(b, [node.id], groupId);
  return node.id;
}

export function updateSteps(b: Board, updates: StepUpdate[]): string[] {
  for (const { id, laneId, ...fields } of updates) {
    const n = getNode(b, id);
    const clean = cleanFields(fields);
    if (clean.shape && clean.shape !== n.shape && n.kind === 'step') {
      const size = SHAPE_SIZE[clean.shape];
      const cx = n.x + n.w / 2;
      const cy = n.y + n.h / 2;
      n.w = size.w;
      n.h = size.h;
      n.x = cx - size.w / 2;
      n.y = cy - size.h / 2;
    }
    Object.assign(n, clean);
    if (laneId === null) n.laneId = null;
    else if (laneId) {
      assertLane(b, laneId);
      placeInLane(b, n, laneId);
      nudgeFree(b, n, 1, 'main');
    }
    if (n.groupId) fitGroup(b, n.groupId);
  }
  return updates.map((u) => u.id);
}

export function deleteSteps(b: Board, ids: string[], opts: { reconnect?: boolean } = {}): { deleted: string[]; reconnected: number } {
  for (const id of ids) getNode(b, id);
  const doomed = new Set(ids);
  let reconnected = 0;
  if (opts.reconnect) {
    const reach = (start: string, dir: 'in' | 'out'): string[] => {
      const found = new Set<string>();
      const seen = new Set<string>();
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const next of dir === 'in' ? flowPreds(b, cur) : flowSuccs(b, cur)) {
          if (doomed.has(next)) stack.push(next);
          else found.add(next);
        }
      }
      return [...found];
    };
    for (const id of ids) {
      const succs = reach(id, 'out');
      for (const p of reach(id, 'in')) {
        for (const s of succs) {
          if (p !== s && !findEdge(b, p, s, 'flow')) {
            connect(b, { source: p, target: s });
            reconnected++;
          }
        }
      }
    }
  }
  b.edges = b.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target));
  for (const n of b.nodes) if (n.groupId && doomed.has(n.groupId)) n.groupId = null;
  b.nodes = b.nodes.filter((n) => !doomed.has(n.id));
  return { deleted: ids, reconnected };
}

export function setPositions(b: Board, positions: Record<string, { x: number; y: number }>): void {
  const groups = new Set<string>();
  for (const n of b.nodes) {
    const p = positions[n.id];
    if (!p) continue;
    n.x = p.x;
    n.y = p.y;
    syncLane(b, n);
    if (n.groupId) groups.add(n.groupId);
  }
  for (const g of groups) if (!positions[g]) fitGroup(b, g);
}

export function resizeNode(b: Board, id: string, rect: Rect): void {
  const n = getNode(b, id);
  n.x = rect.x;
  n.y = rect.y;
  n.w = Math.max(24, rect.w);
  n.h = Math.max(24, rect.h);
}
