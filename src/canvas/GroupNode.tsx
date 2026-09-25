import { NodeResizer, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { flowStore } from '../store/store';
import { StepTitle } from './StepTitle';
import type { GroupFlowNode } from './toFlow';

export const GroupNode = memo(function GroupNode({ id, data, selected }: NodeProps<GroupFlowNode>) {
  const { node, editable } = data;
  return (
    <div className={`fs-group ${selected ? 'is-selected' : ''}`} style={{ width: node.w, height: node.h }} data-testid={`node-${id}`}>
      {editable && (
        <NodeResizer isVisible={selected} minWidth={160} minHeight={100} onResizeStart={() => flowStore.getState().begin()} onResizeEnd={() => flowStore.getState().commit()} />
      )}
      <div className="fs-group-label">
        <StepTitle node={node} editable={editable} className="fs-group-title" placeholder="Group" />
      </div>
    </div>
  );
});
