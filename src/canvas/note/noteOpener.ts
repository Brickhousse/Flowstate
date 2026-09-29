import { createContext } from 'react';

export const NoteOpener = createContext<(nodeId: string) => void>(() => {});
