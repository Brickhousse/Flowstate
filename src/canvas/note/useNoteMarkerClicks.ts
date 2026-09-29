import { useStoreApi } from '@xyflow/react';
import { useEffect } from 'react';
import { NOTE_MARKER_CLASS } from './noteControls';

// One capture listener per canvas instead of handlers per marker; capture runs before React Flow's node handlers.
export function useNoteMarkerClicks(toggle: (nodeId: string) => void): void {
  const rfStore = useStoreApi();
  useEffect(() => {
    const markerStep = (e: MouseEvent): string | null => {
      const marker = e.target instanceof Element ? e.target.closest(`.${NOTE_MARKER_CLASS}`) : null;
      if (!marker || !rfStore.getState().domNode?.contains(marker)) return null;
      return marker.closest('.react-flow__node')?.getAttribute('data-id') ?? null;
    };
    const onClick = (e: MouseEvent) => {
      const id = markerStep(e);
      if (!id) return;
      e.stopPropagation();
      toggle(id);
    };
    const onDoubleClick = (e: MouseEvent) => {
      if (markerStep(e)) e.stopPropagation();
    };
    // Keeping focus where it is stops the open note closing on blur, which would turn a toggle into a reopen.
    const onMouseDown = (e: MouseEvent) => {
      if (markerStep(e)) e.preventDefault();
    };
    window.addEventListener('click', onClick, true);
    window.addEventListener('dblclick', onDoubleClick, true);
    window.addEventListener('mousedown', onMouseDown, true);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('dblclick', onDoubleClick, true);
      window.removeEventListener('mousedown', onMouseDown, true);
    };
  }, [rfStore, toggle]);
}
