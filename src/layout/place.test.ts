import { describe, expect, it } from 'vitest';
import { createBoard, makeNode } from '../model/factory';
import type { Board, BoardNode } from '../model/types';
import { ensureGap, fitGroup, GAP_CROSS, GAP_MAIN, laneAt, laneBands, nudgeFree, overlaps, placeInLane, positionAfter, positionAtEnd, positionBeside, shiftDownstream } from './place';

function add(b: Board, init: Partial<BoardNode>): BoardNode {
  const n = makeNode(b, 'step', init);
  b.nodes.push(n);
  return n;
}

function link(b: Board, source: string, target: string) {
  b.edges.push({ id: `e${b.nextId++}`, source, target, sourceSide: null, targetSide: null, type: 'flow', label: '', flags: [], separate: false, bends: [] });
}

describe('placement', () => {
  it('places after an anchor, centred on its cross axis (LR)', () => {
    const b = createBoard('B');
    const a = add(b, { x: 0, y: 0 });
    const n = makeNode(b, 'step', { shape: 'decision' });
    positionAfter(b, a, n);
    expect(n.x).toBe(a.w + GAP_MAIN);
    expect(n.y).toBe((a.h - n.h) / 2);
  });

  it('places after an anchor along y when the board is TB', () => {
    const b = createBoard('B');
    b.direction = 'TB';
    const a = add(b, { x: 0, y: 0 });
    const n = makeNode(b, 'step');
    positionAfter(b, a, n);
    expect(n.y).toBe(a.h + GAP_MAIN);
    expect(n.x).toBe(0);
  });

  it('places beside an anchor on the cross axis', () => {
    const b = createBoard('B');
    const a = add(b, { x: 0, y: 0 });
    const n = makeNode(b, 'step');
    positionBeside(b, a, n, 1);
    expect(n.x).toBe(0);
    expect(n.y).toBe(a.h + GAP_CROSS);
  });

  it('places at the end of the board', () => {
    const b = createBoard('B');
    const first = makeNode(b, 'step');
    positionAtEnd(b, first);
    expect([first.x, first.y]).toEqual([0, 0]);
    b.nodes.push(first);
    add(b, { x: 400, y: 100 });
    const n = makeNode(b, 'step');
    positionAtEnd(b, n);
    expect(n.x).toBe(400 + 180 + GAP_MAIN);
    expect(n.y).toBe(100);
  });

  it('nudges off occupied space, alternating sides', () => {
    const b = createBoard('B');
    add(b, { x: 0, y: 0 });
    const n = makeNode(b, 'step', { x: 0, y: 0 });
    nudgeFree(b, n);
    expect(n.y).toBe(72 + GAP_CROSS);
    add(b, { x: 0, y: 72 + GAP_CROSS });
    const m = makeNode(b, 'step', { x: 0, y: 0 });
    nudgeFree(b, m);
    expect(m.y).toBe(-(72 + GAP_CROSS));
    expect(b.nodes.some((o) => overlaps(o, m))).toBe(false);
  });

  it('shifts downstream nodes and survives cycles', () => {
    const b = createBoard('B');
    const a = add(b, { x: 0 });
    const c = add(b, { x: 300 });
    const d = add(b, { x: 600 });
    link(b, a.id, c.id);
    link(b, c.id, d.id);
    link(b, d.id, c.id);
    shiftDownstream(b, c.id, 100);
    expect([a.x, c.x, d.x]).toEqual([0, 400, 700]);
  });

  it('ensureGap pushes the target only when too close', () => {
    const b = createBoard('B');
    const a = add(b, { x: 0 });
    const c = add(b, { x: 100 });
    link(b, a.id, c.id);
    ensureGap(b, a.id, c.id);
    expect(c.x).toBe(180 + GAP_MAIN);
    ensureGap(b, a.id, c.id);
    expect(c.x).toBe(180 + GAP_MAIN);
  });

  it('computes lane bands in order and finds lanes by position', () => {
    const b = createBoard('B');
    b.lanes = [
      { id: 'l2', name: 'Ops', order: 1, height: 300 },
      { id: 'l1', name: 'Customer', order: 0, height: 240 },
    ];
    expect(laneBands(b)).toEqual([
      { id: 'l1', start: 0, size: 240 },
      { id: 'l2', start: 240, size: 300 },
    ]);
    expect(laneAt(b, 100)).toBe('l1');
    expect(laneAt(b, 400)).toBe('l2');
    expect(laneAt(b, 900)).toBeNull();
    const n = makeNode(b, 'step');
    placeInLane(b, n, 'l2');
    expect(n.laneId).toBe('l2');
    expect(n.y).toBe(240 + (300 - 72) / 2);
  });

  it('fits a group around its members with padding', () => {
    const b = createBoard('B');
    const g = makeNode(b, 'group', { x: 0, y: 0 });
    b.nodes.push(g);
    add(b, { x: 100, y: 100, groupId: g.id });
    add(b, { x: 400, y: 200, groupId: g.id });
    fitGroup(b, g.id);
    expect(g).toMatchObject({ x: 100 - 32, y: 100 - 48, w: 400 + 180 - 100 + 64, h: 200 + 72 - 100 + 48 + 32 });
  });
});
