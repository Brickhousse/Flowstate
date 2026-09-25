import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { executeTool } from '../ai/executor';
import { storeToolContext } from '../ai/storeContext';
import { addStep, deleteSteps } from '../ops/steps';
import { createFlowStore } from '../store/store';
import { appendUser, MAX_ROUNDS, runTurn, type TurnDeps } from './agentLoop';

const enc = new TextEncoder();
type Chunk = string | Promise<void>;

function sse(events: Array<[string, unknown]>): string {
  return events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
}

function response(chunks: Chunk[], status = 200): Response {
  return new Response(
    new ReadableStream({
      async start(controller) {
        for (const c of chunks) {
          if (typeof c === 'string') controller.enqueue(enc.encode(c));
          else await c;
        }
        controller.close();
      },
    }),
    { status },
  );
}

const done = (content: unknown[], stop_reason: string) => ['done', { content, stop_reason }] as [string, unknown];
const noop = { onText: () => {}, onTool: () => {} };
const signal = () => new AbortController().signal;

function scripted(...responses: Array<() => Response>): TurnDeps['post'] {
  let i = 0;
  return vi.fn(async () => responses[Math.min(i++, responses.length - 1)]());
}

describe('appendUser', () => {
  it('merges into a trailing user message', () => {
    const history: Anthropic.MessageParam[] = [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'x' }] }];
    const out = appendUser(history, [{ type: 'text', text: 'next' }]);
    expect(out).toHaveLength(1);
    expect(out[0].content).toHaveLength(2);
  });
});

describe('runTurn', () => {
  it('returns a text-only answer', async () => {
    const onText = vi.fn();
    const post = scripted(() => response([sse([['text', { delta: 'Hi' }], done([{ type: 'text', text: 'Hi' }], 'end_turn')])]));
    const r = await runTurn({ post, execute: vi.fn() }, { ...noop, onText }, [], 'hello', 'claude-sonnet-5', signal());
    expect(r.error).toBeNull();
    expect(r.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(onText).toHaveBeenCalledWith('Hi');
  });

  it('applies tool calls as they arrive and sends results back', async () => {
    const tool = { type: 'tool_use', id: 't1', name: 'add_steps', input: {} };
    const execute = vi.fn(async () => ({ ok: true, content: '{"created":[]}', touched: ['s1'], stats: { stepsAdded: 1 } }));
    const post = scripted(
      () => response([sse([['tool', tool], done([tool], 'tool_use')])]),
      () => response([sse([done([{ type: 'text', text: 'Done.' }], 'end_turn')])]),
    );
    const r = await runTurn({ post, execute }, noop, [], 'go', 'claude-sonnet-5', signal());
    expect(execute).toHaveBeenCalledTimes(1);
    expect(r.stats).toEqual({ stepsAdded: 1 });
    expect(r.touched).toEqual(['s1']);
    expect(r.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect((post as ReturnType<typeof vi.fn>).mock.calls[1][0].messages[2].content[0]).toEqual({ type: 'tool_result', tool_use_id: 't1', content: '{"created":[]}' });
  });

  it('marks failed tools as errors and a truncated call as not applied', async () => {
    const tool = { type: 'tool_use', id: 't1', name: 'x', input: {} };
    const cut = { type: 'tool_use', id: 't2', name: 'y', input: {} };
    const execute = vi.fn(async () => ({ ok: false, content: 'Unknown step "s9".', touched: [], stats: {} }));
    const post = scripted(() => response([sse([['tool', tool], done([tool, cut], 'max_tokens')])]));
    const r = await runTurn({ post, execute }, noop, [], 'go', 'claude-sonnet-5', signal());
    expect(r.error).toBe('The response hit the length limit.');
    const results = r.messages[2].content as Anthropic.ToolResultBlockParam[];
    expect(results.map((b) => [b.tool_use_id, b.is_error])).toEqual([
      ['t1', true],
      ['t2', true],
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('drops the request from history on refusal', async () => {
    const post = scripted(() => response([sse([done([], 'refusal')])]));
    const r = await runTurn({ post, execute: vi.fn() }, noop, [], 'bad', 'claude-sonnet-5', signal());
    expect(r).toMatchObject({ error: 'Claude declined this request.', messages: [] });
  });

  it('surfaces server errors and HTTP failures', async () => {
    const failing = scripted(() => response([sse([['error', { message: 'Rate limited' }]])]));
    expect((await runTurn({ post: failing, execute: vi.fn() }, noop, [], 'x', 'claude-sonnet-5', signal())).error).toBe('Rate limited');
    const http = scripted(() => new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set.' }), { status: 503 }));
    const r = await runTurn({ post: http, execute: vi.fn() }, noop, [], 'x', 'claude-sonnet-5', signal());
    expect(r).toMatchObject({ error: 'ANTHROPIC_API_KEY is not set.', messages: [] });
  });

  it('never records an empty assistant message', async () => {
    const tool = { type: 'tool_use', id: 't1', name: 'x', input: {} };
    const execute = vi.fn(async () => ({ ok: true, content: 'ok', touched: [], stats: {} }));
    const post = scripted(
      () => response([sse([done([tool], 'tool_use')])]),
      () => response([sse([done([], 'end_turn')])]),
    );
    const r = await runTurn({ post, execute }, noop, [], 'go', 'claude-sonnet-5', signal());
    expect(r.error).toBeNull();
    expect(r.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    const empty = await runTurn({ post: scripted(() => response([sse([done([], 'end_turn')])])), execute }, noop, [], 'hi', 'claude-sonnet-5', signal());
    expect(empty.messages.map((m) => m.role)).toEqual(['user']);
  });

  it('flags a text answer cut off by the length limit', async () => {
    const post = scripted(() => response([sse([done([{ type: 'text', text: 'Half an ans' }], 'max_tokens')])]));
    const r = await runTurn({ post, execute: vi.fn() }, noop, [], 'explain', 'claude-sonnet-5', signal());
    expect(r.error).toBe('The response hit the length limit.');
    expect(r.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('reports Stopped when Stop lands during a tool call', async () => {
    const controller = new AbortController();
    const first = { type: 'tool_use', id: 't1', name: 'x', input: {} };
    const second = { type: 'tool_use', id: 't2', name: 'y', input: {} };
    const execute = vi.fn(async () => {
      controller.abort();
      return { ok: true, content: 'ok', touched: [], stats: {} };
    });
    const post = scripted(() => response([sse([['tool', first], ['tool', second], done([first, second], 'tool_use')])]));
    const r = await runTurn({ post, execute }, noop, [], 'go', 'claude-sonnet-5', controller.signal);
    expect(r.error).toBe('Stopped.');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it(`stops after ${MAX_ROUNDS} rounds`, async () => {
    const tool = { type: 'tool_use', id: 't', name: 'x', input: {} };
    const post = scripted(() => response([sse([done([tool], 'tool_use')])]));
    const execute = vi.fn(async () => ({ ok: true, content: 'ok', touched: [], stats: {} }));
    const r = await runTurn({ post, execute }, noop, [], 'loop', 'claude-sonnet-5', signal());
    expect(r.error).toBe(`Stopped after ${MAX_ROUNDS} rounds of edits.`);
    expect(post).toHaveBeenCalledTimes(MAX_ROUNDS);
    expect(r.messages[r.messages.length - 1].role).toBe('user');
  });

  it('keeps going when the user deletes a step mid-turn, as one undo entry', async () => {
    const store = createFlowStore();
    const s = () => store.getState();
    const a = s().changeBoard((b) => addStep(b, { title: 'A' }));
    const ctx = storeToolContext(store, async () => {});
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = { type: 'tool_use', id: 't1', name: 'add_steps', input: { steps: [{ title: 'B', after: a }] } };
    const second = { type: 'tool_use', id: 't2', name: 'update_steps', input: { updates: [{ id: a, owner: 'Ops' }] } };
    const post = scripted(
      () => response([sse([['tool', first]]), gate, sse([['tool', second], done([first, second], 'tool_use')])]),
      () => response([sse([done([{ type: 'text', text: 'Done.' }], 'end_turn')])]),
    );
    s().begin();
    const turn = runTurn({ post, execute: (n, i) => executeTool(ctx, n, i) }, noop, [], 'go', 'claude-sonnet-5', signal());
    await vi.waitFor(() => expect(s().project.boards[0].nodes).toHaveLength(2));
    s().changeBoard((b) => deleteSteps(b, [a]));
    release();
    const r = await turn;
    const entry = s().commit()!;
    expect(r.error).toBeNull();
    const results = r.messages[2].content as Anthropic.ToolResultBlockParam[];
    expect(results[1]).toMatchObject({ tool_use_id: 't2', is_error: true });
    expect(String(results[1].content)).toContain('Unknown step');
    expect(s().past).toHaveLength(2);
    expect(s().undoEntry(entry)).toBe(true);
    expect(s().project.boards[0].nodes.map((n) => n.title)).toEqual(['A']);
  });
});
