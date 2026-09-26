import { createStore } from 'zustand/vanilla';
import type { Rect } from '../../layout/geometry';
import { flowStore } from '../../store/store';
import type { Guide } from './snap';

export const assistOverlay = createStore<{ guides: Guide[]; ghosts: Rect[] }>()(() => ({ guides: [], ghosts: [] }));

export function clearOverlay(): void {
  assistOverlay.setState({ guides: [], ghosts: [] });
}

export function endResize(): void {
  clearOverlay();
  flowStore.getState().commit();
}
