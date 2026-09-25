import { describe, expect, it } from 'vitest';
import { makeNode } from '../model/factory';
import { copySubgraph, pasteSubgraph } from './clipboard';
import { addFlag, openFlags, removeFlag, setFlagResolved, updateFlagText } from './flags';
import { groupSteps, ungroup } from './groups';
import { renameLane, resizeLane, setLanes } from './lanes';
import { addStep } from './steps';
import { addText } from './text';
import { byTitle, chain, links, node } from './testkit';

describe('lanes', () => {
  it('creates lanes in order', () => {
    const { b } = chain([]);
    const ids = setLanes(b, ['Customer', ' Ops ']);
    expect(b.lanes).toEqual([
      { id: ids[0], name: 'Customer', order: 0, height: 240 },
      { id: ids[1], name: 'Ops', order: 1, height: 240 },
    ]);
  });

  it('keeps lane ids by name, reorders, and moves members with their band', () => {
    const { b } = chain([]);
    const [cust, ops] = setLanes(b, ['Customer', 'Ops']);
    const s = addStep(b, { title: 'A', laneId: ops });
    const yBefore = node(b, s).y;
    const again = setLanes(b, ['ops', 'Customer', 'Legal']);
    expect(again[0]).toBe(ops);
    expect(again[1]).toBe(cust);
    expect(node(b, s).y).toBe(yBefore - 240);
  });

  it('clears membership of removed lanes and rejects duplicates', () => {
    const { b } = chain([]);
    const [cust] = setLanes(b, ['Customer']);
    const s = addStep(b, { title: 'A', laneId: cust });
    setLanes(b, ['Ops']);
    expect(node(b, s).laneId).toBeNull();
    expect(() => setLanes(b, ['A', 'a'])).toThrow(/Duplicate lane/);
  });

  it('renames and resizes lanes', () => {
    const { b } = chain([]);
    const [id] = setLanes(b, ['X']);
    renameLane(b, id, 'Finance');
    resizeLane(b, id, 50);
    expect(b.lanes[0]).toMatchObject({ name: 'Finance', height: 120 });
  });
});

describe('groups', () => {
  it('groups steps and fits the frame', () => {
    const { b, ids } = chain(['A', 'B']);
    const g = groupSteps(b, ids, 'Intake');
    expect(node(b, g)).toMatchObject({ kind: 'group', title: 'Intake' });
    expect(ids.every((id) => node(b, id).groupId === g)).toBe(true);
    expect(node(b, g).x).toBeLessThan(0);
  });

  it('rejects empty and nested groups, and ungroups', () => {
    const { b, ids } = chain(['A']);
    expect(() => groupSteps(b, [], 'X')).toThrow(/at least one/);
    const g = groupSteps(b, ids, 'G');
    expect(() => groupSteps(b, [g], 'H')).toThrow(/cannot be nested/);
    ungroup(b, g);
    expect(node(b, ids[0]).groupId).toBeNull();
    expect(b.nodes.some((n) => n.id === g)).toBe(false);
  });
});

describe('flags', () => {
  it('flags steps and arrows, resolves, edits, removes, and lists open flags', () => {
    const { b, ids } = chain(['A', 'B']);
    const f1 = addFlag(b, ids[0], 'blocker', 'No API access');
    const f2 = addFlag(b, b.edges[0].id, 'question', 'Who approves?');
    expect(openFlags(b).map((o) => [o.flag.id, o.hostKind])).toEqual([[f1, 'node'], [f2, 'edge']]);
    setFlagResolved(b, f1, true);
    updateFlagText(b, f2, 'Who signs off?');
    expect(openFlags(b).map((o) => o.flag.text)).toEqual(['Who signs off?']);
    removeFlag(b, f2);
    expect(b.edges[0].flags).toEqual([]);
  });

  it('rejects unknown targets and flags', () => {
    const { b } = chain(['A']);
    expect(() => addFlag(b, 's99', 'warning', 'x')).toThrow(/Unknown step or arrow/);
    expect(() => removeFlag(b, 'f99')).toThrow(/Unknown flag/);
  });
});

describe('text', () => {
  it('adds free text above a step', () => {
    const { b, ids } = chain(['A']);
    const t = addText(b, { text: 'Note', near: ids[0] });
    expect(node(b, t)).toMatchObject({ kind: 'text', title: 'Note' });
    expect(node(b, t).y).toBeLessThan(0);
  });
});

describe('clipboard', () => {
  it('copies internal arrows only and remaps ids and groups', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    const g = groupSteps(b, [ids[0], ids[1]], 'G');
    addFlag(b, ids[0], 'warning', 'Risk');
    const clip = copySubgraph(b, [g]);
    expect(clip.nodes.map((n) => n.title)).toEqual(['A', 'B', 'G']);
    expect(clip.edges).toHaveLength(1);
    const pasted = pasteSubgraph(b, clip, 40, 40);
    expect(pasted).toHaveLength(3);
    const newGroup = pasted.map((id) => node(b, id)).find((n) => n.kind === 'group')!;
    const copies = pasted.map((id) => node(b, id)).filter((n) => n.kind === 'step');
    expect(copies.every((n) => n.groupId === newGroup.id)).toBe(true);
    expect(links(b).filter((l) => l === 'A>B')).toHaveLength(2);
    expect(copies[0].flags[0].id).not.toBe(byTitle(b, 'A').flags[0].id);
  });

  it('ignores the clip when nothing is selected', () => {
    const { b } = chain(['A']);
    expect(pasteSubgraph(b, copySubgraph(b, []), 10, 10)).toEqual([]);
    const lone = makeNode(b, 'text', { title: 'x' });
    b.nodes.push(lone);
    expect(copySubgraph(b, [lone.id]).nodes).toHaveLength(1);
  });
});
