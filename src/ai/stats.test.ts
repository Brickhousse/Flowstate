import { describe, expect, it } from 'vitest';
import { describeStats, mergeStats } from './stats';

describe('stats', () => {
  it('merges and describes', () => {
    const s = mergeStats({ stepsAdded: 1, arrowsAdded: 1 }, { stepsAdded: 2, flagsAdded: 1 });
    expect(s).toEqual({ stepsAdded: 3, arrowsAdded: 1, flagsAdded: 1 });
    expect(describeStats(s)).toBe('3 steps added, 1 arrow added, 1 flag');
    expect(describeStats({ boardsCreated: 1, tidied: 1 })).toBe('New board, tidied');
    expect(describeStats({})).toBe('');
  });
});
