import { describe, expect, it } from 'vitest';
import { DurationError, formatDuration, parseDuration } from './duration';

describe('parseDuration', () => {
  it.each([
    ['30m', 30],
    ['2h', 120],
    ['1.5h', 90],
    ['1d', 480],
    ['1w', 2400],
    ['1d 2h', 600],
    ['2 hours 15 mins', 135],
    ['3 days', 1440],
    ['  45 min ', 45],
  ])('parses %s', (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes);
  });

  it('returns null for empty input', () => {
    expect(parseDuration('   ')).toBeNull();
  });

  it.each(['abc', '5', '2x', 'h2', '-3h'])('rejects %s', (input) => {
    expect(() => parseDuration(input)).toThrow(DurationError);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0m'],
    [45, '45m'],
    [90, '1h 30m'],
    [480, '1d'],
    [540, '1d 1h'],
    [2400, '1w'],
    [2890, '1w 1d'],
  ])('formats %d', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});
