import { createStore } from 'zustand/vanilla';
import type { Rect } from '../../layout/geometry';
import type { Guide } from './snap';

export const assistOverlay = createStore<{ guides: Guide[]; ghosts: Rect[] }>()(() => ({ guides: [], ghosts: [] }));

export function clearOverlay(): void {
  assistOverlay.setState({ guides: [], ghosts: [] });
}
