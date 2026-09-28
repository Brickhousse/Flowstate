import { describe, expect, it } from 'vitest';
import { STUB } from '../layout/route/ports';
import type { XY } from '../model/types';
import { bendReshape, reshapedBends, segmentReshape } from './reshape';

const p = (x: number, y: number): XY => ({ x, y });
const free = (v: number) => v;
const grid = (v: number) => Math.round(v / 20) * 20;

// Ports at (0,0) and (200,100), stubs 22 long, one vertical run at x=100: the handle points of an automatic S route.
const S_ROUTE = [p(0, 0), p(STUB, 0), p(100, 0), p(100, 100), p(200 - STUB, 100), p(200, 100)];

describe('segmentReshape', () => {
  it('slides a vertical segment across x and remembers where on the bar it was grabbed', () => {
    const r = segmentReshape(S_ROUTE, [], 2, p(103, 50));
    expect(r).toMatchObject({ kind: 'segment', index: 2, across: 'x', offset: -3 });
  });

  it('slides a horizontal segment across y', () => {
    const r = segmentReshape(S_ROUTE, [], 1, p(60, -2));
    expect(r).toMatchObject({ kind: 'segment', index: 1, across: 'y', offset: 2 });
  });
});

describe('reshapedBends for a segment', () => {
  it('moves the segment by the pointer distance, keeping the grab offset, and drops the stubs', () => {
    const r = segmentReshape(S_ROUTE, [], 2, p(103, 50));
    expect(reshapedBends(r, p(151, 80), free)).toEqual([p(148, 0), p(148, 100)]);
  });

  it('snaps the moved line, not the pointer', () => {
    const r = segmentReshape(S_ROUTE, [], 2, p(103, 50));
    expect(reshapedBends(r, p(151, 80), grid)).toEqual([p(140, 0), p(140, 100)]);
  });

  it('writes the captured bends when the result rebuilds the captured route', () => {
    const auto = segmentReshape(S_ROUTE, [], 2, p(100, 50));
    expect(reshapedBends(auto, p(105, 50), grid)).toBe(auto.bends);
    const shaped = [p(100, 0), p(100, 100)];
    const hand = segmentReshape(S_ROUTE, shaped, 2, p(100, 50));
    expect(reshapedBends(hand, p(100, 60), free)).toBe(shaped);
  });

  it('merges a segment dragged onto its neighbour line, so the route loses two corners', () => {
    const z = [p(0, 0), p(STUB, 0), p(100, 0), p(100, 50), p(150, 50), p(150, 100), p(200 - STUB, 100), p(200, 100)];
    const r = segmentReshape(z, [p(100, 0), p(100, 50), p(150, 50), p(150, 100)], 3, p(125, 50));
    expect(reshapedBends(r, p(125, 100), free)).toEqual([p(100, 0), p(100, 100)]);
    expect(reshapedBends(r, p(125, 0), free)).toEqual([p(150, 0), p(150, 100)]);
  });

  it('keeps the ports when the only bar of a straight arrow is dragged sideways', () => {
    const straight = [p(0, 0), p(STUB, 0), p(200 - STUB, 0), p(200, 0)];
    const r = segmentReshape(straight, [], 1, p(100, 0));
    expect(reshapedBends(r, p(100, 60), free)).toEqual([p(STUB, 60), p(200 - STUB, 60)]);
  });

  it('leaves the captured points untouched', () => {
    const points = S_ROUTE.map((q) => ({ ...q }));
    reshapedBends(segmentReshape(points, [], 2, p(100, 50)), p(150, 50), free);
    expect(points).toEqual(S_ROUTE);
  });
});

describe('reshapedBends for a bend', () => {
  const bends = [p(300, 36), p(300, 336)];

  it('moves only the grabbed bend, snapped, keeping the grab offset', () => {
    const r = bendReshape(bends, 0, p(302, 38));
    expect(r).toMatchObject({ kind: 'bend', index: 0, offset: p(-2, -2) });
    const out = reshapedBends(r, p(349, 15), grid);
    expect(out).toEqual([p(340, 20), p(300, 336)]);
    expect(out[1]).toBe(bends[1]);
  });

  it('moves the bend freely when snapping is off', () => {
    expect(reshapedBends(bendReshape(bends, 1, p(300, 336)), p(347, 313), free)).toEqual([p(300, 36), p(347, 313)]);
  });

  it('never mutates the captured bends', () => {
    const captured = bends.map((q) => ({ ...q }));
    reshapedBends(bendReshape(captured, 0, p(300, 36)), p(400, 100), free);
    expect(captured).toEqual(bends);
  });
});
