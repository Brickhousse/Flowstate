import { mkdtemp, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/model/factory';
import { createFileStorage, StorageError } from './storage';

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'flowstate-'));
}

describe('file storage', () => {
  it('saves, lists newest first, loads and removes', async () => {
    const dir = await tempDir();
    const storage = createFileStorage(dir);
    const a = createProject('A');
    const b = createProject('B');
    await storage.save(a);
    await new Promise((r) => setTimeout(r, 20));
    await storage.save(b);
    expect((await storage.list()).map((m) => m.name)).toEqual(['B', 'A']);
    expect(await storage.load(a.id)).toEqual(a);
    await storage.remove(a.id);
    expect((await storage.list()).map((m) => m.id)).toEqual([b.id]);
    expect((await readdir(dir)).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('rejects bad ids, missing projects and invalid bodies', async () => {
    const storage = createFileStorage(await tempDir());
    await expect(storage.load('../etc/passwd')).rejects.toMatchObject({ status: 400 });
    await expect(storage.load('nope')).rejects.toMatchObject({ status: 404 });
    await expect(storage.save({ hello: 'world' })).rejects.toMatchObject({ status: 400 });
  });

  it('reports a corrupt file without touching it and still lists it', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'broken.json'), '{ not json', 'utf8');
    const storage = createFileStorage(dir);
    await expect(storage.load('broken')).rejects.toMatchObject({ status: 422 });
    expect((await storage.list()).map((m) => m.name)).toEqual(['broken (unreadable)']);
    expect(await readFile(join(dir, 'broken.json'), 'utf8')).toBe('{ not json');
  });

  it('retries a locked rename on Windows-style EPERM', async () => {
    const dir = await tempDir();
    let failures = 2;
    const flaky = vi.fn(async (from: string, to: string) => {
      if (failures-- > 0) throw Object.assign(new Error('locked'), { code: 'EPERM' });
      return rename(from, to);
    });
    const storage = createFileStorage(dir, { rename: flaky });
    const p = createProject('Locked');
    await storage.save(p);
    expect(flaky).toHaveBeenCalledTimes(3);
    expect(await storage.load(p.id)).toEqual(p);
  });

  it('gives up after repeated lock failures and cleans the temp file', async () => {
    const dir = await tempDir();
    const locked = vi.fn(async () => {
      throw Object.assign(new Error('locked'), { code: 'EBUSY' });
    });
    const storage = createFileStorage(dir, { rename: locked });
    await expect(storage.save(createProject())).rejects.toThrow('locked');
    expect(await readdir(dir)).toEqual([]);
  });

  it('exposes StorageError', () => {
    expect(new StorageError('x', 404).status).toBe(404);
  });
});
