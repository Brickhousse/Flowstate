import { useStore, useStoreApi, ViewportPortal, type EdgeMouseHandler } from '@xyflow/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Arrow } from '../Arrow';
import type { Route } from '../arrowRoutes';
import type { FlowEdgeType } from '../toFlow';
import { markerUrl } from './markerUrl';
import { selectArrowOnClick } from './selectArrowOnClick';
import { useCulledArrows } from './useCulledArrows';

interface Props {
  edges: readonly FlowEdgeType[];
  routes: ReadonlyMap<string, Route>;
  editable: boolean;
  onEdgeClick: EdgeMouseHandler<FlowEdgeType>;
  onEdgeDoubleClick: EdgeMouseHandler<FlowEdgeType>;
}

// why: this layer follows the nodes in the DOM, so an arrow under the steps needs a lower z than their 0 (ADR-0018).
function layerZ(edgeZ: number | undefined): number {
  return edgeZ ? edgeZ : -1;
}

export function CulledArrows({ edges, routes, editable, onEdgeClick, onEdgeDoubleClick }: Props) {
  const culled = useCulledArrows(edges, routes);
  const rfId = useStore((s) => s.rfId);
  const store = useStoreApi();
  if (!culled.length) return null;
  const onClick = (e: ReactMouseEvent, edge: FlowEdgeType) => {
    if (!editable) return;
    selectArrowOnClick(store, edge.id);
    onEdgeClick(e, edge);
  };
  return (
    <ViewportPortal>
      {culled.map((edge) => {
        const route = routes.get(edge.id);
        if (!route || !edge.data) return null;
        return (
          <svg key={edge.id} className="fs-culled" width={1} height={1} style={{ zIndex: layerZ(edge.zIndex) }}>
            {/* why: React Flow's pan filter and the arrow picker both know an arrow line by its class (ADR-0018). */}
            <g className={`react-flow__edge fs-culled-arrow nopan${editable ? ' selectable' : ''}`} data-id={edge.id} onClick={(e) => onClick(e, edge)} onDoubleClick={(e) => onEdgeDoubleClick(e, edge)}>
              <Arrow id={edge.id} data={edge.data} route={route} selected={!!edge.selected} markerEnd={markerUrl(edge.markerEnd, rfId)} />
            </g>
          </svg>
        );
      })}
    </ViewportPortal>
  );
}
