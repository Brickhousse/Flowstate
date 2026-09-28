export function soleEdge(edgeSelection: readonly string[], selection: readonly string[]): string | null {
  return edgeSelection.length === 1 && selection.length === 0 ? edgeSelection[0] : null;
}
