import type Anthropic from '@anthropic-ai/sdk';
import { Hono, type MiddlewareHandler } from 'hono';
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
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTNAMES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function mediaType(contentType: string | undefined): string {
  return (contentType ?? '').split(';')[0].trim().toLowerCase();
}

// Stops DNS rebinding and cross-site requests from reaching the key or the project files (ADR 0004).
export const localOnly: MiddlewareHandler = async (c, next) => {
  // @hono/node-server always forwards Host; Hono's in-process app.request() never sets one.
  const host = c.req.header('host') ?? new URL(c.req.url).host;
  if (!isLocalUrl(`http://${host}`)) return c.json({ error: 'This API only answers requests addressed to localhost.' }, 403);
  const origin = c.req.header('origin');
  if (origin !== undefined && !isLocalUrl(origin)) return c.json({ error: 'Requests from this origin are not allowed.' }, 403);
  if ((c.req.method === 'POST' || c.req.method === 'PUT') && mediaType(c.req.header('content-type')) !== 'application/json') {
    return c.json({ error: 'Content-Type must be application/json.' }, 415);
  }
  await next();
};

export function createApp(deps: AppDeps, options: AppOptions = {}): Hono {
  const maxBodySize = options.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
  const app = new Hono();

  app.use('/api/*', localOnly);

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
