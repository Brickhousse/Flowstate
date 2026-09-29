import type { InternalNode, Node } from '@xyflow/react';
import { isEdgeVisible as reference } from '@xyflow/system';
import { describe, expect, it } from 'vitest';
import { isEdgeVisible, nodeBox, overlapArea } from './edgeVisible';

function internalNode(x: number, y: number, size: { measured?: [number, number]; width?: number; initial?: number }): InternalNode {
  const userNode: Node = {
    id: `${x},${y}`,
    position: { x, y },
    data: {},
    ...(size.width !== undefined ? { width: size.width, height: size.width } : {}),
    ...(size.initial !== undefined ? { initialWidth: size.initial, initialHeight: size.initial } : {}),
  };
  return { ...userNode, measured: { width: size.measured?.[0], height: size.measured?.[1] }, internals: { positionAbsolute: { x, y }, z: 0, userNode } };
}

// A deterministic generator, so a failure names its seed.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const cases = [
  { name: 'measured', size: { measured: [180, 72] as [number, number] } },
  { name: 'width only', size: { width: 150 } },
  { name: 'initial only', size: { initial: 48 } },
  { name: 'no size', size: {} },
];

describe('isEdgeVisible agrees with @xyflow/system', () => {
  for (const { name, size } of cases) {
    it(`for nodes with ${name}, over random panes`, () => {
      const rnd = lcg(7);
      for (let i = 0; i < 2000; i++) {
        const source = internalNode(rnd() * 4000 - 2000, rnd() * 4000 - 2000, size);
        const target = internalNode(rnd() * 4000 - 2000, rnd() * 4000 - 2000, size);
        const zoom = 0.05 + rnd() * 3.95;
        const pane = { width: rnd() * 2000, height: rnd() * 1200, transform: [rnd() * 6000 - 3000, rnd() * 6000 - 3000, zoom] as [number, number, number] };
        const args = { sourceNode: source, targetNode: target, ...pane };
        expect(isEdgeVisible(args), `case ${i}`).toBe(reference(args));
      }
    });
  }

  it('at the exact edges of the two-box bounds, pane top touching the box bottom', () => {
    const a = internalNode(0, 0, { measured: [180, 72] });
    const b = internalNode(400, 0, { measured: [180, 72] });
    for (const top of [71, 71.5, 71.999, 72, 72.001, 73]) {
      const args = { sourceNode: a, targetNode: b, width: 1600, height: 900, transform: [0, -top, 1] as [number, number, number] };
      expect(isEdgeVisible(args), `top ${top}`).toBe(reference(args));
      expect(isEdgeVisible(args), `top ${top}`).toBe(top < 72);
    }
  });

  it('gives a zero-size box one unit, as the reference does', () => {
    const a = internalNode(100, 100, {});
    const args = { sourceNode: a, targetNode: a, width: 50, height: 50, transform: [-100, -100, 1] as [number, number, number] };
    expect(isEdgeVisible(args)).toBe(true);
    expect(reference(args)).toBe(true);
    const off = { ...args, transform: [-101, -101, 1] as [number, number, number] };
    expect(isEdgeVisible(off)).toBe(false);
    expect(reference(off)).toBe(false);
  });
});

describe('nodeBox', () => {
  it('prefers the measured size, then width, then the initial width', () => {
    expect(nodeBox(internalNode(1, 2, { measured: [10, 20], width: 30, initial: 40 }))).toEqual({ x: 1, y: 2, x2: 11, y2: 22 });
    expect(nodeBox(internalNode(1, 2, { width: 30, initial: 40 }))).toEqual({ x: 1, y: 2, x2: 31, y2: 32 });
    expect(nodeBox(internalNode(1, 2, { initial: 40 }))).toEqual({ x: 1, y: 2, x2: 41, y2: 42 });
    expect(nodeBox(internalNode(1, 2, {}))).toEqual({ x: 1, y: 2, x2: 1, y2: 2 });
  });
});

describe('overlapArea', () => {
  it('counts any positive overlap as at least one, and touching as none', () => {
    expect(overlapArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 9.999, y: 9.999, width: 10, height: 10 })).toBe(1);
    expect(overlapArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(0);
    expect(overlapArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(25);
  });
});
