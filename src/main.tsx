import '@fontsource-variable/inter';
import '@xyflow/react/dist/style.css';
import './ui/theme.css';
import './ui/ui.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { boot } from './boot';
import { applyStoredTheme } from './ui/theme';

applyStoredTheme();
const root = createRoot(document.getElementById('root')!);
root.render(<div className="boot">Loading Flowstate</div>);
boot().then(
  () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  (err: unknown) =>
    root.render(<div className="boot boot-error">Could not open the project: {err instanceof Error ? err.message : String(err)}</div>),
);
