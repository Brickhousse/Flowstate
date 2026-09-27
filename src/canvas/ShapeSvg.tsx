import type { Shape } from '../model/types';

const INSET = 1;

function roundedRect(x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.min(radius, w / 2, h / 2);
  return `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
}

export function shapePath(shape: Shape, w: number, h: number): string {
  const i = INSET;
  const W = w - i;
  const H = h - i;
  switch (shape) {
    case 'decision':
      return `M${w / 2},${i} L${W},${h / 2} L${w / 2},${H} L${i},${h / 2} Z`;
    case 'terminal':
      return roundedRect(i, i, w - 2 * i, h - 2 * i, h / 2);
    case 'data': {
      const s = Math.min(18, w * 0.12);
      return `M${i + s},${i} L${W},${i} L${W - s},${H} L${i},${H} Z`;
    }
    case 'document': {
      const wave = Math.min(10, h * 0.14);
      return `M${i},${i} H${W} V${H - wave} Q${w * 0.75},${H - 2 * wave} ${w / 2},${H - wave} T${i},${H - wave} Z`;
    }
    case 'database': {
      const ry = Math.min(10, h * 0.12);
      const rx = (w - 2 * i) / 2;
      return `M${i},${i + ry} A${rx},${ry} 0 0 1 ${W},${i + ry} V${H - ry} A${rx},${ry} 0 0 1 ${i},${H - ry} Z`;
    }
    case 'preparation': {
      const s = Math.min(20, w * 0.14);
      return `M${i + s},${i} H${W - s} L${W},${h / 2} L${W - s},${H} H${i + s} L${i},${h / 2} Z`;
    }
    case 'connector': {
      const r = Math.min(w, h) / 2 - i;
      return `M${w / 2 - r},${h / 2} A${r},${r} 0 1 0 ${w / 2 + r},${h / 2} A${r},${r} 0 1 0 ${w / 2 - r},${h / 2} Z`;
    }
    case 'sticky': {
      const f = Math.min(16, w * 0.12);
      return `M${i},${i} H${W} V${H - f} L${W - f},${H} H${i} Z`;
    }
    default:
      return roundedRect(i, i, w - 2 * i, h - 2 * i, 12);
  }
}

function databaseLip(w: number, h: number): string {
  const ry = Math.min(10, h * 0.12);
  return `M${INSET},${INSET + ry} A${(w - 2 * INSET) / 2},${ry} 0 0 0 ${w - INSET},${INSET + ry}`;
}

export function ShapeSvg({ shape, w, h, fill }: { shape: Shape; w: number; h: number; fill?: string }) {
  return (
    <svg className="fs-shape" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path className="fs-shape-body" d={shapePath(shape, w, h)} style={fill ? { fill } : undefined} />
      {shape === 'database' && <path className="fs-shape-lip" d={databaseLip(w, h)} />}
    </svg>
  );
}

export function ShapeIcon({ shape }: { shape: Shape }) {
  const w = 22;
  const h = shape === 'decision' || shape === 'connector' || shape === 'database' ? 18 : 15;
  return (
    <svg className="fs-shape-icon" width={w} height={18} viewBox={`0 ${(h - 18) / 2} ${w} 18`} aria-hidden>
      <path d={shapePath(shape, w, h)} />
      {shape === 'database' && <path d={databaseLip(w, h)} fill="none" />}
    </svg>
  );
}
