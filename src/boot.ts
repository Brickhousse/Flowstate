import type { StoreApi } from 'zustand/vanilla';
import { fetchProject, listProjects, saveProject } from './api/projects';
import { createProject } from './model/factory';
import type { Project } from './model/types';
import { startAutosave, type AutosaveHandle } from './store/autosave';
import { commitDrafts } from './store/drafts';
import { flowStore, type FlowStore } from './store/store';
import { notify } from './ui/toast';

declare global {
  interface Window {
    __flowstate?: StoreApi<FlowStore>;
  }
}

let autosave: AutosaveHandle | null = null;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function newestOrNew(exclude: string | null): Promise<Project> {
  for (const meta of await listProjects()) {
    if (meta.id === exclude || meta.name.endsWith('(unreadable)')) continue;
    try {
      return await fetchProject(meta.id);
    } catch (err) {
      notify(`Skipped "${meta.name}": ${messageOf(err)}`);
    }
  }
  const fresh = createProject();
  await saveProject(fresh);
  return fresh;
}

async function wantedOrNewest(wanted: string | null): Promise<Project> {
  if (!wanted) return newestOrNew(null);
  try {
    return await fetchProject(wanted);
  } catch (err) {
    const fallback = await newestOrNew(wanted);
    notify(`${messageOf(err)} Opened another project instead.`);
    return fallback;
  }
}

function remember(project: Project): void {
  history.replaceState(null, '', `?project=${encodeURIComponent(project.id)}`);
}

export async function boot(): Promise<void> {
  const wanted = new URLSearchParams(location.search).get('project');
  const project = await wantedOrNewest(wanted);
  flowStore.getState().loadProject(project);
  remember(project);
  autosave = startAutosave(flowStore, saveProject);
  window.addEventListener('beforeunload', (e) => {
    commitDrafts();
    const status = flowStore.getState().saveStatus;
    if (status !== 'saving' && status !== 'error') return;
    autosave?.flush().catch(() => {});
    e.preventDefault();
  });
  if (import.meta.env.DEV) window.__flowstate = flowStore;
}

export async function openProject(project: Project | string): Promise<void> {
  await autosave?.flush();
  const next = typeof project === 'string' ? await fetchProject(project) : project;
  flowStore.getState().loadProject(next);
  remember(next);
}

// Recovery after a render crash: a full reload discards whatever in-memory state caused it.
export async function openAnotherProject(): Promise<void> {
  await autosave?.flush().catch(() => {});
  const next = await newestOrNew(flowStore.getState().project.id);
  location.assign(`?project=${encodeURIComponent(next.id)}`);
}
