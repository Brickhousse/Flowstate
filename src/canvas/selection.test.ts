import { describe, expect, it } from 'vitest';
import { soleEdge } from './selection';

describe('soleEdge', () => {
  it('is the one selected arrow when nothing else is selected', () => {
    expect(soleEdge(['e4'], [])).toBe('e4');
  });

  it('is null when no arrow is selected', () => {
    expect(soleEdge([], [])).toBeNull();
  });

  it('is null when more than one arrow is selected', () => {
    expect(soleEdge(['e4', 'e5'], [])).toBeNull();
  });

  it('is null when a node is also selected', () => {
    expect(soleEdge(['e4'], ['s1'])).toBeNull();
  });
});
