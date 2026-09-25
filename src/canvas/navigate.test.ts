import { describe, expect, it } from 'vitest';
import { addStep } from '../ops/steps';
import { chain } from '../ops/testkit';
import { nearestInDirection } from './navigate';

describe('nearestInDirection', () => {
  it('moves along the flow and across to nearby steps', () => {
    const { b, ids } = chain(['A', 'B', 'C']);
    const d = addStep(b, { title: 'D', x: 252, y: 200 });
    expect(nearestInDirection(b, ids[1], 'right')).toBe(ids[2]);
    expect(nearestInDirection(b, ids[1], 'left')).toBe(ids[0]);
    expect(nearestInDirection(b, ids[1], 'down')).toBe(d);
    expect(nearestInDirection(b, ids[1], 'up')).toBeNull();
  });

  it('prefers a connected step over a slightly closer unconnected one', () => {
    const { b, ids } = chain(['A', 'B']);
    const near = addStep(b, { title: 'Near', x: 230, y: 90 });
    expect(nearestInDirection(b, ids[0], 'right')).toBe(ids[1]);
    expect(near).toBeTruthy();
  });
});
