import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { criticalPath } from '../analysis/criticalPath';
import { overlaps } from '../layout/place';
import { computeTidy } from '../layout/tidy';
import { applyTidy } from '../ops/board';
import { connect } from '../ops/edges';
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

  it('aligns and distributes steps through arrange', async () => {
    const { run, active } = setup((b) => {
      addStep(b, { title: 'A', x: 0, y: 0 });
      addStep(b, { title: 'B', x: 250, y: 90 });
      addStep(b, { title: 'C', x: 600, y: 30 });
    });
    const top = await run('arrange', { ids: ['s1', 's2', 's3'], action: 'align_top' });
    expect(top.ok).toBe(true);
    expect(top.stats).toEqual({ arranged: 3 });
    expect(active().nodes.map((n) => n.y)).toEqual([0, 0, 0]);
    await run('arrange', { ids: ['s1', 's2', 's3'], action: 'distribute_horizontal' });
    expect(active().nodes.map((n) => n.x)).toEqual([0, 300, 600]);
    await run('arrange', { ids: ['s1'], action: 'bring_to_front' });
    expect(active().nodes.map((n) => n.id)).toEqual(['s2', 's3', 's1']);
  });

  it('needs a reference for match actions and reports it', async () => {
    const { run, active } = setup((b) => {
      addStep(b, { title: 'A', x: 0, y: 0 });
      addStep(b, { title: 'D', shape: 'decision', x: 300, y: 0 });
    });
    const missing = await run('arrange', { ids: ['s1', 's2'], action: 'match_size' });
    expect(missing.ok).toBe(false);
    expect(missing.content).toMatch(/reference/);
    const ok = await run('arrange', { ids: ['s2'], action: 'match_size', reference: 's1' });
    expect(ok.ok).toBe(true);
    expect(active().nodes[1]).toMatchObject({ w: 180, h: 72 });
  });

  it('colours steps and rejects unknown colours', async () => {
    const { run, active } = setup((b) => {
      addStep(b, { title: 'A', x: 0, y: 0 });
    });
    expect((await run('update_steps', { updates: [{ id: 's1', color: 'green' }] })).ok).toBe(true);
    expect(active().nodes[0].color).toBe('green');
    const bad = await run('update_steps', { updates: [{ id: 's1', color: 'red' }] });
    expect(bad.ok).toBe(false);
    expect(bad.content).toMatch(/Unknown colour/);
  });
});


describe('update_arrows', () => {
  const BENDS = [{ x: 300, y: 36 }, { x: 300, y: 236 }];
  const shaped = (b: Board) => {
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'B', x: 400, y: 200 });
    connect(b, { source: a, target: c });
    connect(b, { source: a, target: c, type: 'dependency' });
    b.edges[0].bends = BENDS;
  };

  it('moves ends to other sides, keeps the bends and marks arrows separate in one undo step', async () => {
    const { run, active, store } = setup(shaped);
    const before = store.getState().past.length;
    const out = await run('update_arrows', { links: [{ from: 's1', to: 's2', type: 'flow' }], from_side: 'bottom', to_side: 'top', separate: true });
    expect(out).toMatchObject({ ok: true, stats: { arrowsUpdated: 1 }, touched: ['s1', 's2'] });
    expect(active().edges[0]).toMatchObject({ sourceSide: 'bottom', targetSide: 'top', separate: true, bends: BENDS });
    expect(active().edges[1]).toMatchObject({ sourceSide: null, separate: false });
    expect(store.getState().past.length).toBe(before + 1);
  });

  it('matches every arrow between the pair when no type is given', async () => {
    const { run, active } = setup(shaped);
    await run('update_arrows', { links: [{ from: 's1', to: 's2' }], separate: true });
    expect(active().edges.map((e) => e.separate)).toEqual([true, true]);
  });

  it('resets a hand-shaped arrow and routes another around a step in the way', async () => {
    const { run, active } = setup((b) => {
      shaped(b);
      addStep(b, { title: 'In the way', x: 800, y: 0 });
      const e = addStep(b, { title: 'E', x: 1100, y: 0 });
      connect(b, { source: 's1', target: e });
    });
    await run('update_arrows', { links: [{ from: 's1', to: 's2', type: 'flow' }], reset_path: true });
    expect(active().edges[0].bends).toEqual([]);
    const out = await run('update_arrows', { links: [{ from: 's1', to: 's6' }], route_around: true });
    expect(out.ok).toBe(true);
    expect(active().edges[2].bends.length).toBeGreaterThan(0);
  });

  it('refuses an unknown pair or an empty change and leaves the board untouched', async () => {
    const { run, store } = setup(shaped);
    const before = store.getState().project;
    expect((await run('update_arrows', { links: [{ from: 's2', to: 's1' }], separate: true })).content).toContain('s2 is not connected to s1.');
    expect((await run('update_arrows', { links: [{ from: 's1', to: 's2' }] })).content).toMatch(/Say what to change/);
    expect(store.getState().project).toBe(before);
  });

  it('cannot place bends', async () => {
    const { run, active } = setup(shaped);
    const out = await run('update_arrows', { links: [{ from: 's1', to: 's2', type: 'dependency' }], bends: [{ x: 0, y: 0 }], separate: true });
    expect(out.ok).toBe(true);
    expect(active().edges[1]).toMatchObject({ separate: true, bends: [] });
  });

  it('tints the matched arrows in one call and refuses a non-colour', async () => {
    const { run, active, store } = setup(shaped);
    const out = await run('update_arrows', { links: [{ from: 's1', to: 's2' }], color: 'rose' });
    expect(out.ok).toBe(true);
    expect(active().edges.map((e) => e.color)).toEqual(['rose', 'rose']);
    const before = store.getState().project;
    expect((await run('update_arrows', { links: [{ from: 's1', to: 's2' }], color: 'not-a-colour' })).ok).toBe(false);
    expect(store.getState().project).toBe(before);
  });
});

describe('board pinning', () => {
  function twoBoards() {
    const store = createFlowStore();
    const first = store.getState().activeBoardId;
    const second = store.getState().addBoard('Second', false);
    const boardOf = (id: string) => store.getState().project.boards.find((b) => b.id === id)!;
    const titles = (id: string) => boardOf(id).nodes.map((n) => n.title);
    return { store, first, second, boardOf, titles };
  }

  it('edits the pinned board after the user switches tabs mid-turn', async () => {
    const { store, first, second, boardOf, titles } = twoBoards();
    const ctx = storeToolContext(store, async () => {}, first);
    store.getState().setActiveBoard(second);
    const out = await executeTool(ctx, 'add_steps', { steps: [{ title: 'A' }] });
    expect(out.ok).toBe(true);
    expect(titles(first)).toEqual(['A']);
    expect(titles(second)).toEqual([]);
    const update = await executeTool(ctx, 'update_steps', { updates: [{ id: 's1', owner: 'Ops' }] });
    expect(update.ok).toBe(true);
    expect(boardOf(first).nodes[0].owner).toBe('Ops');
  });

  it('follows the active board when nothing is pinned', async () => {
    const { store, second, titles } = twoBoards();
    const ctx = storeToolContext(store, async () => {});
    store.getState().setActiveBoard(second);
    await executeTool(ctx, 'add_steps', { steps: [{ title: 'A' }] });
    expect(titles(second)).toEqual(['A']);
  });

  it('keeps the pin on create_board without switch_to and moves it with switch_to', async () => {
    const { store, first, titles } = twoBoards();
    const ctx = storeToolContext(store, async () => {}, first);
    const kept = await executeTool(ctx, 'create_board', { name: 'Aside', switch_to: false });
    await executeTool(ctx, 'add_steps', { steps: [{ title: 'Still first' }] });
    expect(titles(first)).toEqual(['Still first']);
    expect(titles(JSON.parse(kept.content).board_id)).toEqual([]);
    const moved = await executeTool(ctx, 'create_board', { name: 'Draft' });
    store.getState().setActiveBoard(first);
    await executeTool(ctx, 'add_steps', { steps: [{ title: 'On draft' }] });
    expect(titles(JSON.parse(moved.content).board_id)).toEqual(['On draft']);
    expect(titles(first)).toEqual(['Still first']);
  });

  it('lets an explicit board reference override the pin', async () => {
    const { store, first, second, titles } = twoBoards();
    const ctx = storeToolContext(store, async () => {}, first);
    const out = await executeTool(ctx, 'add_steps', { board: 'Second', steps: [{ title: 'B' }] });
    expect(out.ok).toBe(true);
    expect(titles(second)).toEqual(['B']);
    expect(titles(first)).toEqual([]);
  });

  it('fails readably when the pinned board was deleted mid-turn, instead of editing another board', async () => {
    const { store, first, second, titles } = twoBoards();
    const ctx = storeToolContext(store, async () => {}, second);
    store.getState().deleteBoard(second);
    const out = await executeTool(ctx, 'add_steps', { steps: [{ title: 'Lost' }] });
    expect(out.ok).toBe(false);
    expect(out.content).toContain('has been deleted');
    expect(out.content).toContain('"Board 1"');
    expect(titles(first)).toEqual([]);
    const explicit = await executeTool(ctx, 'add_steps', { board: 'Board 1', steps: [{ title: 'Found' }] });
    expect(explicit.ok).toBe(true);
    expect(titles(first)).toEqual(['Found']);
  });
});
