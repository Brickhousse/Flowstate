import type { ArrowPointer } from './arrowPointer';
import { reportedFirst } from './arrowsAt';

export type MenuArrow = { edgeId: string; bend: number | null };

export function menuArrow(pointer: ArrowPointer, hitsHere: () => string[], edgeSelection: readonly string[]): MenuArrow | null {
  if (pointer.on === 'handle') return { edgeId: pointer.edgeId, bend: pointer.bend };
  const hits = pointer.on === 'line' ? reportedFirst(pointer.edgeId, hitsHere()) : hitsHere();
  const edgeId = hits.find((id) => edgeSelection.includes(id)) ?? hits[0];
  return edgeId ? { edgeId, bend: null } : null;
}
