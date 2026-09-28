import { describe, expect, it } from 'vitest';
import { halfway, roundedPath } from './path';

describe('roundedPath', () => {
  it('draws a straight line with no corners', () => {
    expect(roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe('M0 0L100 0');
  });

  it('rounds a corner by the radius, or by half the shorter leg', () => {
    expect(roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 14)).toBe('M0 0L 86,0Q 100,0 100,14L100 100');
    expect(roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 100 }], 14)).toBe('M0 0L 5,0Q 10,0 10,5L10 100');
  });
});

describe('halfway', () => {
  it('finds the point at half the length, not the middle corner', () => {
    expect(halfway([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 300 }])).toEqual({ x: 100, y: 100 });
  });

  it('handles a single point and zero-length pieces', () => {
    expect(halfway([{ x: 5, y: 5 }])).toEqual({ x: 5, y: 5 });
    expect(halfway([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 40, y: 0 }])).toEqual({ x: 20, y: 0 });
  });
});
