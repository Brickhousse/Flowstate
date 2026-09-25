import type { StoreApi } from 'zustand/vanilla';
import type { Project } from '../model/types';
import type { FlowStore } from './store';

export interface AutosaveHandle {
  stop(): void;
  flush(): Promise<void>;
}

export function startAutosave(store: StoreApi<FlowStore>, save: (p: Project) => Promise<unknown>, delayMs = 500, retryMs = 3000): AutosaveHandle {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: Promise<void> | null = null;
  let stopped = false;
  let failing = false;
  let saved = store.getState().project;

  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  // Saves run strictly one after another, so an older project can never land on disk after a newer one.
  const start = (): Promise<void> => {
    current = (current ?? Promise.resolve()).then(run);
    return current;
  };

  const schedule = (ms: number) => {
    if (stopped) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = undefined;
      start();
    }, ms);
  };

  async function run(): Promise<void> {
    if (stopped) return;
    clearTimer();
    const project = store.getState().project;
    if (project === saved) return;
    if (!failing) store.getState().setSaveStatus('saving');
    try {
      await save(project);
    } catch {
      if (stopped) return;
      failing = true;
      if (store.getState().project.id === project.id) store.getState().setSaveStatus('error');
      schedule(retryMs);
      return;
    }
    failing = false;
    if (stopped) return;
    if (store.getState().project.id !== project.id) return;
    saved = project;
    if (store.getState().project === saved) store.getState().setSaveStatus('saved');
    else schedule(delayMs);
  }

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.project === prev.project) return;
    if (state.project.id !== prev.project.id) {
      saved = state.project;
      clearTimer();
      return;
    }
    if (state.saveStatus !== 'error' && state.saveStatus !== 'saving') store.getState().setSaveStatus('saving');
    schedule(delayMs);
  });

  return {
    stop() {
      stopped = true;
      unsubscribe();
      clearTimer();
    },
    async flush() {
      clearTimer();
      await start();
      if (store.getState().saveStatus === 'error') throw new Error('Could not save the current project.');
    },
  };
}
