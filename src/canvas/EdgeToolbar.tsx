import { EdgeLabelRenderer } from '@xyflow/react';
import type { BoardEdge } from '../model/types';
import { useFlow } from '../store/store';
import { EdgeOptions } from './EdgeOptions';

export function EdgeToolbar({ edge, x, y }: { edge: BoardEdge; x: number; y: number }) {
  const visible = useFlow((s) => s.edgeSelection.length === 1 && s.edgeSelection[0] === edge.id && s.selection.length === 0);
  if (!visible) return null;
  return (
    <EdgeLabelRenderer>
      <div className="fs-toolbar fs-edge-toolbar nodrag nopan" style={{ transform: `translate(-50%, calc(-100% - 20px)) translate(${x}px, ${y}px)` }}>
        <EdgeOptions edge={edge} />
      </div>
    </EdgeLabelRenderer>
  );
}
