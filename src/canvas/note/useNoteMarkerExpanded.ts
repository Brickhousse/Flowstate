import { useStoreApi } from '@xyflow/react';
import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { NOTE_MARKER_CLASS } from './noteControls';

// Written on the DOM so no box subscribes to the session: a noted board draws a marker on most steps.
export function useNoteMarkerExpanded(state: StoreApi<{ nodeId: string | null }>): void {
  const rfStore = useStoreApi();
  useEffect(() => {
    const markerOf = (id: string | null) =>
      id ? rfStore.getState().domNode?.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"] .${NOTE_MARKER_CLASS}`) : null;
    return state.subscribe((s, prev) => {
      if (s.nodeId === prev.nodeId) return;
      markerOf(prev.nodeId)?.setAttribute('aria-expanded', 'false');
      markerOf(s.nodeId)?.setAttribute('aria-expanded', 'true');
    });
  }, [rfStore, state]);
}
