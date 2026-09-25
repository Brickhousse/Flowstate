import { SCHEMA_VERSION, type Project } from './types';

export class ProjectFormatError extends Error {}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Record<number, Migration> = {};

export function migrateProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') throw new ProjectFormatError('Not a Flowstate project file.');
  let data = raw as Record<string, unknown>;
  if (typeof data.schemaVersion !== 'number') throw new ProjectFormatError('Not a Flowstate project file.');
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new ProjectFormatError(`This project was saved by a newer Flowstate (schema ${data.schemaVersion}).`);
  }
  while ((data.schemaVersion as number) < SCHEMA_VERSION) {
    const version = data.schemaVersion as number;
    const step = MIGRATIONS[version];
    if (!step) throw new ProjectFormatError(`No migration from schema ${version}.`);
    data = { ...step(data), schemaVersion: version + 1 };
  }
  if (typeof data.id !== 'string' || typeof data.name !== 'string' || !Array.isArray(data.boards) || data.boards.length === 0) {
    throw new ProjectFormatError('Project file is missing required fields.');
  }
  return data as unknown as Project;
}
