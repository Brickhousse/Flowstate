import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { isTyping } from '../useKeyboard';

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function focusStops(root: HTMLElement | null): HTMLElement[] {
  return root ? [...root.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];
}

type Props = { ref: RefObject<HTMLDivElement | null>; list: RefObject<HTMLDivElement | null>; onClose: () => void; children: ReactNode };

// Keys here act as they do anywhere else in the app; only Escape and Tab past either end belong to the menu.
export function MenuFooter({ ref, list, onClose, children }: Props) {
  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !isTyping(e.target)) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const stops = focusStops(ref.current);
    if (e.target !== (e.shiftKey ? stops[0] : stops.at(-1))) return;
    e.preventDefault();
    list.current?.focus();
  };
  return (
    <div ref={ref} className="fs-menu-footer" onKeyDownCapture={onKeyDownCapture}>
      {children}
    </div>
  );
}
