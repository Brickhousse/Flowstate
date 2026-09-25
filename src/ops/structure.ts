import { makeNode } from '../model/factory';
import type { Board, BoardNode, Side } from '../model/types';
import { axes, ensureGap, fitGroup, GAP_MAIN, nudgeFree, placeInLane, positionAfter, positionBefore, positionBeside } from '../layout/place';
import { connect } from './edges';
import { OpError } from './errors';
import { addToGroup } from './groups';
import { assertLane, syncLane } from './lanes';
import { getNode, flowPreds } from './query';
import { addStep, cleanFields, type StepFields } from './steps';

export type BranchItem = { existing: string } | StepFields;

export interface MoveArgs {
  ids: string[];
  relation?: 'after' | 'before' | 'above' | 'below';
  anchor?: string;
  laneId?: string;
  groupId?: string;
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function isExisting(item: BranchItem): item is { existing: string } {
  return 'existing' in item;
}

function pushStep(b: Board, fields: StepFields): string {
  const n = makeNode(b, 'step', cleanFields(fields));
  b.nodes.push(n);
  return n.id;
}

export function insertBetween(b: Board, from: string, to: string, fields: StepFields): string {
  const fromNode = getNode(b, from);
  const toNode = getNode(b, to);
  const edge = b.edges.find((e) => e.source === from && e.target === to && e.type !== 'handoff');
  if (!edge) throw new OpError(`${from} is not connected to ${to}. Connect them first, or add the step with "after".`);
  const { id: edgeId, type, label } = edge;
  const ax = axes(b);
  const node = makeNode(b, 'step', cleanFields(fields));
  node[ax.main] = fromNode[ax.main] + fromNode[ax.mainSize] + GAP_MAIN;
  node[ax.cross] = toNode[ax.cross] + (toNode[ax.crossSize] - node[ax.crossSize]) / 2;
  node.laneId = toNode.laneId;
  b.nodes.push(node);
  b.edges = b.edges.filter((e) => e.id !== edgeId);
  connect(b, { source: from, target: node.id, type, label });
  connect(b, { source: node.id, target: to, type });
  ensureGap(b, node.id, to, new Set([node.id, from]));
  nudgeFree(b, node);
  return node.id;
}

export function spliceOut(b: Board, id: string): void {
  const preds = flowPreds(b, id);
  const succs = b.edges.filter((e) => e.source === id && e.type === 'flow').map((e) => e.target);
  b.edges = b.edges.filter((e) => !(e.type === 'flow' && (e.source === id || e.target === id)));
  for (const p of preds) for (const s of succs) if (p !== s) connect(b, { source: p, target: s });
}

export function branchParallel(b: Board, from: string, branches: BranchItem[][], joinAt?: string): string[][] {
  const fromNode = getNode(b, from);
  if (joinAt) getNode(b, joinAt);
  if (branches.length === 0 || branches.some((br) => br.length === 0)) throw new OpError('Each branch needs at least one step.');
  const existing = branches.flat().filter(isExisting).map((i) => i.existing);
  for (const id of existing) {
    getNode(b, id);
    if (id === from || id === joinAt) throw new OpError(`${id} cannot be both the branch point or join and a step inside a branch.`);
  }
  if (new Set(existing).size !== existing.length) throw new OpError('A step can only appear once across branches.');

  for (const id of existing) spliceOut(b, id);
  if (joinAt) b.edges = b.edges.filter((e) => !(e.source === from && e.target === joinAt && e.type === 'flow'));

  const ids = branches.map((branch) => branch.map((item) => (isExisting(item) ? item.existing : pushStep(b, item))));
  for (const branch of ids) {
    let prev: BoardNode = fromNode;
    for (const id of branch) {
      const n = getNode(b, id);
      positionAfter(b, prev, n);
      nudgeFree(b, n);
      syncLane(b, n);
      prev = n;
    }
    connect(b, { source: from, target: branch[0] });
    for (let i = 1; i < branch.length; i++) connect(b, { source: branch[i - 1], target: branch[i] });
    if (joinAt) connect(b, { source: branch[branch.length - 1], target: joinAt });
  }
  if (joinAt) {
    const exclude = new Set([from, ...ids.flat()]);
    for (const branch of ids) ensureGap(b, branch[branch.length - 1], joinAt, exclude);
  }
  return ids;
}

export function moveSteps(b: Board, args: MoveArgs): string[] {
  const nodes = args.ids.map((id) => getNode(b, id));
  if (args.relation && args.anchor) {
    const anchor = getNode(b, args.anchor);
    if (args.ids.includes(anchor.id)) throw new OpError('A step cannot be moved relative to itself.');
    let prev = anchor;
    for (const n of nodes) {
      if (args.relation === 'after') positionAfter(b, prev, n);
      else if (args.relation === 'before') positionBefore(b, prev, n);
      else positionBeside(b, prev, n, args.relation === 'below' ? 1 : -1);
      nudgeFree(b, n, args.relation === 'above' ? -1 : 1);
      syncLane(b, n);
      prev = n;
    }
  } else if (args.laneId) {
    assertLane(b, args.laneId);
    for (const n of nodes) {
      placeInLane(b, n, args.laneId);
      nudgeFree(b, n, 1, 'main');
    }
  } else if (args.groupId) {
    addToGroup(b, args.ids, args.groupId, true);
  } else {
    throw new OpError('Say where to move: a relation with an anchor step, a lane, or a group.');
  }
  const groups = new Set(nodes.map((n) => n.groupId).filter((g): g is string => !!g));
  for (const g of groups) fitGroup(b, g);
  return args.ids;
}

export function addStepOnSide(b: Board, id: string, side: Side): string {
  const anchor = getNode(b, id);
  const ax = axes(b);
  const forward: Side = ax.main === 'x' ? 'right' : 'bottom';
  const backward: Side = ax.main === 'x' ? 'left' : 'top';
  if (side === forward) return addStep(b, { after: id, actor: anchor.actor });
  if (side === backward) return addStep(b, { before: id, actor: anchor.actor });
  const node = makeNode(b, 'step', { actor: anchor.actor });
  const dir = side === 'bottom' || side === 'right' ? 1 : -1;
  positionBeside(b, anchor, node, dir);
  nudgeFree(b, node, dir);
  syncLane(b, node);
  b.nodes.push(node);
  connect(b, { source: id, target: node.id, sourceSide: side, targetSide: OPPOSITE[side] });
  return node.id;
}

export function addNext(b: Board, id: string): string {
  return addStepOnSide(b, id, axes(b).main === 'x' ? 'right' : 'bottom');
}

export function addSibling(b: Board, id: string): string {
  const anchor = getNode(b, id);
  const node = makeNode(b, 'step', { actor: anchor.actor });
  positionBeside(b, anchor, node, 1);
  nudgeFree(b, node, 1);
  syncLane(b, node);
  b.nodes.push(node);
  const parent = flowPreds(b, id)[0];
  if (parent) connect(b, { source: parent, target: node.id });
  return node.id;
}
