import { describe, expect, it } from 'vitest';
import { createBoard } from '../model/factory';
import { createFlowStore } from '../store/store';
import { alignNodes, distributeNodes, matchSize, reorder } from './arrange';
import { OpError } from './errors';
import { groupSteps } from './groups';
import { setLanes } from './lanes';
import { addStep } from './steps';
import { node } from './testkit';

function three() {
  const b = createBoard('B');
  const ids = [addStep(b, { title: 'A', x: 0, y: 0 }), addStep(b, { title: 'B', x: 50, y: 100 }), addStep(b, { title: 'C', x: 120, y: 260 })];
  return { b, ids };
}

describe('alignNodes', () => {
  it('aligns left, right, top, middle and bottom to the selection box', () => {
    const cases: Array<[Parameters<typeof alignNodes>[2], 'x' | 'y', number[]]> = [
      ['left', 'x', [0, 0, 0]],
      ['right', 'x', [120, 120, 120]],
      ['top', 'y', [0, 0, 0]],
      ['middle', 'y', [130, 130, 130]],
      ['bottom', 'y', [260, 260, 260]],
    ];
    for (const [edge, axis, expected] of cases) {
      const { b, ids } = three();
      alignNodes(b, ids, edge);
      expect(ids.map((id) => node(b, id)[axis])).toEqual(expected);
    }
  });

  it('centres nodes of different widths', () => {
    const { b, ids } = three();
    node(b, ids[1]).w = 100;
    alignNodes(b, ids, 'center');
    expect(ids.map((id) => node(b, id).x)).toEqual([60, 100, 60]);
  });

  it('needs at least two items', () => {
    const { b, ids } = three();
    expect(() => alignNodes(b, [ids[0]], 'left')).toThrow(OpError);
  });

  it('moves a selected group with its members and ignores members listed alongside it', () => {
    const b = createBoard('B');
    const m1 = addStep(b, { title: 'M1', x: 0, y: 0 });
    const m2 = addStep(b, { title: 'M2', x: 300, y: 0 });
    const g = groupSteps(b, [m1, m2], 'G');
    const t = addStep(b, { title: 'T', x: 0, y: 400 });
    const before = node(b, g).y;
    alignNodes(b, [g, m1, t], 'bottom');
    const dy = node(b, g).y - before;
    expect(node(b, g).y + node(b, g).h).toBe(node(b, t).y + node(b, t).h);
    expect(node(b, m1).y).toBe(dy);
    expect(node(b, m2).y).toBe(dy);
  });

  it('reassigns lanes when alignment crosses them', () => {
    const b = createBoard('B');
    setLanes(b, ['Ops', 'Eng']);
    const a = addStep(b, { title: 'A', x: 0, y: 40 });
    const c = addStep(b, { title: 'C', x: 300, y: 300 });
    expect(node(b, a).laneId).not.toBe(node(b, c).laneId);
    alignNodes(b, [a, c], 'top');
    expect(node(b, c).laneId).toBe(node(b, a).laneId);
  });
});

describe('distributeNodes', () => {
  it('keeps the outermost nodes and equalises the gaps', () => {
    const b = createBoard('B');
    const ids = [addStep(b, { title: 'A', x: 0, y: 0 }), addStep(b, { title: 'B', x: 200, y: 0 }), addStep(b, { title: 'C', x: 600, y: 0 })];
    distributeNodes(b, ids, 'horizontal');
    expect(ids.map((id) => node(b, id).x)).toEqual([0, 300, 600]);
  });

  it('works vertically and needs three items', () => {
    const b = createBoard('B');
    const ids = [addStep(b, { title: 'A', x: 0, y: 0 }), addStep(b, { title: 'B', x: 0, y: 90 }), addStep(b, { title: 'C', x: 0, y: 400 })];
    distributeNodes(b, ids, 'vertical');
    expect(ids.map((id) => node(b, id).y)).toEqual([0, 200, 400]);
    expect(() => distributeNodes(b, ids.slice(0, 2), 'vertical')).toThrow(OpError);
  });
});

describe('matchSize', () => {
  it('copies width, height or both from the reference and keeps the top-left corner', () => {
    const b = createBoard('B');
    const ref = addStep(b, { title: 'R', x: 0, y: 0 });
    const other = addStep(b, { title: 'O', shape: 'decision', x: 300, y: 50 });
    matchSize(b, [ref, other], ref, 'width');
    expect(node(b, other)).toMatchObject({ x: 300, y: 50, w: 180, h: 110 });
    matchSize(b, [ref, other], ref, 'both');
    expect(node(b, other)).toMatchObject({ w: 180, h: 72 });
  });

  it('rejects an unknown reference or nothing else to resize', () => {
    const b = createBoard('B');
    const ref = addStep(b, { title: 'R', x: 0, y: 0 });
    expect(() => matchSize(b, [ref], 'nope', 'width')).toThrow(OpError);
    expect(() => matchSize(b, [ref], ref, 'width')).toThrow(OpError);
  });
});

describe('reorder', () => {
  function stack() {
    const b = createBoard('B');
    const ids = [addStep(b, { title: 'A', x: 0, y: 0 }), addStep(b, { title: 'B', x: 50, y: 20 }), addStep(b, { title: 'C', x: 100, y: 40 })];
    return { b, ids, order: () => b.nodes.map((n) => n.title) };
  }

  it('brings to front and sends to back', () => {
    const s = stack();
    reorder(s.b, [s.ids[0]], 'front');
    expect(s.order()).toEqual(['B', 'C', 'A']);
    reorder(s.b, [s.ids[0]], 'back');
    expect(s.order()).toEqual(['A', 'B', 'C']);
  });

  it('steps forward or backward past the next overlapping node only', () => {
    const s = stack();
    const far = addStep(s.b, { title: 'Far', x: 2000, y: 2000 });
    reorder(s.b, [s.ids[0]], 'forward');
    expect(s.order()).toEqual(['B', 'A', 'C', 'Far']);
    reorder(s.b, [s.ids[2]], 'forward');
    expect(s.order()).toEqual(['B', 'A', 'C', 'Far']);
    reorder(s.b, [far], 'backward');
    expect(s.order()).toEqual(['B', 'A', 'C', 'Far']);
    reorder(s.b, [s.ids[2]], 'backward');
    expect(s.order()).toEqual(['B', 'C', 'A', 'Far']);
  });

  it('keeps the relative order of several moved nodes', () => {
    const s = stack();
    reorder(s.b, [s.ids[0], s.ids[1]], 'forward');
    expect(s.order()).toEqual(['C', 'A', 'B']);
  });

  it('leaves groups where they are', () => {
    const s = stack();
    const g = groupSteps(s.b, [s.ids[0]], 'G');
    const groupIndex = s.b.nodes.findIndex((n) => n.id === g);
    reorder(s.b, [g], 'front');
    expect(s.b.nodes.findIndex((n) => n.id === g)).toBe(groupIndex);
  });
});

describe('arrange inside the store', () => {
  it('reorders and aligns through changeBoard as one undo step each', () => {
    const store = createFlowStore();
    const ids = store.getState().changeBoard((b) => [addStep(b, { title: 'A', x: 0, y: 0 }), addStep(b, { title: 'B', x: 50, y: 20 })]);
    const before = store.getState().past.length;
    store.getState().changeBoard((b) => reorder(b, [ids[0]], 'front'));
    store.getState().changeBoard((b) => alignNodes(b, ids, 'left'));
    const b = store.getState().project.boards[0];
    expect(b.nodes.map((n) => n.title)).toEqual(['B', 'A']);
    expect(b.nodes.map((n) => n.x)).toEqual([0, 0]);
    expect(store.getState().past.length).toBe(before + 2);
  });
});
