import type { StoreApi } from 'zustand/vanilla';
import { fetchProject, listProjects, saveProject } from './api/projects';
import { createProject } from './model/factory';
import type { Project } from './model/types';
import { startAutosave, type AutosaveHandle } from './store/autosave';
import { flowStore, type FlowStore } from './store/store';
import { notify } from './ui/toast';

declare global {
  interface Window {
    __flowstate?: StoreApi<FlowStore>;
  }
}

let autosave: AutosaveHandle | null = null;

async function newestOrNew(): Promise<Project> {
  const readable = (await listProjects()).find((m) => !m.name.endsWith('(unreadable)'));
  if (readable) return fetchProject(readable.id);
  const fresh = createProject();
  await saveProject(fresh);
  return fresh;
}

async function wantedOrNewest(wanted: string | null): Promise<Project> {
  if (!wanted) return newestOrNew();
  try {
    return await fetchProject(wanted);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const fallback = await newestOrNew();
    notify(`${reason} Opened another project instead.`);
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
