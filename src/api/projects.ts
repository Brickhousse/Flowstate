import { migrateProject } from '../model/migrate';
import type { Project, ProjectMeta } from '../model/types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status}).`);
  return body as T;
}

export function listProjects(): Promise<ProjectMeta[]> {
  return request<ProjectMeta[]>('/api/projects');
}

export async function fetchProject(id: string): Promise<Project> {
  return migrateProject(await request<unknown>(`/api/projects/${encodeURIComponent(id)}`));
}

export async function saveProject(project: Project): Promise<void> {
  await request(`/api/projects/${encodeURIComponent(project.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(project),
  });
}

export async function deleteProject(id: string): Promise<void> {
  await request(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
