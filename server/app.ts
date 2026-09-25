import type Anthropic from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { registerChat } from './chat';
import { StorageError, type Storage } from './storage';

export interface AppDeps {
  storage: Storage;
  anthropic: Anthropic | null;
}

export interface AppOptions {
  maxBodySize?: number;
}

const DEFAULT_MAX_BODY_SIZE = 50 * 1024 * 1024;

export function createApp(deps: AppDeps, options: AppOptions = {}): Hono {
  const maxBodySize = options.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof StorageError) return c.json({ error: err.message }, err.status);
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json({ error: 'Internal server error.' }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.get('/api/projects', async (c) => c.json(await deps.storage.list()));
  app.get('/api/projects/:id', async (c) => c.json(await deps.storage.load(c.req.param('id'))));

  app.put('/api/projects/:id', bodyLimit({ maxSize: maxBodySize }), async (c) => {
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

  registerChat(app, deps.anthropic);

  return app;
}
