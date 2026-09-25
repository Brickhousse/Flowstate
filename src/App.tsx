import { CanvasArea } from './ui/CanvasArea';
import { Toasts } from './ui/Toasts';

export function App() {
  return (
    <div className="app">
      <main className="workspace">
        <CanvasArea />
      </main>
      <Toasts />
    </div>
  );
}
