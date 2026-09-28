import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type MenuAnchor = { x: number; y: number };

type Props = { at: MenuAnchor; onClose: () => void; wheelInside: 'close' | 'scroll'; className?: string; children: ReactNode };

export function Popup({ at, onClose, wheelInside, className, children }: Props) {
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

  useEffect(() => {
    const outside = (e: PointerEvent | WheelEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // A native colour dialog blurs the window; closing then would unmount the input before its change fires.
    const onBlur = () => {
      const a = document.activeElement;
      if (!(a instanceof HTMLInputElement && a.type === 'color' && ref.current?.contains(a))) onClose();
    };
    const onWheel = wheelInside === 'scroll' ? outside : onClose;
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('wheel', onWheel, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, wheelInside]);

  return createPortal(
    <div ref={ref} className={className ? `fs-context-menu ${className}` : 'fs-context-menu'} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </div>,
    document.body,
  );
}
