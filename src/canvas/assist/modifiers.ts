export const mods = { alt: false, shift: false, ctrl: false };
let pointerDown = false;
let swallowAltUp = false;

function read(e: KeyboardEvent | PointerEvent): void {
  mods.alt = e.altKey;
  mods.shift = e.shiftKey;
  mods.ctrl = e.ctrlKey || e.metaKey;
}

const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const;

export function watchModifiers(onChange: () => void): () => void {
  const onPointer = (e: PointerEvent) => {
    read(e);
    if (e.type === 'pointerdown') pointerDown = true;
    else if (e.type === 'pointerup' || e.type === 'pointercancel') pointerDown = false;
  };
  const onKey = (e: KeyboardEvent) => {
    read(e);
    if (e.key === 'Alt') {
      // Windows focuses the browser menu when a lone Alt is released, which would swallow the next shortcut.
      if (e.type === 'keydown' && pointerDown) swallowAltUp = true;
      if (swallowAltUp) e.preventDefault();
      if (e.type === 'keyup') swallowAltUp = false;
    }
    onChange();
  };
  for (const t of POINTER_EVENTS) window.addEventListener(t, onPointer, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  return () => {
    for (const t of POINTER_EVENTS) window.removeEventListener(t, onPointer, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
  };
}
