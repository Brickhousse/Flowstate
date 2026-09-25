import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { applyTidy } from '../ops/board';
import { setLanes } from '../ops/lanes';
import { addStep } from '../ops/steps';
import { addText } from '../ops/text';
import { branchParallel } from '../ops/structure';
import { byTitle, chain } from '../ops/testkit';
import { laneBands, overlaps } from './place';
import { computeTidy } from './tidy';

const elk = new ELK();

function scramble(b: ReturnType<typeof chain>['b']) {
  b.nodes.forEach((n, i) => {
    n.x = ((i * 7919) % 13) * 37;
    n.y = ((i * 104729) % 11) * 29;
  });
}

function noOverlaps(b: ReturnType<typeof chain>['b']) {
  const steps = b.nodes.filter((n) => n.kind === 'step');
  for (const a of steps) for (const c of steps) if (a !== c) expect(overlaps(a, c, 0), `${a.title}/${c.title}`).toBe(false);
}

describe('computeTidy', () => {
  it('lays a chain out left to right', async () => {
    const { b } = chain(['A', 'B', 'C']);
    scramble(b);
    applyTidy(b, await computeTidy(elk, b));
    const [A, B, C] = ['A', 'B', 'C'].map((t) => byTitle(b, t));
    expect(A.x).toBeLessThan(B.x);
    expect(B.x).toBeLessThan(C.x);
    noOverlaps(b);
  });

  it('lays a chain out top to bottom when direction is TB', async () => {
    const { b } = chain(['A', 'B']);
    b.direction = 'TB';
    scramble(b);
    applyTidy(b, await computeTidy(elk, b));
    expect(byTitle(b, 'A').y).toBeLessThan(byTitle(b, 'B').y);
  });

  it('separates parallel branches', async () => {
    const { b, ids } = chain(['A', 'D']);
    branchParallel(b, ids[0], [[{ title: 'B' }], [{ title: 'C' }]], ids[1]);
    scramble(b);
    applyTidy(b, await computeTidy(elk, b));
    expect(byTitle(b, 'B').x).toBe(byTitle(b, 'C').x);
    noOverlaps(b);
  });

  it('keeps lane members inside their bands and grows crowded lanes', async () => {
    const { b } = chain([]);
    const [ops, legal] = setLanes(b, ['Ops', 'Legal']);
    const a = addStep(b, { title: 'A', laneId: ops });
    for (const t of ['B', 'C', 'D']) addStep(b, { title: t, after: a, laneId: ops });
    addStep(b, { title: 'E', after: a, laneId: legal });
    applyTidy(b, await computeTidy(elk, b));
    const bands = laneBands(b);
    for (const n of b.nodes) {
      const band = bands.find((x) => x.id === n.laneId)!;
      expect(n.y).toBeGreaterThanOrEqual(band.start);
      expect(n.y + n.h).toBeLessThanOrEqual(band.start + band.size);
    }
    expect(b.lanes.find((l) => l.id === ops)!.height).toBeGreaterThan(240);
    noOverlaps(b);
  });

  it('leaves free text where it is', async () => {
    const { b, ids } = chain(['A', 'B']);
    const t = addText(b, { text: 'note', x: 999, y: 999 });
    applyTidy(b, await computeTidy(elk, b));
    expect(b.nodes.find((n) => n.id === t)).toMatchObject({ x: 999, y: 999 });
    expect(ids).toHaveLength(2);
  });
});
