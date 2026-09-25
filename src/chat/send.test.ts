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
