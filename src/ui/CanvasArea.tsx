import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from '../canvas/Canvas';
import { useFlow } from '../store/store';

export function CanvasArea() {
  const active = useFlow((s) => s.activeBoardId);
  return (
    <div className="canvas-area">
      <div className="canvas-pane fs-canvas-main">
        <ReactFlowProvider key={active}>
          <Canvas boardId={active} editable />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
