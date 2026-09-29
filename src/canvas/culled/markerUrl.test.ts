import { MarkerType, type EdgeMarkerType } from '@xyflow/react';
import { getMarkerId } from '@xyflow/system';
import { describe, expect, it } from 'vitest';
import { markerUrl } from './markerUrl';

const markers: EdgeMarkerType[] = [
  { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#123456' },
  { type: MarkerType.Arrow, color: undefined },
  { type: MarkerType.Arrow, strokeWidth: 2, orient: 'auto', markerUnits: 'userSpaceOnUse' },
  'head',
];

describe('markerUrl agrees with @xyflow/system', () => {
  for (const marker of markers) {
    for (const rfId of ['1', 'flow-2', '']) {
      it(`for ${JSON.stringify(marker)} in flow "${rfId}"`, () => {
        expect(markerUrl(marker, rfId)).toBe(`url('#${getMarkerId(marker, rfId)}')`);
      });
    }
  }

  it('gives nothing for no marker', () => {
    expect(markerUrl(undefined, '1')).toBeUndefined();
  });
});
