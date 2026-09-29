import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import { roundedPath } from '../layout/route/path';
import { ArrowHandles } from './ArrowHandles';
import type { Route } from './arrowRoutes';
import { EdgeToolbar } from './EdgeToolbar';
import { FlagBadges } from './FlagBadges';
import { ARROW_HIT_WIDTH } from './pick/arrowsAt';
import type { EdgeViewData } from './toFlow';

export interface ArrowProps {
  id: string;
  data: EdgeViewData;
  route: Route;
  selected: boolean;
  markerEnd: string | undefined;
}

// Everything an arrow draws, whether React Flow mounts it or the culled-arrow layer does (ADR-0018).
export function Arrow({ id, data, route, selected, markerEnd }: ArrowProps) {
  const { edge, critical, dimmed, color, labelColor } = data;
  const { x: labelX, y: labelY } = route.label;
  const className = ['fs-edge', `type-${edge.type}`, critical && 'is-critical', dimmed && 'is-dimmed', selected && 'is-selected'].filter(Boolean).join(' ');
  const openFlags = edge.flags.filter((f) => !f.resolved);
  return (
    <>
      <BaseEdge id={id} path={roundedPath(route.points)} markerEnd={markerEnd} className={className} style={{ stroke: color }} interactionWidth={ARROW_HIT_WIDTH} />
      {(edge.label || openFlags.length > 0) && (
        <EdgeLabelRenderer>
          <div className={`fs-edge-label nodrag nopan ${dimmed ? 'is-dimmed' : ''}`} data-edge={id} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, color: labelColor ?? undefined }}>
            {edge.label && <span>{edge.label}</span>}
            <FlagBadges flags={openFlags} />
          </div>
        </EdgeLabelRenderer>
      )}
      {data.editable && selected && <EdgeToolbar edge={edge} x={labelX} y={labelY} />}
      {data.editable && selected && <ArrowHandles edge={edge} route={route} />}
    </>
  );
}
