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

  it('saves a change made while a save is already in flight', async () => {
    const store = createFlowStore();
    const save = vi.fn(async (_p: Project) => {
      await new Promise((r) => setTimeout(r, 200));
    });
    startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    store.getState().changeBoard((b) => addStep(b, { title: 'B' }));
    await vi.advanceTimersByTimeAsync(200); // resolves the in-flight save(A) and reschedules for the pending B edit
    await vi.advanceTimersByTimeAsync(500); // fires the rescheduled save, starting save(A+B)
    await vi.advanceTimersByTimeAsync(200); // resolves save(A+B)'s own internal 200ms wait
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].boards[0].nodes).toHaveLength(2);
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('flush waits for an in-flight save, then saves pending changes', async () => {
    const store = createFlowStore();
    const save = vi.fn(async (_p: Project) => {
      await new Promise((r) => setTimeout(r, 200));
    });
    const handle = startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    store.getState().changeBoard((b) => addStep(b, { title: 'B' }));
    const flushPromise = handle.flush();
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(200);
    await flushPromise;
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].boards[0].nodes).toHaveLength(2);
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('flush rejects when the save fails', async () => {
    const store = createFlowStore();
    const save = vi.fn().mockRejectedValue(new Error('down'));
    const handle = startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    await expect(handle.flush()).rejects.toThrow('Could not save the current project.');
    expect(store.getState().saveStatus).toBe('error');
  });

  it('ignores an in-flight save result after switching projects', async () => {
    const store = createFlowStore();
    const save = vi.fn(async (_p: Project) => {
      await new Promise((r) => setTimeout(r, 200));
    });
    startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    store.getState().loadProject(createProject('Other'));
    await vi.advanceTimersByTimeAsync(200);
    expect(store.getState().saveStatus).toBe('saved');
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not retry after being stopped', async () => {
    const store = createFlowStore();
    const save = vi.fn().mockRejectedValue(new Error('down'));
    const handle = startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getState().saveStatus).toBe('error');
    handle.stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('keeps status error while a retry attempt is in flight, until it succeeds', async () => {
    const store = createFlowStore();
    let calls = 0;
    const save = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error('down');
      await new Promise((r) => setTimeout(r, 100));
    });
    startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getState().saveStatus).toBe('error');
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.getState().saveStatus).toBe('error');
    await vi.advanceTimersByTimeAsync(100);
    expect(store.getState().saveStatus).toBe('saved');
  });
});


describe('startAutosave ordering', () => {
  it('never overlaps saves: a change made during a slow save is saved after it finishes', async () => {
    const store = createFlowStore();
    let inFlight = 0;
    let maxInFlight = 0;
    const order: string[] = [];
    const save = vi.fn(async (p: Project) => {
      const label = String(p.boards[0].nodes.length);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push(`start ${label}`);
      await new Promise((r) => setTimeout(r, label === '1' ? 1000 : 50));
      order.push(`end ${label}`);
      inFlight--;
    });
    startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    store.getState().changeBoard((b) => addStep(b, { title: 'B' }));
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(400);
    await vi.advanceTimersByTimeAsync(50);
    expect(order).toEqual(['start 1', 'end 1', 'start 2', 'end 2']);
    expect(maxInFlight).toBe(1);
    expect(save.mock.calls[1][0].boards[0].nodes).toHaveLength(2);
    expect(store.getState().saveStatus).toBe('saved');
  });

  it('flush during a slow save waits for it and never starts a second concurrent save', async () => {
    const store = createFlowStore();
    let inFlight = 0;
    let maxInFlight = 0;
    const save = vi.fn(async (_p: Project) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 300));
      inFlight--;
    });
    const handle = startAutosave(store, save);
    store.getState().changeBoard((b) => addStep(b, { title: 'A' }));
    await vi.advanceTimersByTimeAsync(500);
    store.getState().changeBoard((b) => addStep(b, { title: 'B' }));
    const flushed = handle.flush();
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(300);
    await flushed;
    expect(maxInFlight).toBe(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(store.getState().saveStatus).toBe('saved');
  });
});
