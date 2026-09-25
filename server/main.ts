import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import Anthropic from '@anthropic-ai/sdk';
import { createApp } from './app';
import { createFileStorage } from './storage';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env.FLOWSTATE_API_PORT ?? 8797);
const workspace = resolve(process.env.FLOWSTATE_WORKSPACE ?? 'workspace');
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
if (!anthropic) console.warn('ANTHROPIC_API_KEY is not set; chat is disabled until you add it to .env and restart.');
const app = createApp({ storage: createFileStorage(workspace), anthropic });

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  console.log(`Flowstate API on http://127.0.0.1:${port}, projects in ${workspace}`);
});
