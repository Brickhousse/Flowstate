import { useReactFlow, useStoreApi } from '@xyflow/react';
import { useCallback, useEffect, useRef } from 'react';
import type { XY } from '../../model/types';
import type { Route } from '../arrowRoutes';
import type { FlowEdgeType } from '../toFlow';
import { arrowsAt, pickTolerance, stackOrder } from './arrowsAt';

export type ArrowsAtScreen = (screen: XY) => string[];

// Stable across board changes, so the listeners and edge handlers holding it never re-bind.
export function useArrowsAt(routes: ReadonlyMap<string, Route> | null, edges: readonly FlowEdgeType[]): ArrowsAtScreen {
  const rf = useReactFlow();
  const rfStore = useStoreApi();
  const latest = useRef({ routes, edges });
  useEffect(() => {
    latest.current = { routes, edges };
  }, [routes, edges]);

  return useCallback(
    (screen: XY): string[] => {
      const { routes, edges } = latest.current;
      if (!routes) return [];
      return arrowsAt(routes, stackOrder(edges), rf.screenToFlowPosition(screen), pickTolerance(rfStore.getState().transform[2]));
    },
    [rf, rfStore],
  );
}
