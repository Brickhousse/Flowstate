import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../model/factory';
import { flowStore } from '../store/store';
import { useChat } from './chatStore';
import { sendMessage } from './send';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sendMessage', () => {
  it('leaves the next project transaction alone after a project switch', async () => {
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
    );
    vi.stubGlobal('fetch', fetch);
    const turn = sendMessage('Add a step', []);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    flowStore.getState().loadProject(createProject('Other'));
    flowStore.getState().begin();
    await turn;
    expect(flowStore.getState().tx).not.toBeNull();
    expect(useChat.getState().controller).toBeNull();
  });
});


function sse(events: Array<[string, unknown]>): string {
  return events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
}

describe('sendMessage board pinning', () => {
  it('applies tool calls to the board the message was sent from, even after a tab switch', async () => {
    flowStore.getState().loadProject(createProject('Pinned'));
    const first = flowStore.getState().activeBoardId;
    const second = flowStore.getState().addBoard('Second', false);
    const tool = { type: 'tool_use', id: 't1', name: 'add_steps', input: { steps: [{ title: 'Pinned step' }] } };
    const rounds = [
      sse([['tool', tool], ['done', { content: [tool], stop_reason: 'tool_use' }]]),
      sse([['done', { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' }]]),
    ];
    let calls = 0;
    const fetch = vi.fn(async () => {
      if (calls === 0) flowStore.getState().setActiveBoard(second);
      return new Response(rounds[Math.min(calls++, 1)], { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    await sendMessage('Add a step', []);
    const titles = (id: string) => flowStore.getState().project.boards.find((b) => b.id === id)!.nodes.map((n) => n.title);
    expect(titles(first)).toEqual(['Pinned step']);
    expect(titles(second)).toEqual([]);
    expect(useChat.getState().items.at(-1)).toMatchObject({ role: 'assistant', error: null, stats: { stepsAdded: 1 } });
  });
});
