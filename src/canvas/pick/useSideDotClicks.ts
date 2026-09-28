import { useStoreApi } from '@xyflow/react';
import { useEffect } from 'react';
import type { XY } from '../../model/types';

// onDotClick returns true when it consumed the click, so React Flow never sees it.
export function useSideDotClicks(editable: boolean, onDotClick: (at: XY, detail: number) => boolean): void {
  const rfStore = useStoreApi();
  useEffect(() => {
    if (!editable) return;
    let down: XY | null = null;
    const onDot = (t: EventTarget | null) => t instanceof Element && !!t.closest('.react-flow__handle') && !!rfStore.getState().domNode?.contains(t);
    const onDown = (e: PointerEvent) => {
      down = e.button === 0 && onDot(e.target) ? { x: e.clientX, y: e.clientY } : null;
    };
    // why: ADR-0016
    const onClick = (e: MouseEvent) => {
      const start = down;
      down = null;
      if (!start || e.shiftKey || !onDot(e.target)) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > rfStore.getState().connectionDragThreshold) return;
      if (onDotClick({ x: e.clientX, y: e.clientY }, e.detail)) e.stopPropagation();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('click', onClick, true);
    };
  }, [editable, rfStore, onDotClick]);
}
