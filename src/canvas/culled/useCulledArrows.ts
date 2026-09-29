import { useStore, type ReactFlowState } from '@xyflow/react';
import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import type { Route } from '../arrowRoutes';
import type { FlowEdgeType } from '../toFlow';
import { culledOnScreen, overlayCandidates } from './culling';

// The arrows React Flow culls although their route is on screen, read from its store so both decide from the same nodes and pane.
export function useCulledArrows(edges: readonly FlowEdgeType[], routes: ReadonlyMap<string, Route>): FlowEdgeType[] {
  const select = useMemo(() => {
    let nodes: ReactFlowState['nodes'] | null = null;
    let candidates: FlowEdgeType[] = [];
    return (s: ReactFlowState): FlowEdgeType[] => {
      // why: the candidates depend on the boxes, which change with s.nodes, and not on the pane (ADR-0018).
      if (s.nodes !== nodes) {
        nodes = s.nodes;
        candidates = overlayCandidates(edges, routes, s.nodeLookup);
      }
      return culledOnScreen(candidates, routes, s.nodeLookup, s);
    };
  }, [edges, routes]);
  return useStore(select, shallow);
}
