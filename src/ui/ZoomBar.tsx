import { useReactFlow, useViewport } from '@xyflow/react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { FIT_VIEW } from '../canvas/viewport';

export function ZoomBar() {
  const rf = useReactFlow();
  const { zoom } = useViewport();
  return (
    <div className="zoombar">
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => rf.zoomOut({ duration: 150 })}>
        <Minus size={14} />
      </button>
      <button type="button" className="zoom-pct" aria-label="Reset zoom to 100%" title="Reset zoom to 100%" onClick={() => rf.zoomTo(1, { duration: 150 })}>
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => rf.zoomIn({ duration: 150 })}>
        <Plus size={14} />
      </button>
      <button type="button" aria-label="Fit board" title="Fit board (Shift+1)" onClick={() => rf.fitView({ ...FIT_VIEW, duration: 300 })}>
        <Maximize size={14} />
      </button>
    </div>
  );
}
