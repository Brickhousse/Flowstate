import { ArrowDownUp, ArrowRightLeft, Monitor, Moon, Sun, WandSparkles } from 'lucide-react';
import { useState } from 'react';
import { tidyBoard } from '../layout/tidyBoard';
import { setDirection } from '../ops/board';
import { flowStore, selectActiveBoard, useFlow } from '../store/store';
import { BoardTabs } from './BoardTabs';
import { CriticalPathButton } from './CriticalPathButton';
import { FlagsButton } from './FlagsButton';
import { errorText, ProjectMenu } from './ProjectMenu';
import { applyTheme, storedTheme, type ThemeChoice } from './theme';
import { notify } from './toast';

const THEME_NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const SAVE_TEXT = { idle: '', saving: 'Saving', saved: 'Saved', error: 'Save failed, retrying' } as const;

async function runTidy(boardId: string): Promise<void> {
  try {
    await tidyBoard(flowStore, boardId);
  } catch (err) {
    notify(`Tidy failed: ${errorText(err)}`);
  }
}

async function flipDirection(boardId: string): Promise<void> {
  const st = flowStore.getState();
  st.begin();
  try {
    st.changeBoard((b) => setDirection(b, b.direction === 'LR' ? 'TB' : 'LR'), boardId);
    await runTidy(boardId);
  } finally {
    st.commit();
  }
}

export function TopBar() {
  const board = useFlow(selectActiveBoard);
  const saveStatus = useFlow((s) => s.saveStatus);
  const [theme, setTheme] = useState(storedTheme);
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const lr = board.direction === 'LR';
  return (
    <header className="topbar">
      <ProjectMenu />
      <BoardTabs />
      <div className="topbar-spacer" />
      <FlagsButton />
      <CriticalPathButton />
      <button type="button" className="topbar-btn" title="Tidy layout (L)" onClick={() => runTidy(board.id)}>
        <WandSparkles size={14} />
        <span>Tidy</span>
      </button>
      <button
        type="button"
        className="topbar-btn icon"
        aria-label={lr ? 'Flow left to right. Switch to top to bottom.' : 'Flow top to bottom. Switch to left to right.'}
        title={lr ? 'Flow left to right. Click for top to bottom.' : 'Flow top to bottom. Click for left to right.'}
        onClick={() => flipDirection(board.id)}
      >
        {lr ? <ArrowRightLeft size={14} /> : <ArrowDownUp size={14} />}
      </button>
      <span className={`save-status is-${saveStatus}`} aria-live="polite">
        {SAVE_TEXT[saveStatus]}
      </span>
      <button
        type="button"
        className="topbar-btn icon"
        aria-label={`Theme: ${theme}`}
        title={`Theme: ${theme}`}
        onClick={() => {
          const next = THEME_NEXT[theme];
          applyTheme(next);
          setTheme(next);
        }}
      >
        <ThemeIcon size={14} />
      </button>
    </header>
  );
}
