import { useStore, ViewportPortal } from '@xyflow/react';
import { useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { innerSegments, segmentAxis } from '../layout/route/polyline';
import type { BoardEdge } from '../model/types';
import { useFlow } from '../store/store';
import type { Route } from './arrowRoutes';
import { handlePoints } from './reshape';
import { soleEdge } from './selection';
import { useArrowDrag } from './useArrowDrag';

const HANDLE = 8;
const BAR_LONG = 16;
const BAR_SHORT = 6;

// why: clicks bubble through the portal to React Flow's edge wrapper, which would open the label editor or Shift-deselect.
// A bar lets its double-click through, because it sits where users double-click an arrow to label it.
const swallow = (e: ReactMouseEvent) => e.stopPropagation();

export function ArrowHandles({ edge, route }: { edge: BoardEdge; route: Route }) {
  const only = useFlow((s) => soleEdge(s.edgeSelection, s.selection) === edge.id);
  const scale = useStore((s) => Math.max(1 / s.transform[2], 1));
  const points = useMemo(() => handlePoints(route.points), [route]);
  const drag = useArrowDrag(edge, points);
  if (!only) return null;
  const size = HANDLE * scale;
  const ends = [
    { end: 'source', at: points[0] },
    { end: 'target', at: points[points.length - 1] },
  ] as const;
  // why: ADR-0014
  return (
    <ViewportPortal>
      <svg className="fs-arrow-handles" width={1} height={1} onClick={swallow}>
        {innerSegments(points).map((i) => {
          const a = points[i];
          const b = points[i + 1];
          const horizontal = segmentAxis(a, b) === 'x';
          const w = (horizontal ? BAR_LONG : BAR_SHORT) * scale;
          const h = (horizontal ? BAR_SHORT : BAR_LONG) * scale;
          return (
            <rect
              key={`segment${i}`}
              className={`fs-arrow-bar ${horizontal ? 'is-horizontal' : 'is-vertical'}`}
              data-edge={edge.id}
              data-segment={i}
              x={(a.x + b.x) / 2 - w / 2}
              y={(a.y + b.y) / 2 - h / 2}
              width={w}
              height={h}
              rx={(BAR_SHORT / 2) * scale}
              {...drag.segment(i)}
            />
          );
        })}
        {edge.bends.map((p, i) => (
          <rect key={`bend${i}`} className="fs-arrow-bend" data-edge={edge.id} data-bend={i} x={p.x - size / 2} y={p.y - size / 2} width={size} height={size} rx={2 * scale} onDoubleClick={swallow} {...drag.bend(i)} />
        ))}
        {ends.map(({ end, at }) => {
          const dragging = drag.ghost?.end === end;
          const p = dragging && drag.ghost ? drag.ghost.at : at;
          return <circle key={end} className={`fs-arrow-end${dragging ? ' is-dragging' : ''}`} data-edge={edge.id} data-end={end} cx={p.x} cy={p.y} r={size / 2} onDoubleClick={swallow} {...drag.end(end)} />;
        })}
      </svg>
    </ViewportPortal>
  );
}
