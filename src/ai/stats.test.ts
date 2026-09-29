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

  it('orders reopened flags after resolved flags', () => {
    expect(describeStats({ flagsResolved: 1, flagsReopened: 2 })).toBe('1 resolved, 2 reopened');
    expect(describeStats({ flagsReopened: 1 })).toBe('1 reopened');
  });

  it('describes redrawn arrows', () => {
    expect(describeStats({ arrowsUpdated: 1 })).toBe('1 arrow redrawn');
    expect(describeStats({ arrowsAdded: 1, arrowsUpdated: 2 })).toBe('1 arrow added, 2 arrows redrawn');
  });
});
