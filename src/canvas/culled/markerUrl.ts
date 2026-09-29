import type { EdgeMarkerType } from '@xyflow/react';

// why: the url React Flow's EdgeWrapper builds with getMarkerId, which @xyflow/react does not export (ADR-0018).
export function markerUrl(marker: EdgeMarkerType | undefined, rfId: string): string | undefined {
  if (!marker) return undefined;
  if (typeof marker === 'string') return `url('#${marker}')`;
  const fields = Object.entries(marker)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return `url('#${rfId ? `${rfId}__` : ''}${fields}')`;
}
