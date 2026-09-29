import { useEffect, type RefObject } from 'react';

// toggler: a selector for the button that opens and closes the popup; a press on it is left to its click.
export type DismissOptions = { closeOnBlur?: boolean; toggler?: string };

export function usePopupDismiss(ref: RefObject<HTMLDivElement | null>, onClose: () => void, wheelInside: 'close' | 'scroll', options: DismissOptions = {}): void {
  const { closeOnBlur = true, toggler } = options;
  useEffect(() => {
    const outside = (e: PointerEvent | WheelEvent) => {
      if (!(e.target instanceof Node && ref.current?.contains(e.target))) onClose();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!(toggler && e.target instanceof Element && e.target.closest(toggler))) outside(e);
    };
    // A native colour dialog blurs the window; closing then would unmount the input before its change fires.
    const onBlur = () => {
      const a = document.activeElement;
      if (!(a instanceof HTMLInputElement && a.type === 'color' && ref.current?.contains(a))) onClose();
    };
    const onWheel = wheelInside === 'scroll' ? outside : onClose;
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('wheel', onWheel, true);
    if (closeOnBlur) window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onClose);
    };
  }, [ref, onClose, wheelInside, closeOnBlur, toggler]);
}
