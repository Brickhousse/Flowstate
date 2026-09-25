import type { StoreApi } from 'zustand/vanilla';
import type { Project } from '../model/types';
import type { FlowStore } from './store';

export interface AutosaveHandle {
  stop(): void;
  flush(): Promise<void>;
}

export function startAutosave(store: StoreApi<FlowStore>, save: (p: Project) => Promise<unknown>, delayMs = 500, retryMs = 3000): AutosaveHandle {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving = false;
  let inflight: Promise<void> = Promise.resolve();
  let saved = store.getState().project;

  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  };

  async function run() {
    timer = undefined;
    const project = store.getState().project;
    if (project === saved) return;
    if (saving) return schedule(delayMs);
    saving = true;
    store.getState().setSaveStatus('saving');
    try {
      const pending = save(project);
      inflight = pending.then(
        () => undefined,
        () => undefined,
      );
      await pending;
      saved = project;
      store.getState().setSaveStatus(store.getState().project === saved ? 'saved' : 'saving');
    } catch {
      store.getState().setSaveStatus('error');
      schedule(retryMs);
      return;
    } finally {
      saving = false;
    }
    if (store.getState().project !== saved && !timer) schedule(delayMs);
  }

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.project === prev.project) return;
    if (state.project.id !== prev.project.id) {
      saved = state.project;
      clearTimeout(timer);
      return;
    }
    if (state.saveStatus !== 'error' && state.saveStatus !== 'saving') store.getState().setSaveStatus('saving');
    schedule(delayMs);
  });

  return {
    stop() {
      unsubscribe();
      clearTimeout(timer);
    },
    async flush() {
      clearTimeout(timer);
      timer = undefined;
      await inflight;
      await run();
      if (store.getState().saveStatus === 'error') throw new Error('Could not save the current project.');
    },
  };
}
