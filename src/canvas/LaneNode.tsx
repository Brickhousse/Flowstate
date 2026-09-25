import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { LaneFlowNode } from './toFlow';

export const LaneNode = memo(function LaneNode({ data }: NodeProps<LaneFlowNode>) {
  return (
    <div className={`fs-lane ${data.alt ? 'alt' : ''} dir-${data.direction}`}>
      <span className="fs-lane-label">{data.lane.name}</span>
    </div>
  );
});
