import { axes, carryBends, laneAt, laneBands } from '../layout/place';
import { allocId, LANE_SIZE } from '../model/factory';
import type { Board, BoardNode, XY } from '../model/types';
import { OpError } from './errors';

export function assertLane(b: Board, laneId: string): void {
  if (!b.lanes.some((l) => l.id === laneId)) {
    const known = b.lanes.map((l) => `${l.id} "${l.name}"`).join(', ') || 'none';
    throw new OpError(`Unknown lane "${laneId}". Lanes: ${known}.`);
  }
}

export function syncLane(b: Board, node: BoardNode): void {
  if (b.lanes.length === 0 || node.kind !== 'step') return;
  const ax = axes(b);
  node.laneId = laneAt(b, node[ax.cross] + node[ax.crossSize] / 2);
}

export function setLanes(b: Board, names: string[]): string[] {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  const lowered = clean.map((n) => n.toLowerCase());
  if (new Set(lowered).size !== lowered.length) throw new OpError('Duplicate lane names.');
  const ax = axes(b);
  const oldStart = new Map(laneBands(b).map((band) => [band.id, band.start]));
  const byName = new Map(b.lanes.map((l) => [l.name.toLowerCase(), l]));
  b.lanes = clean.map((name, order) => {
    const found = byName.get(name.toLowerCase());
    return found ? { id: found.id, name, order, height: found.height } : { id: allocId(b, 'l'), name, order, height: LANE_SIZE };
  });
  const newStart = new Map(laneBands(b).map((band) => [band.id, band.start]));
  const moved = new Map<string, XY>();
  for (const n of b.nodes) {
    if (!n.laneId) continue;
    const before = oldStart.get(n.laneId);
    const after = newStart.get(n.laneId);
    if (after === undefined || before === undefined) {
      n.laneId = null;
      continue;
    }
    n[ax.cross] += after - before;
    moved.set(n.id, crossDelta(ax.cross, after - before));
  }
  carryBends(b, moved);
  return b.lanes.map((l) => l.id);
}

export function renameLane(b: Board, id: string, name: string): void {
  assertLane(b, id);
  b.lanes.find((l) => l.id === id)!.name = name.trim();
}

export function resizeLane(b: Board, id: string, height: number): void {
  assertLane(b, id);
  const ax = axes(b);
  const lane = b.lanes.find((l) => l.id === id)!;
  const delta = Math.max(120, height) - lane.height;
  const below = new Set(b.lanes.filter((l) => l.order > lane.order).map((l) => l.id));
  lane.height += delta;
  const moved = new Map<string, XY>();
  for (const n of b.nodes) {
    if (!n.laneId || !below.has(n.laneId)) continue;
    n[ax.cross] += delta;
    moved.set(n.id, crossDelta(ax.cross, delta));
  }
  carryBends(b, moved);
}

function crossDelta(cross: 'x' | 'y', delta: number): XY {
  return cross === 'x' ? { x: delta, y: 0 } : { x: 0, y: delta };
}
