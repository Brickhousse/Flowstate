import { describe, expect, it } from 'vitest';
import { createBoard } from '../model/factory';
import { connect } from '../ops/edges';
import { runOp } from '../ops/run';
import { addStep, setPositions } from '../ops/steps';
import { arrowRoutes, type RouteCache } from './arrowRoutes';

function row() {
  const b = createBoard('B');
  const a = addStep(b, { title: 'A', x: 0, y: 0 });
  const c = addStep(b, { title: 'C', x: 400, y: 0 });
  const d = addStep(b, { title: 'D', x: 400, y: 300 });
  const ac = connect(b, { source: a, target: c });
  const cd = connect(b, { source: c, target: d, sourceSide: 'bottom', targetSide: 'top' });
  return { b, a, c, d, ac, cd };
}

describe('arrowRoutes', () => {
  it('starts and ends each arrow at the outer edge of its side dots', () => {
    const { b, ac, cd } = row();
    const routes = arrowRoutes(b, new Map());
    const first = routes.get(ac)!.points;
    expect(first[0]).toEqual({ x: 185.5, y: 36 });
    expect(first[first.length - 1]).toEqual({ x: 394.5, y: 36 });
    expect(routes.get(cd)!.points[0]).toEqual({ x: 490, y: 77.5 });
  });

  it('puts the label halfway along the path', () => {
    const { b, ac } = row();
    expect(arrowRoutes(b, new Map()).get(ac)!.label).toEqual({ x: 290, y: 36 });
  });

  it('draws a hand-shaped arrow through its bends', () => {
    const { b, ac } = row();
    b.edges[0].bends = [{ x: 300, y: -60 }];
    expect(arrowRoutes(b, new Map()).get(ac)!.points).toContainEqual({ x: 300, y: -60 });
  });

  it('re-routes only the arrows attached to a moved box', () => {
    const { b, a, ac, cd } = row();
    const cache: RouteCache = new Map();
    const before = arrowRoutes(b, cache);
    const next = runOp(b, (d) => setPositions(d, { [a]: { x: 0, y: 40 } })).board;
    const after = arrowRoutes(next, cache);
    expect(after.get(cd)).toBe(before.get(cd));
    expect(after.get(ac)).not.toBe(before.get(ac));
  });

  it('skips an arrow whose box is missing', () => {
    const { b, ac } = row();
    b.nodes = b.nodes.filter((n) => n.title !== 'A');
    expect(arrowRoutes(b, new Map()).has(ac)).toBe(false);
  });
});
