import type Anthropic from '@anthropic-ai/sdk';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { MISSING_KEY, registerChat } from './chat';

type Listener = (...args: unknown[]) => void;

class FakeStream {
  listeners: Record<string, Listener[]> = {};
  aborted = false;
  constructor(private script: (emit: (event: string, ...args: unknown[]) => void) => Promise<Anthropic.Message>) {}
  on(event: string, fn: Listener) {
    (this.listeners[event] ??= []).push(fn);
    return this;
  }
  emit = (event: string, ...args: unknown[]) => {
    for (const fn of this.listeners[event] ?? []) fn(...args);
  };
  finalMessage() {
    return this.script(this.emit);
  }
  abort() {
    this.aborted = true;
  }
}

function fakeClient(script: ConstructorParameters<typeof FakeStream>[0]) {
  const calls: unknown[] = [];
  const client = {
    messages: {
      stream(params: unknown) {
        calls.push(params);
        return new FakeStream(script);
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

function message(content: unknown[], stop_reason: string): Anthropic.Message {
  return { id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content, stop_reason, stop_sequence: null, usage: {} } as unknown as Anthropic.Message;
}

async function events(res: Response): Promise<Array<[string, unknown]>> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((chunk) => {
      const event = /event: (.*)/.exec(chunk)![1];
      const data = /data: (.*)/.exec(chunk)![1];
      return [event, JSON.parse(data)];
    });
}

const tool = { type: 'tool_use', id: 't1', name: 'add_steps', input: { steps: [{ title: 'A' }] } };
const post = (app: Hono, body: unknown) => app.request('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const validBody = { model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'hi' }] };

describe('POST /api/chat', () => {
  it('explains a missing API key', async () => {
    const app = new Hono();
    registerChat(app, null);
    const res = await post(app, validBody);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: MISSING_KEY });
  });

  it('rejects unknown models', async () => {
    const app = new Hono();
    registerChat(app, fakeClient(async () => message([], 'end_turn')).client);
    expect((await post(app, { ...validBody, model: 'gpt-5' })).status).toBe(400);
  });

  it('streams text, each finished tool call, and the final message', async () => {
    const { client, calls } = fakeClient(async (emit) => {
      emit('text', 'Adding.');
      emit('streamEvent', { type: 'content_block_start' });
      emit('contentBlock', tool);
      return message([{ type: 'text', text: 'Adding.' }, tool], 'tool_use');
    });
    const app = new Hono();
    registerChat(app, client);
    const res = await post(app, validBody);
    expect(await events(res)).toEqual([
      ['text', { delta: 'Adding.' }],
      ['tool', tool],
      ['done', { content: [{ type: 'text', text: 'Adding.' }, tool], stop_reason: 'tool_use' }],
    ]);
    expect(calls[0]).toMatchObject({ model: 'claude-sonnet-5', max_tokens: 32000, cache_control: { type: 'ephemeral' } });
    expect((calls[0] as { tools: unknown[] }).tools).toHaveLength(16);
  });

  it('holds back a tool call cut off by max_tokens', async () => {
    const { client } = fakeClient(async (emit) => {
      emit('contentBlock', tool);
      return message([tool], 'max_tokens');
    });
    const app = new Hono();
    registerChat(app, client);
    expect((await events(await post(app, validBody))).map(([e]) => e)).toEqual(['done']);
  });

  it('reports stream failures as an error event', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('boom');
    });
    const app = new Hono();
    registerChat(app, client);
    expect(await events(await post(app, validBody))).toEqual([['error', { message: 'boom' }]]);
  });
});
