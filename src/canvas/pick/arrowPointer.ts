import { sideDotElement } from '../sideDots';

export type ArrowPointer = { on: 'named'; edgeId: string; bend: number | null } | { on: 'line'; edgeId: string } | { on: 'dot' };

export function arrowPointerAt(target: Element): ArrowPointer | null {
  const edgeId = target.closest('[data-edge]')?.getAttribute('data-edge');
  if (edgeId) {
    const bend = target.closest('.fs-arrow-bend')?.getAttribute('data-bend');
    return { on: 'named', edgeId, bend: bend ? Number(bend) : null };
  }
  const lineId = target.closest('.react-flow__edge')?.getAttribute('data-id');
  if (lineId) return { on: 'line', edgeId: lineId };
  return sideDotElement(target) ? { on: 'dot' } : null;
}
