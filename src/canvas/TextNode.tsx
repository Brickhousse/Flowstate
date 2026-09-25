import { NodeResizer, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { flowStore } from '../store/store';
import { StepTitle } from './StepTitle';
import type { TextFlowNode } from './toFlow';

export const TextNode = memo(function TextNode({ id, data, selected }: NodeProps<TextFlowNode>) {
  const { node, editable, glowing } = data;
  return (
    <div className={`fs-textnode ${selected ? 'is-selected' : ''} ${glowing ? 'is-glowing' : ''}`} style={{ width: node.w, minHeight: node.h }} data-testid={`node-${id}`}>
      {editable && (
        <NodeResizer isVisible={selected} minWidth={60} minHeight={24} onResizeStart={() => flowStore.getState().begin()} onResizeEnd={() => flowStore.getState().commit()} />
      )}
      <StepTitle node={node} editable={editable} className="fs-text" placeholder="Text" />
    </div>
  );
});
