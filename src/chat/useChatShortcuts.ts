import { useEffect } from 'react';
import { flowStore } from '../store/store';
import { focusComposer } from './Composer';

export function useChatShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const st = flowStore.getState();
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        st.setChatOpen(true);
        requestAnimationFrame(focusComposer);
      } else if (e.key === '/') {
        e.preventDefault();
        st.setChatOpen(!st.chatOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
