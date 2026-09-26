import { NodeResizer, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { flowStore } from '../store/store';
import { endResize } from './assist/overlay';
import { RESIZE_MIN } from './assist/snap';
import { StepTitle } from './StepTitle';
import type { TextFlowNode } from './toFlow';

export const TextNode = memo(function TextNode({ id, data, selected }: NodeProps<TextFlowNode>) {
  const { node, editable, glowing } = data;
  return (
    <div className={`fs-textnode ${selected ? 'is-selected' : ''} ${glowing ? 'is-glowing' : ''}`} style={{ width: node.w, minHeight: node.h }} data-testid={`node-${id}`}>
      {editable && (
        <NodeResizer isVisible={selected} minWidth={RESIZE_MIN.text.w} minHeight={RESIZE_MIN.text.h} onResizeStart={() => flowStore.getState().begin()} onResizeEnd={endResize} />
      )}
      <StepTitle node={node} editable={editable} className="fs-text" placeholder="Text" />
    </div>
  );
});
