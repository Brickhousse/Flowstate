export function panelArrow(listed: readonly string[], edgeSelection: readonly string[], nodeSelection: readonly string[]): string | null {
  if (nodeSelection.length > 0 || edgeSelection.length !== 1) return null;
  return listed.includes(edgeSelection[0]) ? edgeSelection[0] : null;
}
