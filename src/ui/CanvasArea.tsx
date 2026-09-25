import { ReactFlowProvider } from '@xyflow/react';
import { Eye, X } from 'lucide-react';
import { Canvas } from '../canvas/Canvas';
import { flowStore, useFlow } from '../store/store';
import { Palette } from './Palette';
import { ZoomBar } from './ZoomBar';

export function CanvasArea() {
  const active = useFlow((s) => s.activeBoardId);
  const split = useFlow((s) => s.splitBoardId);
  const splitName = useFlow((s) => s.project.boards.find((b) => b.id === s.splitBoardId)?.name);
  return (
    <div className="canvas-area">
      <div className="canvas-pane fs-canvas-main">
        <ReactFlowProvider key={active}>
          <Canvas boardId={active} editable />
          <Palette />
          <ZoomBar />
        </ReactFlowProvider>
      </div>
      {split && (
        <div className="canvas-pane is-reference">
          <div className="reference-title">
            <Eye size={13} /> {splitName} <span>reference</span>
            <button type="button" aria-label="Close reference" title="Close reference" onClick={() => flowStore.getState().setSplitBoard(null)}>
              <X size={13} />
            </button>
          </div>
          <ReactFlowProvider key={split}>
            <Canvas boardId={split} editable={false} />
          </ReactFlowProvider>
        </div>
      )}
    </div>
  );
}
