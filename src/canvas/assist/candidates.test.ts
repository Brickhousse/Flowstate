import { describe, expect, it } from 'vitest';
import { createBoard } from '../../model/factory';
import { groupSteps } from '../../ops/groups';
import { setLanes } from '../../ops/lanes';
import { addStep } from '../../ops/steps';
import { buildCandidates, excludedFor, laneLines } from './candidates';

const WORLD = { x: -10000, y: -10000, w: 20000, h: 20000 };

function grouped() {
  const b = createBoard('B');
  const a = addStep(b, { title: 'A', x: 0, y: 0 });
  const s = addStep(b, { title: 'S', x: 300, y: 0 });
  const c = addStep(b, { title: 'C', x: 0, y: 400 });
  const g = groupSteps(b, [a, s], 'G');
  return { b, a, s, c, g };
}

describe('snap candidates', () => {
  it('excludes a dragged step and its own group frame but keeps its siblings', () => {
    const { b, a, s, g } = grouped();
    const skip = excludedFor(b, [a]);
    expect(skip.has(a)).toBe(true);
    expect(skip.has(g)).toBe(true);
    expect(skip.has(s)).toBe(false);
  });

  it('excludes the members of a dragged group', () => {
    const { b, a, s, g, c } = grouped();
    expect([...excludedFor(b, [g])].sort()).toEqual([a, g, s].sort());
    expect(excludedFor(b, [g]).has(c)).toBe(false);
  });

  it('keeps only nodes in view, nearest first, up to the cap', () => {
    const { b, a } = grouped();
    const moving = { x: 0, y: 0, w: 180, h: 72 };
    expect(buildCandidates(b, [a], moving, WORLD).boxes).toHaveLength(2);
    expect(buildCandidates(b, [a], moving, { x: -50, y: -50, w: 600, h: 200 }).boxes).toEqual([{ x: 300, y: 0, w: 180, h: 72 }]);
    expect(buildCandidates(b, [a], moving, WORLD, undefined, 1).boxes).toEqual([{ x: 300, y: 0, w: 180, h: 72 }]);
  });

  it('uses measured sizes when given', () => {
    const { b, a, c } = grouped();
    const sizeOf = (id: string) => (id === c ? { w: 50, h: 20 } : undefined);
    expect(buildCandidates(b, [a], { x: 0, y: 0, w: 180, h: 72 }, WORLD, sizeOf).boxes).toContainEqual({ x: 0, y: 400, w: 50, h: 20 });
  });

  it('turns lane boundaries into lines across the lanes', () => {
    const b = createBoard('B');
    setLanes(b, ['Ops', 'Eng']);
    const [l1, l2] = [...b.lanes].sort((p, q) => p.order - q.order);
    expect(laneLines(b)).toEqual({ xLines: [], yLines: [0, l1.height, l1.height + l2.height] });
    b.direction = 'TB';
    expect(laneLines(b)).toEqual({ xLines: [0, l1.height, l1.height + l2.height], yLines: [] });
    expect(laneLines(createBoard('Empty'))).toEqual({ xLines: [], yLines: [] });
  });
});
