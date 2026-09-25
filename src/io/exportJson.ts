import { newId } from '../model/factory';
import { migrateProject, ProjectFormatError } from '../model/migrate';
import type { Project } from '../model/types';
import { download, slug } from './download';

export function exportProjectJson(project: Project): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
  download(url, `${slug(project.name)}.flowstate.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readProjectFile(file: File): Promise<Project> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new ProjectFormatError('That file is not valid JSON.');
  }
  const project = migrateProject(raw);
  return { ...project, id: newId(), name: `${project.name} (imported)` };
}
