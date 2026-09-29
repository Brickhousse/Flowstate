import type { useStoreApi } from '@xyflow/react';

type FlowStore = ReturnType<typeof useStoreApi>;

// What React Flow's EdgeWrapper does on a click, so a culled arrow's selection round-trips through the same changes.
export function selectArrowOnClick(store: FlowStore, id: string): void {
  const { addSelectedEdges, unselectNodesAndEdges, multiSelectionActive, edgeLookup } = store.getState();
  const edge = edgeLookup.get(id);
  if (!edge) return;
  store.setState({ nodesSelectionActive: false });
  if (edge.selected && multiSelectionActive) unselectNodesAndEdges({ nodes: [], edges: [edge] });
  else addSelectedEdges([id]);
}
