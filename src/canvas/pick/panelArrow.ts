import { soleEdge } from '../selection';

export function panelArrow(listed: readonly string[], edgeSelection: readonly string[], nodeSelection: readonly string[]): string | null {
  const id = soleEdge(edgeSelection, nodeSelection);
  return id && listed.includes(id) ? id : null;
}
