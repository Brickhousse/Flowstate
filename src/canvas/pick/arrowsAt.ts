import type { XY } from '../../model/types';
import { nearestOnSegment } from '../../layout/route/path';
import type { Route } from '../arrowRoutes';

export const ARROW_HIT_WIDTH = 18;

function distanceToSegment(p: XY, a: XY, b: XY): number {
  const n = nearestOnSegment(a, b, p);
  return Math.hypot(p.x - n.x, p.y - n.y);
}

function near(points: readonly XY[], p: XY, tolerance: number): boolean {
  if (points.length === 1) return distanceToSegment(p, points[0], points[0]) <= tolerance;
  for (let i = 1; i < points.length; i++) if (distanceToSegment(p, points[i - 1], points[i]) <= tolerance) return true;
  return false;
}

export function arrowsAt(routes: ReadonlyMap<string, Route>, order: readonly string[], point: XY, tolerance: number): string[] {
  const hits: string[] = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const r = routes.get(order[i]);
    if (r && near(r.points, point, tolerance)) hits.push(order[i]);
  }
  return hits;
}

// why: ADR-0016
export function pickTolerance(zoom: number): number {
  return (ARROW_HIT_WIDTH / 2) * Math.max(1, 1 / zoom);
}

export function stackOrder(edges: readonly { id: string; zIndex?: number }[]): string[] {
  return [...edges].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map((e) => e.id);
}

// why: ADR-0016
export function reportedFirst(reported: string, hits: readonly string[]): string[] {
  return [reported, ...hits.filter((id) => id !== reported)];
}
