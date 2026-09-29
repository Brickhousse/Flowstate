import { MarkerType } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { markerUrl } from './markerUrl';

describe('markerUrl', () => {
  it('names the marker by its sorted fields under the flow id, as React Flow does', () => {
    expect(markerUrl({ type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#123456' }, '1')).toBe("url('#1__color=#123456&height=16&type=arrowclosed&width=16')");
  });

  it('keeps an undefined field, and drops the prefix for an empty flow id', () => {
    expect(markerUrl({ type: MarkerType.Arrow, color: undefined }, '')).toBe("url('#color=undefined&type=arrow')");
  });

  it('passes a string marker through and gives nothing for none', () => {
    expect(markerUrl('head', '1')).toBe("url('#head')");
    expect(markerUrl(undefined, '1')).toBeUndefined();
  });
});
