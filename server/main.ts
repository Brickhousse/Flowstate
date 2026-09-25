import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { createApp } from './app';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.FLOWSTATE_API_PORT ?? 8787);
const app = createApp({});

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`Flowstate API on http://127.0.0.1:${port}`);
});
