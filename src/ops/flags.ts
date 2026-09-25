import { makeFlag } from '../model/factory';
import type { Board, Flag, FlagKind } from '../model/types';
import { OpError } from './errors';

export interface OpenFlag {
  flag: Flag;
  hostId: string;
  hostKind: 'node' | 'edge';
}

function host(b: Board, targetId: string): { flags: Flag[] } {
  const found = b.nodes.find((n) => n.id === targetId) ?? b.edges.find((e) => e.id === targetId);
  if (!found) throw new OpError(`Unknown step or arrow "${targetId}".`);
  return found;
}

function locate(b: Board, flagId: string): { owner: { flags: Flag[] }; flag: Flag } {
  for (const owner of [...b.nodes, ...b.edges]) {
    const flag = owner.flags.find((f) => f.id === flagId);
    if (flag) return { owner, flag };
  }
  throw new OpError(`Unknown flag "${flagId}".`);
}

export function addFlag(b: Board, targetId: string, kind: FlagKind, text: string): string {
  const owner = host(b, targetId);
  const flag = makeFlag(b, kind, text.trim());
  owner.flags.push(flag);
  return flag.id;
}

export function setFlagResolved(b: Board, flagId: string, resolved: boolean): void {
  locate(b, flagId).flag.resolved = resolved;
}

export function updateFlagText(b: Board, flagId: string, text: string): void {
  locate(b, flagId).flag.text = text.trim();
}

export function removeFlag(b: Board, flagId: string): void {
  const { owner } = locate(b, flagId);
  owner.flags = owner.flags.filter((f) => f.id !== flagId);
}

export function openFlags(b: Board): OpenFlag[] {
  const out: OpenFlag[] = [];
  for (const n of b.nodes) for (const flag of n.flags) if (!flag.resolved) out.push({ flag, hostId: n.id, hostKind: 'node' });
  for (const e of b.edges) for (const flag of e.flags) if (!flag.resolved) out.push({ flag, hostId: e.id, hostKind: 'edge' });
  return out;
}
