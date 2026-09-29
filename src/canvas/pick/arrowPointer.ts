import { sideDotElement } from '../sideDots';

// A handle is anything carrying data-edge: the label, the end circles, the segment bars and the bend squares.
export type ArrowPointer = { on: 'handle'; edgeId: string; bend: number | null } | { on: 'line'; edgeId: string } | { on: 'dot' };

export function arrowPointerAt(target: Element): ArrowPointer | null {
  const edgeId = target.closest('[data-edge]')?.getAttribute('data-edge');
  if (edgeId) {
    const bend = target.closest('.fs-arrow-bend')?.getAttribute('data-bend');
    return { on: 'handle', edgeId, bend: bend ? Number(bend) : null };
  }
  const lineId = target.closest('.react-flow__edge')?.getAttribute('data-id');
  if (lineId) return { on: 'line', edgeId: lineId };
  return sideDotElement(target) ? { on: 'dot' } : null;
}
