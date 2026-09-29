import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { XY } from '../../model/types';
import { usePopupDismiss, type DismissOptions } from './usePopupDismiss';

type Props = { at: XY; onClose: () => void; wheelInside: 'close' | 'scroll'; dismiss?: DismissOptions; className?: string; children: ReactNode };

export function Popup({ at, onClose, wheelInside, dismiss, className, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const clamp = () => {
      const r = el.getBoundingClientRect();
      const x = Math.max(4, Math.min(at.x, window.innerWidth - r.width - 4));
      const y = Math.max(4, Math.min(at.y, window.innerHeight - r.height - 4));
      setPos((p) => (p.x === x && p.y === y ? p : { x, y }));
    };
    clamp();
    const resized = new ResizeObserver(clamp);
    resized.observe(el);
    return () => resized.disconnect();
  }, [at]);

  usePopupDismiss(ref, onClose, wheelInside, dismiss);

  return createPortal(
    <div ref={ref} className={className ? `fs-context-menu ${className}` : 'fs-context-menu'} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </div>,
    document.body,
  );
}
