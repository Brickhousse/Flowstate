import { useEffect, useRef, type FocusEvent, type KeyboardEvent } from 'react';
import { noteParagraphs } from '../../model/note';
import type { XY } from '../../model/types';
import { Popup } from '../menu/Popup';
import { NOTE_TOGGLE_CLASS } from './noteControls';

type Props = { at: XY; note: string; editable: boolean; onEdit: (text: string) => void; onClose: () => void };

const DISMISS = { closeOnBlur: false, toggler: `.${NOTE_TOGGLE_CLASS}` };

export function NotePanel({ at, note, editable, onEdit, onClose }: Props) {
  return (
    <Popup at={at} onClose={onClose} wheelInside="scroll" dismiss={DISMISS} className="fs-note-panel">
      {/* Popup blocks the browser menu for its menus; note text needs it for spelling and paste. */}
      <div onContextMenu={(e) => e.stopPropagation()}>
        {editable ? <NoteEditor note={note} onEdit={onEdit} onClose={onClose} /> : <NoteReader note={note} onClose={onClose} />}
      </div>
    </Popup>
  );
}

// Focus moving elsewhere would hand the next key to the board. Switching apps blurs the window, not the panel.
function closeWhenFocusLeaves(onClose: () => void) {
  return (e: FocusEvent<HTMLElement>) => {
    const to = e.relatedTarget;
    if (to instanceof Node ? !e.currentTarget.contains(to) : document.hasFocus()) onClose();
  };
}

// Every key stays in the panel so none reaches the board's shortcuts. why (the close keys): ADR-0019
function handleNoteKeys(onClose: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    e.stopPropagation();
    if (e.nativeEvent.isComposing) return;
    const closes = e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || (e.key === 'Tab' && !e.shiftKey) || (e.key === 'F2' && e.shiftKey);
    if (!closes) return;
    e.preventDefault();
    onClose();
  };
}

function fitHeight(el: HTMLTextAreaElement): void {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
}

function NoteEditor({ note, onEdit, onClose }: { note: string; onEdit: (text: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    fitHeight(el);
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    // A click on the frame must not blur the text box, or board shortcuts such as Delete would act on the step.
    <div
      className="fs-note-edit"
      onBlur={closeWhenFocusLeaves(onClose)}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <textarea
        ref={ref}
        className="fs-note-input"
        aria-label="Note"
        placeholder="What would you say about this step? A blank line starts a new paragraph."
        defaultValue={note}
        onChange={(e) => {
          fitHeight(e.currentTarget);
          onEdit(e.currentTarget.value);
        }}
        onKeyDown={handleNoteKeys(onClose)}
      />
    </div>
  );
}

function NoteReader({ note, onClose }: { note: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div
      ref={ref}
      className="fs-note-read"
      role="region"
      aria-label="Note"
      tabIndex={-1}
      onBlur={closeWhenFocusLeaves(onClose)}
      onKeyDown={handleNoteKeys(onClose)}
    >
      {noteParagraphs(note).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
