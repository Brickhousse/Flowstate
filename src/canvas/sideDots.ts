import { SIDES, type Side } from '../model/types';

// React Flow renders each side dot as `.react-flow__handle` with data-nodeid and data-handleid, and our handle ids are Sides.
const DOT_CLASS = 'react-flow__handle';

export interface SideDot {
  nodeId: string;
  side: Side;
}

export function asSide(handleId: string | null | undefined): Side | null {
  return SIDES.find((s) => s === handleId) ?? null;
}

export function isOnSideDot(target: EventTarget | null): target is Element {
  return target instanceof Element && !!target.closest(`.${DOT_CLASS}`);
}

function sideDotOf(el: Element): SideDot | null {
  if (!el.classList.contains(DOT_CLASS)) return null;
  const nodeId = el.getAttribute('data-nodeid');
  const side = asSide(el.getAttribute('data-handleid'));
  return nodeId && side ? { nodeId, side } : null;
}

export function dotAt(x: number, y: number): SideDot | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const dot = sideDotOf(el);
    if (dot) return dot;
  }
  return null;
}
