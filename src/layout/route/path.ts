import type { XY } from '../../model/types';
import { CORNER_RADIUS } from './ports';

// why: Math.sqrt of Math.pow, not Math.hypot, to round exactly as getSmoothStepPath does.
const distance = (a: XY, b: XY) => Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));

function corner(a: XY, b: XY, c: XY, size: number): string {
  const r = Math.min(distance(a, b) / 2, distance(b, c) / 2, size);
  const { x, y } = b;
  if ((a.x === x && x === c.x) || (a.y === y && y === c.y)) return `L${x} ${y}`;
  if (a.y === y) {
    const xDir = a.x < c.x ? -1 : 1;
    const yDir = a.y < c.y ? 1 : -1;
    return `L ${x + r * xDir},${y}Q ${x},${y} ${x},${y + r * yDir}`;
  }
  const xDir = a.x < c.x ? 1 : -1;
  const yDir = a.y < c.y ? -1 : 1;
  return `L ${x},${y + r * yDir}Q ${x},${y} ${x + r * xDir},${y}`;
}

export function roundedPath(points: XY[], radius = CORNER_RADIUS): string {
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) d += corner(points[i - 1], points[i], points[i + 1], radius);
  const end = points[points.length - 1];
  return `${d}L${end.x} ${end.y}`;
}

export function nearestOnSegment(a: XY, b: XY, p: XY): XY {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function halfway(points: XY[]): XY {
  const lengths = points.slice(1).map((p, i) => distance(points[i], p));
  let left = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] > 0 && left <= lengths[i]) {
      const t = left / lengths[i];
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
    }
    left -= lengths[i];
  }
  return points[0];
}
