import { useStore, type ReactFlowState } from '@xyflow/react';
import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import type { Route } from '../arrowRoutes';
import type { FlowEdgeType } from '../toFlow';
import { culledOnScreen, overlayCandidates } from './culling';

export function useCulledArrows(edges: readonly FlowEdgeType[], routes: ReadonlyMap<string, Route>): FlowEdgeType[] {
  const select = useMemo(() => {
    let nodes: ReactFlowState['nodes'] | null = null;
    let candidates: FlowEdgeType[] = [];
    return (s: ReactFlowState): FlowEdgeType[] => {
      // why: ADR-0018
      if (s.nodes !== nodes) {
        nodes = s.nodes;
        candidates = overlayCandidates(edges, routes, s.nodeLookup);
      }
      return culledOnScreen(candidates, routes, s.nodeLookup, s);
    };
  }, [edges, routes]);
  return useStore(select, shallow);
}
