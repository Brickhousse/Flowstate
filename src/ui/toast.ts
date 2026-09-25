import { create } from 'zustand';

interface ToastState {
  message: string | null;
  seq: number;
  show(message: string): void;
}

export const useToast = create<ToastState>()((set, get) => ({
  message: null,
  seq: 0,
  show(message) {
    const seq = get().seq + 1;
    set({ message, seq });
    setTimeout(() => {
      if (get().seq === seq) set({ message: null });
    }, 3500);
  },
}));

export function notify(message: string): void {
  useToast.getState().show(message);
}
