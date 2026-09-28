import { EdgeLabelRenderer } from '@xyflow/react';
import { useContext } from 'react';
import type { BoardEdge } from '../model/types';
import { useFlow } from '../store/store';
import { EdgeOptions } from './EdgeOptions';
import { PickPanelOpen } from './pick/pickPanelOpen';

export function EdgeToolbar({ edge, x, y }: { edge: BoardEdge; x: number; y: number }) {
  const selectedAlone = useFlow((s) => s.edgeSelection.length === 1 && s.edgeSelection[0] === edge.id && s.selection.length === 0);
  const inPanel = useContext(PickPanelOpen);
  if (!selectedAlone || inPanel) return null;
  return (
    <EdgeLabelRenderer>
      <div className="fs-toolbar fs-edge-toolbar nodrag nopan" style={{ transform: `translate(-50%, calc(-100% - 20px)) translate(${x}px, ${y}px)` }}>
        <EdgeOptions edge={edge} />
      </div>
    </EdgeLabelRenderer>
  );
}
