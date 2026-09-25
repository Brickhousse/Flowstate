import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import { FlagBadges } from './FlagBadges';
import type { FlowEdgeType } from './toFlow';

export function FlowEdge(props: EdgeProps<FlowEdgeType>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 14, offset: 22 });
  if (!data) return null;
  const { edge, critical, dimmed } = data;
  const className = ['fs-edge', `type-${edge.type}`, critical && 'is-critical', dimmed && 'is-dimmed', selected && 'is-selected'].filter(Boolean).join(' ');
  const openFlags = edge.flags.filter((f) => !f.resolved);
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className={className} interactionWidth={18} />
      {(edge.label || openFlags.length > 0) && (
        <EdgeLabelRenderer>
          <div className={`fs-edge-label nodrag nopan ${dimmed ? 'is-dimmed' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {edge.label && <span>{edge.label}</span>}
            <FlagBadges flags={openFlags} />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
