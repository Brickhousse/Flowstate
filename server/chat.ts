import Anthropic from '@anthropic-ai/sdk';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { SYSTEM_PROMPT } from '../src/ai/systemPrompt';
import { TOOL_DEFS } from '../src/ai/toolDefs';

export const MODELS = ['claude-sonnet-5', 'claude-opus-5-5'] as const;
export const MISSING_KEY = 'ANTHROPIC_API_KEY is not set. Add it to .env and restart the dev server.';

const MAX_TOKENS = 32000;
const Body = z.object({
  model: z.enum(MODELS),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.unknown() })).min(1),
});

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by Anthropic. Wait a moment and try again.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach Anthropic. Check the internet connection.';
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ''}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

export function registerChat(app: Hono, client: Anthropic | null): void {
  app.post('/api/chat', async (c) => {
    if (!client) return c.json({ error: MISSING_KEY }, 503);
    let body: z.infer<typeof Body>;
    try {
      body = Body.parse(await c.req.json());
    } catch {
      return c.json({ error: 'Invalid chat request.' }, 400);
    }

    return streamSSE(c, async (sse) => {
      let chain = Promise.resolve();
      const send = (event: string, data: unknown) => {
        chain = chain.then(() => sse.writeSSE({ event, data: JSON.stringify(data) }));
      };
      const stream = client.messages.stream({
        model: body.model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFS,
        messages: body.messages as Anthropic.MessageParam[],
        cache_control: { type: 'ephemeral' },
      });
      sse.onAbort(() => stream.abort());

      let pending: Anthropic.ToolUseBlock | null = null;
      const flush = () => {
        if (pending) send('tool', pending);
        pending = null;
      };
      stream.on('text', (delta) => send('text', { delta }));
      stream.on('streamEvent', (event) => {
        if (event.type === 'content_block_start') flush();
      });
      stream.on('contentBlock', (block) => {
        if (block.type === 'tool_use') pending = block;
      });

      try {
        const final = await stream.finalMessage();
        if (final.stop_reason === 'tool_use') flush();
        send('done', { content: final.content, stop_reason: final.stop_reason });
      } catch (err) {
        if (!sse.aborted) send('error', { message: describeError(err) });
      }
      await chain;
    });
  });
}
