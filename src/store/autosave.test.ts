import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../model/factory';
import { addStep } from '../ops/steps';
import type { Project } from '../model/types';
import { startAutosave } from './autosave';
import { createFlowStore } from './store';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('startAutosave', () => {
  it('saves once, 500ms after the last of several quick changes', async () => {
    const store = createFlowStore();
    const save = vi.fn(async (_p: Project) => {});
    startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    expect(store.getState().saveStatus).toBe('saving');
    await vi.advanceTimersByTimeAsync(300);
    store.getState().changeBoard((b) => addStep(b, { title: 'B' }));
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].boards[0].nodes).toHaveLength(2);
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('reports errors and retries until the save succeeds', async () => {
    const store = createFlowStore();
    const save = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(undefined);
    startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getState().saveStatus).toBe('error');
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('does not save a project that was just loaded', async () => {
    const store = createFlowStore();
    const save = vi.fn(async () => {});
    startAutosave(store, save);
    store.getState().loadProject(createProject('Other'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });

  it('flushes pending changes immediately', async () => {
    const store = createFlowStore();
    const save = vi.fn(async (_p: Project) => {});
    const handle = startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    await handle.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('stops when disposed', async () => {
    const store = createFlowStore();
    const save = vi.fn(async () => {});
    const handle = startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    handle.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });
});
