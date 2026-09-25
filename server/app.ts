import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { StorageError, type Storage } from './storage';

export interface AppDeps {
  storage: Storage;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof StorageError) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'Internal server error.' }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.get('/api/projects', async (c) => c.json(await deps.storage.list()));
  app.get('/api/projects/:id', async (c) => c.json(await deps.storage.load(c.req.param('id'))));

  app.put('/api/projects/:id', bodyLimit({ maxSize: 50 * 1024 * 1024 }), async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new StorageError('Body is not valid JSON.', 400);
    }
    if (!body || typeof body !== 'object' || (body as { id?: unknown }).id !== c.req.param('id')) {
      throw new StorageError('Project id does not match the URL.', 400);
    }
    await deps.storage.save(body);
    return c.json({ ok: true });
  });

  app.delete('/api/projects/:id', async (c) => {
    await deps.storage.remove(c.req.param('id'));
    return c.json({ ok: true });
  });

  return app;
}
