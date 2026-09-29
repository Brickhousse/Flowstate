import { NotebookText } from 'lucide-react';
import { useContext } from 'react';
import { NOTE_TOGGLE_CLASS, NoteControlsContext } from './noteControls';

export function NoteMarker({ nodeId }: { nodeId: string }) {
  const notes = useContext(NoteControlsContext);
  return (
    // Keeping focus off the button stops the open note closing on blur, which would turn this toggle into a reopen.
    <button
      type="button"
      className={`fs-note-marker nodrag nopan ${NOTE_TOGGLE_CLASS}`}
      title="Open note"
      aria-label="Open note"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        notes.toggle(nodeId);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <NotebookText size={10} strokeWidth={2.2} />
    </button>
  );
}
