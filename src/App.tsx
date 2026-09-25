import { CanvasArea } from './ui/CanvasArea';
import { Toasts } from './ui/Toasts';
import { TopBar } from './ui/TopBar';

export function App() {
  return (
    <div className="app">
      <main className="workspace">
        <TopBar />
        <CanvasArea />
      </main>
      <Toasts />
    </div>
  );
}
