import { axes, fitGroup, nudgeFree, positionAfter } from '../layout/place';
import { makeNode } from '../model/factory';
import type { Board, BoardNode } from '../model/types';
import { OpError } from './errors';
import { getNode } from './query';

function inside(n: BoardNode, g: BoardNode): boolean {
  return n.x >= g.x && n.y >= g.y && n.x + n.w <= g.x + g.w && n.y + n.h <= g.y + g.h;
}

export function addToGroup(b: Board, ids: string[], groupId: string, moveInto = false): void {
  const group = getNode(b, groupId);
  if (group.kind !== 'group') throw new OpError(`"${groupId}" is not a group.`);
  const ax = axes(b);
  const members = b.nodes.filter((n) => n.groupId === groupId);
  const oldGroups = new Set<string>();
  for (const id of ids) {
    const n = getNode(b, id);
    if (n.kind === 'group') throw new OpError('Groups cannot be nested.');
    if (n.groupId && n.groupId !== groupId) oldGroups.add(n.groupId);
    if (moveInto && members.length > 0 && !inside(n, group)) {
      const last = members.reduce((a, c) => (c[ax.main] + c[ax.mainSize] > a[ax.main] + a[ax.mainSize] ? c : a));
      positionAfter(b, last, n);
      nudgeFree(b, n);
    }
    n.groupId = groupId;
    members.push(n);
  }
  fitGroup(b, groupId);
  for (const g of oldGroups) fitGroup(b, g);
}

export function groupSteps(b: Board, ids: string[], title: string): string {
  if (ids.length === 0) throw new OpError('A group needs at least one step.');
  for (const id of ids) if (getNode(b, id).kind === 'group') throw new OpError('Groups cannot be nested.');
  const group = makeNode(b, 'group', { title: title.trim() });
  b.nodes.push(group);
  addToGroup(b, ids, group.id);
  return group.id;
}

export function ungroup(b: Board, groupId: string): void {
  const group = getNode(b, groupId);
  if (group.kind !== 'group') throw new OpError(`"${groupId}" is not a group.`);
  for (const n of b.nodes) if (n.groupId === groupId) n.groupId = null;
  b.nodes = b.nodes.filter((n) => n.id !== groupId);
}
