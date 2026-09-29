import { describe, expect, it } from 'vitest';
import { createBoard } from '../model/factory';
import { connect } from '../ops/edges';
import { runOp } from '../ops/run';
import { addStep, setPositions } from '../ops/steps';
import { addText } from '../ops/text';
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

function crossing() {
  const b = createBoard('B');
  const a = addStep(b, { title: 'A', x: 0, y: 0 });
  const c = addStep(b, { title: 'C', x: 400, y: 300 });
  const e = addStep(b, { title: 'E', x: 0, y: 200 });
  const f = addStep(b, { title: 'F', x: 400, y: 500 });
  const shared = connect(b, { source: a, target: c });
  const apart = connect(b, { source: e, target: f });
  return { b, e, shared, apart };
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

  it('skips an arrow to a text box, which is never drawn, and spreads nothing around it', () => {
    const b = createBoard('B');
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const c = addStep(b, { title: 'C', x: 400, y: 0 });
    const note = addText(b, { text: 'Note', x: 400, y: 200 });
    const drawn = connect(b, { source: a, target: c });
    const hidden = connect(b, { source: a, target: note });
    for (const e of b.edges) e.separate = true;
    const routes = arrowRoutes(b, new Map());
    expect(routes.has(hidden)).toBe(false);
    expect(routes.get(drawn)!.points[0]).toEqual({ x: 185.5, y: 36 });
  });

  it('spreads separate arrows along a side and keeps shared ones on the midpoint', () => {
    const b = createBoard('B');
    const a = addStep(b, { title: 'A', x: 0, y: 0 });
    const up = addStep(b, { title: 'Up', x: 400, y: -200 });
    const down = addStep(b, { title: 'Down', x: 400, y: 200 });
    const e1 = connect(b, { source: a, target: up });
    const e2 = connect(b, { source: a, target: down });
    expect(arrowRoutes(b, new Map()).get(e1)!.points[0]).toEqual({ x: 185.5, y: 36 });
    for (const e of b.edges) e.separate = true;
    const routes = arrowRoutes(b, new Map());
    expect(routes.get(e1)!.points[0]).toEqual({ x: 185.5, y: 24 });
    expect(routes.get(e2)!.points[0]).toEqual({ x: 185.5, y: 48 });
  });

  it('moves a separate arrow off a line it would share, and only that arrow', () => {
    const { b, shared, apart } = crossing();
    const before = arrowRoutes(b, new Map());
    b.edges[1].separate = true;
    const after = arrowRoutes(b, new Map());
    expect(after.get(shared)!.points).toEqual(before.get(shared)!.points);
    expect(after.get(apart)!.points).toEqual([{ x: 185.5, y: 236 }, { x: 300, y: 236 }, { x: 300, y: 536 }, { x: 394.5, y: 536 }]);
  });

  it('keeps the same route object for a separate arrow whose shifted route did not change', () => {
    const { b, d, ac } = row();
    b.edges[0].separate = true;
    const cache: RouteCache = new Map();
    const first = arrowRoutes(b, cache).get(ac);
    const next = runOp(b, (draft) => setPositions(draft, { [d]: { x: 400, y: 340 } })).board;
    expect(arrowRoutes(next, cache).get(ac)).toBe(first);
  });

  it('draws a separate arrow that clashes with nothing exactly as a shared one', () => {
    const { b, ac } = row();
    const cache: RouteCache = new Map();
    const shared = arrowRoutes(b, cache).get(ac);
    b.edges[0].separate = true;
    expect(arrowRoutes(b, cache).get(ac)).toBe(shared);
  });

  it('keeps the same route object for a shifted arrow when nothing near it moved', () => {
    const { b, apart } = crossing();
    b.edges[1].separate = true;
    const far = addStep(b, { title: 'Far', x: 2000, y: 2000 });
    const cache: RouteCache = new Map();
    const first = arrowRoutes(b, cache).get(apart);
    const next = runOp(b, (draft) => setPositions(draft, { [far]: { x: 2000, y: 2100 } })).board;
    expect(arrowRoutes(next, cache).get(apart)).toBe(first);
  });

  it('spreads a separate hand-shaped arrow but never shifts it off a shared line', () => {
    const { b, e, apart } = crossing();
    const g = addStep(b, { title: 'G', x: 400, y: 700 });
    connect(b, { source: e, target: g });
    b.edges[1].bends = [{ x: 290, y: 300 }];
    b.edges[1].separate = true;
    b.edges[2].separate = true;
    expect(arrowRoutes(b, new Map()).get(apart)!.points).toEqual([
      { x: 185.5, y: 224 },
      { x: 207.5, y: 224 },
      { x: 207.5, y: 300 },
      { x: 290, y: 300 },
      { x: 290, y: 536 },
      { x: 394.5, y: 536 },
    ]);
  });

  it('keeps the route object of a shared arrow that a separate arrow moves off', () => {
    const { b, shared, apart } = crossing();
    const cache: RouteCache = new Map();
    const before = arrowRoutes(b, cache);
    b.edges[1].separate = true;
    const after = arrowRoutes(b, cache);
    expect(after.get(apart)).not.toBe(before.get(apart));
    expect(after.get(shared)).toBe(before.get(shared));
  });
});
