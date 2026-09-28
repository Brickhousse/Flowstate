import { useEffect, type RefObject } from 'react';

export function usePopupDismiss(ref: RefObject<HTMLDivElement | null>, onClose: () => void, wheelInside: 'close' | 'scroll'): void {
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
  }, [ref, onClose, wheelInside]);
}
