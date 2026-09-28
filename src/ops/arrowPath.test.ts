import { describe, expect, it } from 'vitest';
import { createBoard } from '../model/factory';
import { reattach, resetPath, setBends } from './arrowPath';
import { applyTidy } from './board';
import { copySubgraph, pasteSubgraph } from './clipboard';
import { connect } from './edges';
import { OpError } from './errors';
import { groupSteps } from './groups';
import { runOp } from './run';
import { addStep, setPositions, withGroupMembers } from './steps';

const BENDS = [{ x: 300, y: 36 }, { x: 300, y: 236 }];

function shaped() {
  const b = createBoard('B');
  const a = addStep(b, { title: 'A', x: 0, y: 0 });
  const c = addStep(b, { title: 'C', x: 400, y: 200 });
  const e = connect(b, { source: a, target: c });
  b.edges[0].bends = BENDS.map((p) => ({ ...p }));
  return { b, a, c, e };
}

describe('bends follow their boxes', () => {
  it('shift by the same amount when both ends move together', () => {
    const { b, a, c } = shaped();
    setPositions(b, { [a]: { x: 40, y: 20 }, [c]: { x: 440, y: 220 } });
    expect(b.edges[0].bends).toEqual([{ x: 340, y: 56 }, { x: 340, y: 256 }]);
  });

  it('stay put when only one end moves', () => {
    const { b, c } = shaped();
    setPositions(b, { [c]: { x: 500, y: 260 } });
    expect(b.edges[0].bends).toEqual(BENDS);
  });

  it('stay put when both ends move by different amounts', () => {
    const { b, a, c } = shaped();
    setPositions(b, { [a]: { x: 40, y: 0 }, [c]: { x: 400, y: 260 } });
    expect(b.edges[0].bends).toEqual(BENDS);
  });

  it('shift when the group holding both ends moves', () => {
    const { b, a, c } = shaped();
    const g = groupSteps(b, [a, c], 'G');
    const frame = b.nodes.find((n) => n.id === g)!;
    setPositions(b, withGroupMembers(b, { [g]: { x: frame.x + 100, y: frame.y - 50 } }));
    expect(b.edges[0].bends).toEqual([{ x: 400, y: -14 }, { x: 400, y: 186 }]);
  });

  it('shift with the copy on paste and leave the original alone', () => {
    const { b, a, c } = shaped();
    pasteSubgraph(b, copySubgraph(b, [a, c]), 40, 60);
    expect(b.edges[0].bends).toEqual(BENDS);
    expect(b.edges[1].bends).toEqual([{ x: 340, y: 96 }, { x: 340, y: 296 }]);
  });

  it('return with the original when a Ctrl+drag drops a copy', () => {
    const { b, a, c } = shaped();
    setPositions(b, { [a]: { x: 100, y: 0 }, [c]: { x: 500, y: 200 } });
    setPositions(b, { [a]: { x: 0, y: 0 }, [c]: { x: 400, y: 200 } });
    pasteSubgraph(b, copySubgraph(b, [a, c]), 100, 0);
    expect(b.edges.map((e) => e.bends)).toEqual([BENDS, [{ x: 400, y: 36 }, { x: 400, y: 236 }]]);
  });

  it('are cleared by Tidy', () => {
    const { b, a, c } = shaped();
    applyTidy(b, { positions: { [a]: { x: 0, y: 0 }, [c]: { x: 252, y: 0 } }, laneHeights: {} });
    expect(b.edges[0].bends).toEqual([]);
  });
});

describe('reattach', () => {
  it('moves an end to another side of the same box and keeps the bends', () => {
    const { b, e, c } = shaped();
    reattach(b, e, 'target', c, 'top');
    expect(b.edges[0]).toMatchObject({ target: c, targetSide: 'top', bends: BENDS });
  });

  it('moves an end to another box and clears the bends', () => {
    const { b, e } = shaped();
    const d = addStep(b, { title: 'D', x: 400, y: 500 });
    reattach(b, e, 'target', d, 'left');
    expect(b.edges[0]).toMatchObject({ target: d, targetSide: 'left', bends: [] });
  });

  it('changes nothing when the end is dropped on the side it already uses', () => {
    const { b, e, a } = shaped();
    expect(runOp(b, (d) => reattach(d, e, 'source', a, 'right')).board).toBe(b);
  });

  it('refuses a self-link, a group frame and a duplicate of the same type', () => {
    const { b, e, a, c } = shaped();
    const d = addStep(b, { title: 'D', x: 800, y: 0 });
    connect(b, { source: a, target: d });
    const g = groupSteps(b, [d], 'G');
    expect(() => reattach(b, e, 'target', a, 'left')).toThrow(`Cannot connect ${a} to itself.`);
    expect(() => reattach(b, e, 'target', g, 'left')).toThrow('Groups cannot be connected');
    expect(() => reattach(b, e, 'target', d, 'left')).toThrow(OpError);
    expect(b.edges[0]).toMatchObject({ source: a, target: c, bends: BENDS });
  });

  it('allows the same pair when the existing arrow is of another type', () => {
    const { b, e, a } = shaped();
    const d = addStep(b, { title: 'D', x: 800, y: 0 });
    connect(b, { source: a, target: d, type: 'dependency' });
    reattach(b, e, 'target', d, 'left');
    expect(b.edges[0].target).toBe(d);
  });
});

describe('setBends and resetPath', () => {
  it('stores bends without repeated or collinear points', () => {
    const { b, e } = shaped();
    setBends(b, e, [{ x: 300, y: 36 }, { x: 300, y: 100 }, { x: 300, y: 236 }, { x: 300, y: 236 }]);
    expect(b.edges[0].bends).toEqual(BENDS);
  });

  it('drops the bends, and leaves an automatic arrow untouched', () => {
    const { b, e } = shaped();
    resetPath(b, [e]);
    expect(b.edges[0].bends).toEqual([]);
    expect(runOp(b, (d) => resetPath(d, [e])).board).toBe(b);
  });
});
