import { describe, expect, it } from 'vitest';
import { createProject } from './factory';
import { migrateProject, ProjectFormatError } from './migrate';

describe('migrateProject', () => {
  it('accepts a current project unchanged', () => {
    const p = createProject();
    expect(migrateProject(structuredClone(p))).toEqual(p);
  });

  it.each([null, 42, 'x', {}, { schemaVersion: 1 }, { schemaVersion: 1, id: 'a', boards: 'no' }])('rejects %j', (raw) => {
    expect(() => migrateProject(raw)).toThrow(ProjectFormatError);
  });

  it('rejects projects from a newer schema', () => {
    const p = { ...createProject(), schemaVersion: 99 };
    expect(() => migrateProject(p)).toThrow(/newer Flowstate/);
  });
});
