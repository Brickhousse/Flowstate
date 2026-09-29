import { createContext } from 'react';
import { createStore } from 'zustand/vanilla';
import type { NoteSession } from './noteSession';

export const NOTE_TOGGLE_CLASS = 'fs-note-toggle';

export type NoteControls = Pick<NoteSession, 'open' | 'toggle' | 'state'>;

const inert: NoteControls = { open() {}, toggle() {}, state: createStore<{ nodeId: string | null }>()(() => ({ nodeId: null })) };

export const NoteControlsContext = createContext<NoteControls>(inert);
