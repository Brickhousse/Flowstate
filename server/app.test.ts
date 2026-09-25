import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createProject } from '../src/model/factory';
import { createApp } from './app';
import { createFileStorage } from './storage';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'flowstate-app-'));
  return { dir, app: createApp({ storage: createFileStorage(dir), anthropic: null }) };
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

  it('refuses to save a structurally invalid project', async () => {
    const { app } = await setup();
    const p = createProject('Broken');
    p.boards[0].nodes.push({ id: 's1', kind: 'step', title: 'No flags' } as unknown as (typeof p.boards)[0]['nodes'][0]);
    const res = await app.request(`/api/projects/${p.id}`, put(p));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/boards\[0\]\.nodes\[0\]/);
    expect((await app.request(`/api/projects/${p.id}`)).status).toBe(404);
    const noNodes = { ...createProject('Broken too'), boards: [{ id: 'b1', name: 'Main', direction: 'LR', edges: [], lanes: [], nextId: 1 }] };
    expect((await app.request(`/api/projects/${noNodes.id}`, put(noNodes))).status).toBe(400);
  });

  it('returns 422 for a corrupt file', async () => {
    const { app, dir } = await setup();
    await writeFile(join(dir, 'bad.json'), 'nope', 'utf8');
    const res = await app.request('/api/projects/bad');
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/unreadable/);
  });

  it('rejects an oversized body with 413 instead of crashing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flowstate-app-'));
    const app = createApp({ storage: createFileStorage(dir), anthropic: null }, { maxBodySize: 10 });
    const p = createProject();
    const res = await app.request(`/api/projects/${p.id}`, put(p));
    expect(res.status).toBe(413);
  });
});

describe('local-only guard', () => {
  const health = (app: Hono, headers: Record<string, string>) => app.request('/api/health', { headers });

  it.each(['localhost', 'localhost:5173', 'LOCALHOST:5174', '127.0.0.1:8797', '[::1]:8797'])('serves Host %s', async (host) => {
    const { app } = await setup();
    expect((await health(app, { host })).status).toBe(200);
  });

  it.each(['evil.example', 'localhost.evil.example', '127.0.0.1.evil.example:8797', 'localhost@evil.example', '10.0.0.5:8797', ''])('rejects Host %j', async (host) => {
    const { app } = await setup();
    const res = await health(app, { host });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/localhost/);
  });

  it('rejects every route and method under /api for a foreign Host', async () => {
    const { app } = await setup();
    const p = createProject();
    await app.request(`/api/projects/${p.id}`, put(p));
    const foreign = { host: 'evil.example' };
    expect((await app.request('/api/projects', { headers: foreign })).status).toBe(403);
    expect((await app.request(`/api/projects/${p.id}`, { headers: foreign })).status).toBe(403);
    expect((await app.request(`/api/projects/${p.id}`, { ...put(p), headers: { ...put(p).headers, ...foreign } })).status).toBe(403);
    expect((await app.request(`/api/projects/${p.id}`, { method: 'DELETE', headers: foreign })).status).toBe(403);
    expect((await app.request('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', ...foreign }, body: '{}' })).status).toBe(403);
    expect((await app.request(`/api/projects/${p.id}`)).status).toBe(200);
  });

  it.each(['http://localhost:5173', 'http://127.0.0.1:8797', 'http://[::1]:5173', 'https://localhost'])('serves Origin %s', async (origin) => {
    const { app } = await setup();
    expect((await health(app, { origin })).status).toBe(200);
  });

  it.each(['http://evil.example', 'http://localhost.evil.example:5173', 'null', 'garbage'])('rejects Origin %j', async (origin) => {
    const { app } = await setup();
    const res = await health(app, { origin });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/origin/i);
  });

  it('requires application/json on POST and PUT, not on GET or DELETE', async () => {
    const { app } = await setup();
    const p = createProject();
    const body = JSON.stringify(p);
    const url = `/api/projects/${p.id}`;
    expect((await app.request(url, { method: 'PUT', body })).status).toBe(415);
    expect((await app.request(url, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body })).status).toBe(415);
    expect((await app.request('/api/chat', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status).toBe(415);
    expect((await app.request(url, { method: 'PUT', headers: { 'content-type': 'Application/JSON; charset=utf-8' }, body })).status).toBe(200);
    expect((await app.request(url)).status).toBe(200);
    expect((await app.request(url, { method: 'DELETE' })).status).toBe(200);
    const chat = await app.request('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(chat.status).toBe(503);
  });
});
