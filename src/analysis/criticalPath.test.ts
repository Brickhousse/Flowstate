import { describe, expect, it } from 'vitest';
import { connect } from '../ops/edges';
import { addStep } from '../ops/steps';
import { branchParallel } from '../ops/structure';
import { byTitle, chain } from '../ops/testkit';
import { criticalPath } from './criticalPath';

function setDur(b: ReturnType<typeof chain>['b'], title: string, minutes: number | null) {
  byTitle(b, title).durationMin = minutes;
}

describe('criticalPath', () => {
  it('is empty for an empty board', () => {
    const { b } = chain([]);
    expect(criticalPath(b)).toEqual({ nodeIds: [], edgeIds: [], totalMin: 0, ignoredEdgeIds: [], missingDuration: [] });
  });

  it('picks the longest parallel branch', () => {
    const { b, ids } = chain(['Start', 'End']);
    branchParallel(b, ids[0], [[{ title: 'Fast' }], [{ title: 'Slow' }]], ids[1]);
    setDur(b, 'Start', 60);
    setDur(b, 'Fast', 30);
    setDur(b, 'Slow', 480);
    setDur(b, 'End', 60);
    const cp = criticalPath(b);
    expect(cp.nodeIds.map((id) => b.nodes.find((n) => n.id === id)!.title)).toEqual(['Start', 'Slow', 'End']);
    expect(cp.totalMin).toBe(600);
    expect(cp.edgeIds).toHaveLength(2);
  });

  it('counts dependency arrows and ignores handoffs', () => {
    const { b, ids } = chain(['A', 'B']);
    const c = addStep(b, { title: 'C', x: 0, y: 300, durationMin: 1000 });
    connect(b, { source: c, target: ids[1], type: 'dependency' });
    const d = addStep(b, { title: 'D', x: 0, y: 600, durationMin: 5000 });
    connect(b, { source: d, target: ids[0], type: 'handoff' });
    const cp = criticalPath(b);
    expect(cp.nodeIds).toEqual([d]);
    expect(cp.totalMin).toBe(5000);
    byTitle(b, 'D').durationMin = 1;
    expect(criticalPath(b).nodeIds).toEqual([c, ids[1]]);
  });

  it('ignores loop-closing arrows instead of hanging', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    connect(b, { source: ids[2], target: ids[1], label: 'Rework' });
    const cp = criticalPath(b);
    expect(cp.nodeIds).toEqual(ids);
    expect(cp.ignoredEdgeIds).toHaveLength(1);
  });

  it('falls back to the longest chain when durations are missing and reports them', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    const cp = criticalPath(b);
    expect(cp.nodeIds).toEqual(ids);
    expect(cp.missingDuration).toEqual(ids);
  });
});
