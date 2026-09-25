import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject } from '../src/model/factory';
import { createApp } from './app';
import { createFileStorage } from './storage';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'flowstate-app-'));
  return { dir, app: createApp({ storage: createFileStorage(dir) }) };
}

const put = (body: unknown) => ({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('projects API', () => {
  it('answers the health check', async () => {
    const { app } = await setup();
    expect(await (await app.request('/api/health')).json()).toEqual({ ok: true });
  });

  it('round-trips a project', async () => {
    const { app } = await setup();
    const p = createProject('Claims');
    expect((await app.request(`/api/projects/${p.id}`, put(p))).status).toBe(200);
    expect(await (await app.request(`/api/projects/${p.id}`)).json()).toEqual(p);
    const list = await (await app.request('/api/projects')).json();
    expect(list).toMatchObject([{ id: p.id, name: 'Claims' }]);
    expect((await app.request(`/api/projects/${p.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await app.request(`/api/projects/${p.id}`)).status).toBe(404);
  });

  it('rejects mismatched ids, bad JSON and bad ids', async () => {
    const { app } = await setup();
    const p = createProject();
    const mismatch = await app.request('/api/projects/other', put(p));
    expect(mismatch.status).toBe(400);
    expect(await mismatch.json()).toEqual({ error: 'Project id does not match the URL.' });
    const bad = await app.request(`/api/projects/${p.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{' });
    expect(bad.status).toBe(400);
    expect((await app.request('/api/projects/a.b')).status).toBe(400);
  });

  it('returns 422 for a corrupt file', async () => {
    const { app, dir } = await setup();
    await writeFile(join(dir, 'bad.json'), 'nope', 'utf8');
    const res = await app.request('/api/projects/bad');
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/unreadable/);
  });
});
