import { ChatPanel } from './chat/ChatPanel';
import { useChatShortcuts } from './chat/useChatShortcuts';
import { useFlow } from './store/store';
import { CanvasArea } from './ui/CanvasArea';
import { Toasts } from './ui/Toasts';
import { TopBar } from './ui/TopBar';

export function App() {
  const chatOpen = useFlow((s) => s.chatOpen);
  useChatShortcuts();
  return (
    <div className="app">
      <main className="workspace">
        <TopBar />
        <CanvasArea />
      </main>
      {chatOpen && <ChatPanel />}
      <Toasts />
    </div>
  );
}
