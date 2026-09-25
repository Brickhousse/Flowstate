import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { ProjectFormatError } from '../model/migrate';
import { slug } from './download';
import { readProjectFile } from './exportJson';

describe('readProjectFile', () => {
  it('imports a project under a new id and name', async () => {
    const p = createProject('Claims');
    const imported = await readProjectFile(new File([JSON.stringify(p)], 'claims.json'));
    expect(imported.id).not.toBe(p.id);
    expect(imported.name).toBe('Claims (imported)');
    expect(imported.boards).toEqual(p.boards);
  });

  it('rejects non-JSON and non-projects', async () => {
    await expect(readProjectFile(new File(['nope'], 'x.json'))).rejects.toThrow(ProjectFormatError);
    await expect(readProjectFile(new File(['{"a":1}'], 'x.json'))).rejects.toThrow(ProjectFormatError);
  });
});

describe('slug', () => {
  it('makes file-safe names', () => {
    expect(slug('Claims: Future v1!')).toBe('claims-future-v1');
    expect(slug('***')).toBe('flowstate');
  });
});
