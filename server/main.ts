import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createFileStorage } from './storage';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.FLOWSTATE_API_PORT ?? 8797);
const workspace = resolve(process.env.FLOWSTATE_WORKSPACE ?? 'workspace');
const app = createApp({ storage: createFileStorage(workspace) });

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`Flowstate API on http://127.0.0.1:${port}, projects in ${workspace}`);
});
