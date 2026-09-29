import { useEffect, type RefObject } from 'react';

// toggler: a selector for the button that opens and closes the popup, whose own click decides.
export type DismissOptions = { closeOnBlur?: boolean; toggler?: string };

export function usePopupDismiss(ref: RefObject<HTMLDivElement | null>, onClose: () => void, wheelInside: 'close' | 'scroll', options: DismissOptions = {}): void {
  const { closeOnBlur = true, toggler } = options;
  useEffect(() => {
    const outside = (e: PointerEvent | WheelEvent) => {
      const t = e.target;
      if (t instanceof Node && ref.current?.contains(t)) return;
      if (toggler && t instanceof Element && t.closest(toggler)) return;
      onClose();
    };
    // A native colour dialog blurs the window; closing then would unmount the input before its change fires.
    const onBlur = () => {
      const a = document.activeElement;
      if (!(a instanceof HTMLInputElement && a.type === 'color' && ref.current?.contains(a))) onClose();
    };
    const onWheel = wheelInside === 'scroll' ? outside : onClose;
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('wheel', onWheel, true);
    if (closeOnBlur) window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onClose);
    };
  }, [ref, onClose, wheelInside, closeOnBlur, toggler]);
}
