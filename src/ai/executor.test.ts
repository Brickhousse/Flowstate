import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { criticalPath } from '../analysis/criticalPath';
import { overlaps } from '../layout/place';
import { computeTidy } from '../layout/tidy';
import { applyTidy } from '../ops/board';
import { addStep } from '../ops/steps';
import { createFlowStore } from '../store/store';
import type { Board } from '../model/types';
import { executeTool } from './executor';
import { storeToolContext } from './storeContext';

const elk = new ELK();

function setup(build?: (b: Board) => void) {
  const store = createFlowStore();
  if (build) store.getState().changeBoard(build);
  const ctx = storeToolContext(store, async (id) => {
    const board = store.getState().project.boards.find((b) => b.id === id)!;
    const result = await computeTidy(elk, board);
    store.getState().changeBoard((b) => applyTidy(b, result), id);
  });
  const active = () => store.getState().project.boards.find((b) => b.id === store.getState().activeBoardId)!;
  const links = (b: Board = active()) => {
    const t = (id: string) => b.nodes.find((n) => n.id === id)!.title;
    return b.edges.map((e) => `${t(e.source)}>${t(e.target)}`).sort();
  };
  return { store, ctx, active, links, run: (name: string, input: unknown) => executeTool(ctx, name, input) };
}

describe('executeTool', () => {
  it('adds a chained sequence in one call using refs', async () => {
    const { run, active, links } = setup();
    const out = await run('add_steps', {
      steps: [
        { ref: 'a', title: 'Intake', actor: 'agent', duration: '30m' },
        { ref: 'b', title: 'Review', after: 'a' },
        { title: 'Approve', after: 'b', edge_label: 'ok' },
      ],
    });
    expect(out.ok).toBe(true);
    expect(JSON.parse(out.content)).toEqual({
      created: [
        { ref: 'a', id: 's1', title: 'Intake' },
        { ref: 'b', id: 's2', title: 'Review' },
        { id: 's4', title: 'Approve' },
      ],
    });
    expect(out.stats).toEqual({ stepsAdded: 3, arrowsAdded: 2 });
    expect(out.touched).toEqual(['s1', 's2', 's4']);
    expect(links()).toEqual(['Intake>Review', 'Review>Approve']);
    expect(active().nodes[0]).toMatchObject({ actor: 'agent', durationMin: 30 });
  });

  it('replays an insert-between request', async () => {
    const { run, links } = setup((b) => {
      const a = addStep(b, { title: 'Intake' });
      addStep(b, { title: 'Approve', after: a });
    });
    const out = await run('insert_between', { from: 's1', to: 's2', step: { title: 'Review', actor: 'agent' } });
    expect(out).toMatchObject({ ok: true, stats: { stepsAdded: 1, arrowsAdded: 1 } });
    expect(links()).toEqual(['Intake>Review', 'Review>Approve']);
  });

  it('replays a split-into-parallel request with existing steps', async () => {
    const { run, links } = setup((b) => {
      let prev = addStep(b, { title: 'Kickoff' });
      for (const t of ['Research', 'Plan', 'Decision']) prev = addStep(b, { title: t, after: prev });
    });
    const out = await run('branch_parallel', { from: 's1', branches: [[{ existing: 's2' }], [{ existing: 's4' }]], join_at: 's6' });
    expect(out).toMatchObject({ ok: true, stats: { moved: 2 } });
    expect(links()).toEqual(['Kickoff>Plan', 'Kickoff>Research', 'Plan>Decision', 'Research>Decision']);
  });

  it('replays a full draft of a future-state board', async () => {
    const { run, store, active, links } = setup((b) => {
      addStep(b, { title: 'Old manual step' });
    });
    const script: Array<[string, unknown]> = [
      ['create_board', { name: 'Future v1' }],
      ['set_lanes', { lanes: ['Customer', 'Intake Agent', 'Claims Team'] }],
      [
        'add_steps',
        {
          steps: [
            { ref: 'a', title: 'Submit claim', shape: 'terminal', actor: 'person', lane: 'Customer' },
            { ref: 'b', title: 'Extract documents', actor: 'agent', owner: 'Intake Agent', duration: '5m', after: 'a', lane: 'Intake Agent' },
            { ref: 'c', title: 'Validate policy', actor: 'agent', owner: 'Intake Agent', duration: '2m', after: 'b', lane: 'Intake Agent' },
            { ref: 'd', title: 'Approve payout', shape: 'decision', actor: 'person', duration: '1h', after: 'c', lane: 'claims team' },
          ],
        },
      ],
      ['branch_parallel', { from: 's5', branches: [[{ title: 'Fraud check', actor: 'agent', duration: '10m' }]], join_at: 's9' }],
      ['add_flag', { target: 's9', kind: 'question', text: 'Payout threshold?' }],
      ['tidy', {}],
    ];
    for (const [name, input] of script) {
      const out = await run(name, input);
      expect(out.ok, `${name}: ${out.content}`).toBe(true);
    }
    const future = active();
    expect(future.name).toBe('Future v1');
    expect(store.getState().project.boards[0].nodes.map((n) => n.title)).toEqual(['Old manual step']);
    expect(links()).toEqual([
      'Extract documents>Fraud check',
      'Extract documents>Validate policy',
      'Fraud check>Approve payout',
      'Submit claim>Extract documents',
      'Validate policy>Approve payout',
    ]);
    expect(future.nodes.find((n) => n.id === 's5')!.laneId).toBe('l2');
    expect(criticalPath(future).totalMin).toBe(75);
    const steps = future.nodes.filter((n) => n.kind === 'step');
    for (const a of steps) for (const b of steps) if (a !== b) expect(overlaps(a, b, 0)).toBe(false);
  });

  it('reports unknown steps with the valid ids and leaves the board untouched', async () => {
    const { run, store } = setup((b) => {
      addStep(b, { title: 'A' });
    });
    const before = store.getState().project;
    const out = await run('update_steps', { updates: [{ id: 's99', title: 'X' }] });
    expect(out.ok).toBe(false);
    expect(out.content).toContain('Unknown step "s99".');
    expect(out.content).toContain('Steps on this board: s1 "A"');
    expect(store.getState().project).toBe(before);
  });

  it('is atomic: a bad duration in one step adds nothing', async () => {
    const { run, active } = setup();
    const out = await run('add_steps', { steps: [{ title: 'Fine' }, { title: 'Bad', duration: 'soon' }] });
    expect(out.ok).toBe(false);
    expect(out.content).toContain('Cannot read duration');
    expect(active().nodes).toEqual([]);
  });

  it('rejects invalid input, unknown tools, unknown lanes and unknown boards', async () => {
    const { run } = setup();
    expect((await run('add_steps', {})).content).toMatch(/^Invalid input/);
    expect((await run('explode', {})).content).toBe('Unknown tool "explode".');
    expect((await run('add_steps', { steps: [{ title: 'A', lane: 'Nope' }] })).content).toContain('Unknown lane "Nope"');
    expect((await run('add_steps', { board: 'Mars', steps: [{ title: 'A' }] })).content).toContain('Unknown board "Mars"');
  });

  it('reads another board by name', async () => {
    const { run } = setup((b) => {
      addStep(b, { title: 'Legacy step' });
    });
    await run('create_board', { name: 'Future' });
    const out = await run('read_board', { board: 'board 1' });
    expect(out.ok).toBe(true);
    expect(out.content).toContain('"Legacy step"');
  });

  it('updates and clears nullable fields', async () => {
    const { run, active } = setup((b) => {
      addStep(b, { title: 'A', durationMin: 60, actor: 'person' });
    });
    await run('update_steps', { updates: [{ id: 's1', duration: null, actor: null, owner: 'Ops' }] });
    expect(active().nodes[0]).toMatchObject({ durationMin: null, actor: null, owner: 'Ops' });
  });

  it('does not count arrowsAdded when connecting an existing pair, only updates the label', async () => {
    const { run, active } = setup((b) => {
      const a = addStep(b, { title: 'A' });
      addStep(b, { title: 'B', after: a });
    });
    const out = await run('connect', { links: [{ from: 's1', to: 's2', label: 'again' }] });
    expect(out.ok).toBe(true);
    expect(out.stats.arrowsAdded).toBeUndefined();
    expect(active().edges[0].label).toBe('again');
  });

  it('reports flagsResolved and flagsReopened separately', async () => {
    const { run } = setup((b) => {
      addStep(b, { title: 'A' });
    });
    const flagOut = await run('add_flag', { target: 's1', kind: 'question', text: 'Why?' });
    const flagId = (JSON.parse(flagOut.content) as { flag_id: string }).flag_id;
    const resolved = await run('resolve_flag', { flag_id: flagId });
    expect(resolved.stats).toEqual({ flagsResolved: 1 });
    const reopened = await run('resolve_flag', { flag_id: flagId, resolved: false });
    expect(reopened.stats).toEqual({ flagsReopened: 1 });
  });

  it('applies lane to new branch steps but not existing ones', async () => {
    const { run, active } = setup((b) => {
      addStep(b, { title: 'Kickoff' });
    });
    await run('set_lanes', { lanes: ['Ops', 'AI'] });
    const aiLane = active().lanes.find((l) => l.name === 'AI')!.id;
    const out = await run('branch_parallel', { from: 's1', branches: [[{ title: 'Check', actor: 'agent', lane: 'AI' }]] });
    expect(out.ok).toBe(true);
    const step = active().nodes.find((n) => n.title === 'Check')!;
    expect(step.laneId).toBe(aiLane);
  });

  it('rejects an unknown lane in branch_parallel atomically', async () => {
    const { run, store } = setup((b) => {
      addStep(b, { title: 'Kickoff' });
    });
    const before = store.getState().project;
    const out = await run('branch_parallel', { from: 's1', branches: [[{ title: 'Check', lane: 'Nope' }]] });
    expect(out.ok).toBe(false);
    expect(out.content).toContain('Unknown lane "Nope"');
    expect(store.getState().project).toBe(before);
  });

  it('lists both steps and arrows when a flag target is unknown', async () => {
    const { run } = setup((b) => {
      const a = addStep(b, { title: 'A' });
      addStep(b, { title: 'B', after: a });
    });
    const out = await run('add_flag', { target: 'zzz', kind: 'warning', text: 'Careful' });
    expect(out.ok).toBe(false);
    expect(out.content).toContain('Unknown step or arrow "zzz".');
    expect(out.content).toContain('Steps on this board: s1 "A", s2 "B"');
    expect(out.content).toContain('Arrows: e3: s1 -> s2');
  });

  it('reports arrowsRemoved when branch_parallel removes a direct from -> join_at arrow', async () => {
    const { run, links } = setup((b) => {
      const a = addStep(b, { title: 'Start' });
      addStep(b, { title: 'End', after: a });
    });
    const out = await run('branch_parallel', { from: 's1', branches: [[{ title: 'Check' }]], join_at: 's2' });
    expect(out.ok).toBe(true);
    expect(out.stats.arrowsRemoved).toBe(1);
    expect(links()).toEqual(['Check>End', 'Start>Check']);
  });
});
