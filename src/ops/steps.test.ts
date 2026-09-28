import { describe, expect, it } from 'vitest';
import { createBoard, makeNode } from '../model/factory';
import { GAP_MAIN } from '../layout/place';
import { connect, deleteEdges, disconnect, updateEdge } from './edges';
import { OpError } from './errors';
import { runOp } from './run';
import { groupSteps } from './groups';
import { addStep, deleteSteps, resizeNode, setPositions, updateSteps, withGroupMembers } from './steps';
import { byTitle, chain, links, node } from './testkit';

describe('addStep', () => {
  it('places the first step at the origin', () => {
    const b = createBoard('B');
    const id = addStep(b, { title: '  Start  ' });
    expect(id).toBe('s1');
    expect(node(b, id)).toMatchObject({ x: 0, y: 0, title: 'Start' });
  });

  it('adds after an anchor and connects it with a label', () => {
    const { b, ids } = chain(['A']);
    const id = addStep(b, { title: 'B', after: ids[0], edgeLabel: 'Yes' });
    expect(links(b)).toEqual(['A>B']);
    expect(b.edges[0].label).toBe('Yes');
    expect(node(b, id).x).toBe(180 + GAP_MAIN);
  });

  it('adds before an anchor and connects into it', () => {
    const { b, ids } = chain(['A']);
    addStep(b, { title: 'Z', before: ids[0] });
    expect(links(b)).toEqual(['Z>A']);
    expect(byTitle(b, 'Z').x).toBeLessThan(0);
  });

  it('respects explicit coordinates without nudging', () => {
    const b = createBoard('B');
    addStep(b, { title: 'A', x: 0, y: 0 });
    const id = addStep(b, { title: 'B', x: 0, y: 0 });
    expect(node(b, id)).toMatchObject({ x: 0, y: 0 });
  });

  it('nudges automatic placement off existing steps', () => {
    const { b, ids } = chain(['A', 'B']);
    const c = addStep(b, { title: 'C', after: ids[0] });
    expect(links(b)).toEqual(['A>B', 'A>C']);
    expect(node(b, c).y).not.toBe(node(b, ids[1]).y);
  });

  it('rejects unknown anchors and leaves the board untouched', () => {
    const { b } = chain(['A']);
    expect(() => runOp(b, (d) => addStep(d, { after: 's99' }))).toThrow('Unknown step "s99".');
    expect(b.nodes).toHaveLength(1);
  });
});

describe('updateSteps', () => {
  it('updates fields, trimming text', () => {
    const { b, ids } = chain(['A']);
    updateSteps(b, [{ id: ids[0], title: ' Review ', actor: 'agent', durationMin: 90, owner: 'Intake Agent' }]);
    expect(node(b, ids[0])).toMatchObject({ title: 'Review', actor: 'agent', durationMin: 90, owner: 'Intake Agent' });
  });

  it('resizes to the new shape default, keeping the centre', () => {
    const { b, ids } = chain(['A']);
    updateSteps(b, [{ id: ids[0], shape: 'decision' }]);
    const n = node(b, ids[0]);
    expect({ w: n.w, h: n.h }).toEqual({ w: 150, h: 110 });
    expect(n.x + n.w / 2).toBe(90);
    expect(n.y + n.h / 2).toBe(36);
  });

  it('can clear nullable fields', () => {
    const { b, ids } = chain(['A']);
    updateSteps(b, [{ id: ids[0], durationMin: 30, status: 'active' }]);
    updateSteps(b, [{ id: ids[0], durationMin: null, status: null }]);
    expect(node(b, ids[0])).toMatchObject({ durationMin: null, status: null });
  });
});

describe('deleteSteps', () => {
  it('removes steps and their arrows', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    const out = deleteSteps(b, [ids[1]]);
    expect(out).toEqual({ deleted: [ids[1]], reconnected: 0 });
    expect(b.nodes.map((n) => n.title)).toEqual(['A', 'C']);
    expect(b.edges).toEqual([]);
  });

  it('reconnects across a deleted step', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    deleteSteps(b, [ids[1]], { reconnect: true });
    expect(links(b)).toEqual(['A>C']);
  });

  it('reconnects across a deleted chain', () => {
    const { b, ids } = chain(['A', 'B', 'C', 'D']);
    const out = deleteSteps(b, [ids[1], ids[2]], { reconnect: true });
    expect(links(b)).toEqual(['A>D']);
    expect(out.reconnected).toBe(1);
  });

  it('reconnects a deleted branch point without duplicating arrows', () => {
    const { b, ids } = chain(['A', 'B', 'D']);
    const c = addStep(b, { title: 'C', after: ids[0] });
    connect(b, { source: c, target: ids[2] });
    deleteSteps(b, [ids[1]], { reconnect: true });
    expect(links(b)).toEqual(['A>C', 'A>D', 'C>D']);
  });

  it('reconnects every input of a deleted join to its output', () => {
    const { b, ids } = chain(['A', 'J', 'D']);
    const c = addStep(b, { title: 'C', x: 0, y: 300 });
    connect(b, { source: c, target: ids[1] });
    deleteSteps(b, [ids[1]], { reconnect: true });
    expect(links(b)).toEqual(['A>D', 'C>D']);
  });

  it('clears membership when a group is deleted', () => {
    const { b, ids } = chain(['A']);
    const g = makeNode(b, 'group', { title: 'G' });
    b.nodes.push(g);
    node(b, ids[0]).groupId = g.id;
    deleteSteps(b, [g.id]);
    expect(node(b, ids[0]).groupId).toBeNull();
  });
});

describe('arrows', () => {
  it('connect is idempotent per type and returns the existing id', () => {
    const { b, ids } = chain(['A', 'B']);
    const first = b.edges[0].id;
    expect(connect(b, { source: ids[0], target: ids[1] })).toBe(first);
    const dep = connect(b, { source: ids[0], target: ids[1], type: 'dependency' });
    expect(dep).not.toBe(first);
    expect(b.edges).toHaveLength(2);
  });

  it('rejects self loops and group endpoints', () => {
    const { b, ids } = chain(['A']);
    expect(() => connect(b, { source: ids[0], target: ids[0] })).toThrow(OpError);
    const g = makeNode(b, 'group');
    b.nodes.push(g);
    expect(() => connect(b, { source: ids[0], target: g.id })).toThrow(/Groups cannot be connected/);
  });

  it('disconnects and reports missing arrows', () => {
    const { b, ids } = chain(['A', 'B']);
    expect(disconnect(b, { source: ids[0], target: ids[1] })).toBe(1);
    expect(() => disconnect(b, { source: ids[0], target: ids[1] })).toThrow(/not connected/);
  });

  it('updates and deletes arrows by id', () => {
    const { b } = chain(['A', 'B']);
    const id = b.edges[0].id;
    updateEdge(b, id, { type: 'handoff', label: ' docs ' });
    expect(b.edges[0]).toMatchObject({ type: 'handoff', label: 'docs' });
    deleteEdges(b, [id]);
    expect(b.edges).toEqual([]);
  });

  it('colours an arrow with a tint or hex, clears it, and rejects anything else', () => {
    const { b } = chain(['A', 'B']);
    const id = b.edges[0].id;
    expect(b.edges[0].color).toBeNull();
    updateEdge(b, id, { color: 'amber' });
    expect(b.edges[0].color).toBe('amber');
    updateEdge(b, id, { color: '#12ab34' });
    expect(b.edges[0].color).toBe('#12ab34');
    expect(() => updateEdge(b, id, { color: 'red' })).toThrow(OpError);
    expect(b.edges[0].color).toBe('#12ab34');
    updateEdge(b, id, { label: 'x' });
    expect(b.edges[0].color).toBe('#12ab34');
    updateEdge(b, id, { color: null });
    expect(b.edges[0].color).toBeNull();
  });
});

describe('geometry ops', () => {
  it('sets positions and resizes', () => {
    const { b, ids } = chain(['A']);
    setPositions(b, { [ids[0]]: { x: 10, y: 20 } });
    resizeNode(b, ids[0], { x: 10, y: 20, w: 300, h: 10 });
    expect(node(b, ids[0])).toMatchObject({ x: 10, y: 20, w: 300, h: 24 });
  });
});


describe('step colour', () => {
  it('stores presets and hex colours and rejects anything else', () => {
    const { b, ids } = chain(['A']);
    updateSteps(b, [{ id: ids[0], color: '#12ab34' }]);
    expect(node(b, ids[0]).color).toBe('#12ab34');
    updateSteps(b, [{ id: ids[0], color: 'violet' }]);
    expect(node(b, ids[0]).color).toBe('violet');
    expect(() => updateSteps(b, [{ id: ids[0], color: 'red' }])).toThrow(OpError);
    updateSteps(b, [{ id: ids[0], color: null }]);
    expect(node(b, ids[0]).color).toBeNull();
  });
});

describe('withGroupMembers', () => {
  it('carries group members along with a moved group and leaves explicit positions alone', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    const g = groupSteps(b, [ids[0], ids[1]], 'G');
    const group = node(b, g);
    const a = node(b, ids[0]);
    const out = withGroupMembers(b, { [g]: { x: group.x + 10, y: group.y + 20 }, [ids[1]]: { x: 5, y: 5 } });
    expect(out).toEqual({
      [g]: { x: group.x + 10, y: group.y + 20 },
      [ids[0]]: { x: a.x + 10, y: a.y + 20 },
      [ids[1]]: { x: 5, y: 5 },
    });
    expect(withGroupMembers(b, { [ids[2]]: { x: 1, y: 1 } })).toEqual({ [ids[2]]: { x: 1, y: 1 } });
    expect(withGroupMembers(b, {})).toEqual({});
  });
});
