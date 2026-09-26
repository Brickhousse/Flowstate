import { ViewportPortal } from '@xyflow/react';
import { useStore } from 'zustand';
import { assistOverlay } from './overlay';
import type { Guide } from './snap';

function GuideMark({ g }: { g: Guide }) {
  if (g.kind === 'line') {
    return g.axis === 'x' ? (
      <line className="fs-guide" x1={g.at} x2={g.at} y1={g.from} y2={g.to} />
    ) : (
      <line className="fs-guide" x1={g.from} x2={g.to} y1={g.at} y2={g.at} />
    );
  }
  const d =
    g.axis === 'x'
      ? `M${g.start} ${g.cross - 5}V${g.cross + 5}M${g.start} ${g.cross}H${g.end}M${g.end} ${g.cross - 5}V${g.cross + 5}`
      : `M${g.cross - 5} ${g.start}H${g.cross + 5}M${g.cross} ${g.start}V${g.end}M${g.cross - 5} ${g.end}H${g.cross + 5}`;
  return <path className="fs-guide fs-gap" d={d} />;
}

export function GuidesOverlay() {
  const guides = useStore(assistOverlay, (s) => s.guides);
  const ghosts = useStore(assistOverlay, (s) => s.ghosts);
  if (!guides.length && !ghosts.length) return null;
  return (
    <ViewportPortal>
      <svg className="fs-guides" width={1} height={1}>
        {ghosts.map((r, i) => (
          <rect key={`ghost${i}`} className="fs-ghost" x={r.x} y={r.y} width={r.w} height={r.h} rx={8} />
        ))}
        {guides.map((g, i) => (
          <GuideMark key={`guide${i}`} g={g} />
        ))}
      </svg>
    </ViewportPortal>
  );
}
