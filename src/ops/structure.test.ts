import { describe, expect, it } from 'vitest';
import { GAP_CROSS, GAP_MAIN, overlaps } from '../layout/place';
import { makeNode } from '../model/factory';
import { addStep } from './steps';
import { addNext, addSibling, addStepOnSide, branchParallel, insertBetween, moveSteps } from './structure';
import { byTitle, chain, links, node } from './testkit';

describe('insertBetween', () => {
  it('rewires A>B into A>X>B and makes room downstream', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    const cBefore = node(b, ids[2]).x;
    const x = insertBetween(b, ids[0], ids[1], { title: 'X' });
    expect(links(b)).toEqual(['A>X', 'B>C', 'X>B']);
    const X = node(b, x);
    const B = node(b, ids[1]);
    expect(B.x).toBeGreaterThanOrEqual(X.x + X.w + GAP_MAIN);
    expect(X.y).toBe(B.y);
    expect(node(b, ids[2]).x - cBefore).toBe(B.x - (180 + GAP_MAIN));
  });

  it('keeps the arrow type and puts the label on the first segment', () => {
    const { b, ids } = chain(['A', 'B']);
    b.edges[0].label = 'Yes';
    b.edges[0].type = 'dependency';
    insertBetween(b, ids[0], ids[1], { title: 'X' });
    const first = b.edges.find((e) => e.source === ids[0])!;
    const second = b.edges.find((e) => e.target === ids[1])!;
    expect(first).toMatchObject({ type: 'dependency', label: 'Yes' });
    expect(second).toMatchObject({ type: 'dependency', label: '' });
  });

  it('refuses when the steps are not connected', () => {
    const { b, ids } = chain(['A', 'B']);
    const c = addStep(b, { title: 'C', x: 900, y: 0 });
    expect(() => insertBetween(b, ids[0], c, { title: 'X' })).toThrow(/not connected/);
  });
});

describe('branchParallel', () => {
  it('creates new branches that rejoin, replacing the direct arrow', () => {
    const { b, ids } = chain(['A', 'D']);
    const out = branchParallel(b, ids[0], [[{ title: 'B' }], [{ title: 'C' }]], ids[1]);
    expect(out).toHaveLength(2);
    expect(links(b)).toEqual(['A>B', 'A>C', 'B>D', 'C>D']);
    const B = byTitle(b, 'B');
    const C = byTitle(b, 'C');
    const D = byTitle(b, 'D');
    expect(overlaps(B, C)).toBe(false);
    expect(D.x).toBeGreaterThanOrEqual(Math.max(B.x + B.w, C.x + C.w) + GAP_MAIN);
  });

  it('splits existing steps off into parallel paths', () => {
    const { b, ids } = chain(['Kickoff', 'Research', 'Plan', 'Decision']);
    branchParallel(b, ids[0], [[{ existing: ids[1] }], [{ existing: ids[2] }]], ids[3]);
    expect(links(b)).toEqual(['Kickoff>Plan', 'Kickoff>Research', 'Plan>Decision', 'Research>Decision']);
    expect(overlaps(byTitle(b, 'Research'), byTitle(b, 'Plan'))).toBe(false);
  });

  it('chains multi-step branches without a join', () => {
    const { b, ids } = chain(['A']);
    branchParallel(b, ids[0], [[{ title: 'X1' }, { title: 'X2' }]]);
    expect(links(b)).toEqual(['A>X1', 'X1>X2']);
  });

  it('handles a branch that rejoins upstream of the split', () => {
    const { b, ids } = chain(['A', 'B']);
    branchParallel(b, ids[1], [[{ title: 'Rework' }]], ids[0]);
    expect(links(b)).toEqual(['A>B', 'B>Rework', 'Rework>A']);
  });

  it('validates input', () => {
    const { b, ids } = chain(['A', 'B']);
    expect(() => branchParallel(b, ids[0], [[]])).toThrow(/at least one step/);
    expect(() => branchParallel(b, ids[0], [[{ existing: ids[0] }]])).toThrow(/cannot be both/);
    expect(() => branchParallel(b, ids[0], [[{ existing: ids[1] }], [{ existing: ids[1] }]])).toThrow(/only appear once/);
  });
});

describe('moveSteps', () => {
  it('moves below an anchor', () => {
    const { b, ids } = chain(['A']);
    const z = addStep(b, { title: 'Z', x: 900, y: 900 });
    moveSteps(b, { ids: [z], relation: 'below', anchor: ids[0] });
    expect(node(b, z)).toMatchObject({ x: 0, y: 72 + GAP_CROSS });
  });

  it('moves after an anchor', () => {
    const { b, ids } = chain(['A']);
    const z = addStep(b, { title: 'Z', x: 900, y: 900 });
    moveSteps(b, { ids: [z], relation: 'after', anchor: ids[0] });
    expect(node(b, z)).toMatchObject({ x: 180 + GAP_MAIN, y: 0 });
  });

  it('moves into a lane', () => {
    const { b, ids } = chain(['A']);
    b.lanes = [{ id: 'l9', name: 'Ops', order: 0, height: 240 }];
    moveSteps(b, { ids, laneId: 'l9' });
    expect(node(b, ids[0])).toMatchObject({ laneId: 'l9', y: (240 - 72) / 2 });
  });

  it('moves into a group and refits it', () => {
    const { b, ids } = chain(['A', 'B']);
    const g = makeNode(b, 'group', { title: 'G' });
    b.nodes.push(g);
    node(b, ids[0]).groupId = g.id;
    moveSteps(b, { ids: [ids[1]], groupId: g.id });
    expect(node(b, ids[1]).groupId).toBe(g.id);
    expect(g.x + g.w).toBeGreaterThanOrEqual(node(b, ids[1]).x + 180);
  });

  it('requires a destination', () => {
    const { b, ids } = chain(['A']);
    expect(() => moveSteps(b, { ids })).toThrow(/Say where to move/);
  });
});

describe('side and sibling steps', () => {
  it('adds on the forward side as a connected next step', () => {
    const { b, ids } = chain(['A']);
    node(b, ids[0]).actor = 'agent';
    const n = addStepOnSide(b, ids[0], 'right');
    expect(links(b)).toEqual(['A>']);
    expect(node(b, n).actor).toBe('agent');
  });

  it('adds on the backward side as a predecessor', () => {
    const { b, ids } = chain(['A']);
    addStepOnSide(b, ids[0], 'left');
    expect(links(b)).toEqual(['>A']);
  });

  it('adds on a cross side with arrow sides set', () => {
    const { b, ids } = chain(['A']);
    const n = addStepOnSide(b, ids[0], 'bottom');
    expect(node(b, n).y).toBe(72 + GAP_CROSS);
    expect(b.edges[0]).toMatchObject({ source: ids[0], target: n, sourceSide: 'bottom', targetSide: 'top' });
  });

  it('addNext chains forward and addSibling branches from the parent', () => {
    const { b, ids } = chain(['A', 'B']);
    const next = addNext(b, ids[1]);
    expect(node(b, next).x).toBe(2 * (180 + GAP_MAIN));
    const sib = addSibling(b, ids[1]);
    expect(links(b)).toEqual(['A>', 'A>B', 'B>']);
    expect(node(b, sib).y).toBeGreaterThan(node(b, ids[1]).y);
  });
});
