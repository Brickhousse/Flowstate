import type { ReactFlowInstance } from '@xyflow/react';

export const FIT_VIEW = { padding: 0.2, maxZoom: 1 };

export function viewCenter(rf: Pick<ReactFlowInstance, 'screenToFlowPosition'>): { x: number; y: number } {
  const pane = document.querySelector('.fs-canvas-main')?.getBoundingClientRect();
  if (!pane) return { x: 0, y: 0 };
  return rf.screenToFlowPosition({ x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 });
}
