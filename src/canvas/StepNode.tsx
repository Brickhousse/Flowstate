import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { Clock } from 'lucide-react';
import { memo } from 'react';
import { formatDuration } from '../model/duration';
import type { Side } from '../model/types';
import { flowStore } from '../store/store';
import { FlagBadges } from './FlagBadges';
import { ACTOR_LABEL, ActorIcon } from './labels';
import { ShapeSvg } from './ShapeSvg';
import { StepTitle } from './StepTitle';
import type { StepFlowNode } from './toFlow';

const HANDLES: Array<[Side, Position]> = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
];

const begin = () => flowStore.getState().begin();
const commit = () => flowStore.getState().commit();

export const StepNode = memo(function StepNode({ id, data, selected }: NodeProps<StepFlowNode>) {
  const { node, critical, dimmed, glowing, editable } = data;
  const className = [
    'fs-step',
    `shape-${node.shape}`,
    node.actor && `actor-${node.actor}`,
    node.color && `tint-${node.color}`,
    selected && 'is-selected',
    critical && 'is-critical',
    dimmed && 'is-dimmed',
    glowing && 'is-glowing',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} style={{ width: node.w, height: node.h }} data-testid={`node-${id}`} title={node.replaces ? `Replaces: ${node.replaces}` : undefined}>
      {editable && <NodeResizer isVisible={selected} minWidth={40} minHeight={32} onResizeStart={begin} onResizeEnd={commit} />}
      <ShapeSvg shape={node.shape} w={node.w} h={node.h} />
      {node.actor && (
        <span className="fs-actor-chip" title={ACTOR_LABEL[node.actor]}>
          <ActorIcon actor={node.actor} />
        </span>
      )}
      <div className="fs-step-body">
        <StepTitle node={node} editable={editable} />
        {node.note && <div className="fs-note">{node.note}</div>}
        {(node.owner || node.durationMin !== null || critical) && (
          <div className="fs-step-meta">
            {node.owner && <span className="fs-owner">{node.owner}</span>}
            {node.durationMin !== null ? (
              <span>
                <Clock size={10} />
                {formatDuration(node.durationMin)}
              </span>
            ) : (
              critical && <span className="fs-no-duration">no duration</span>
            )}
          </div>
        )}
      </div>
      <FlagBadges flags={node.flags} />
      {node.status && <span className={`fs-status status-${node.status}`} title={node.status} />}
      {HANDLES.map(([side, position]) => (
        <Handle key={side} id={side} type="source" position={position} className="fs-handle" isConnectable={editable} />
      ))}
    </div>
  );
});
