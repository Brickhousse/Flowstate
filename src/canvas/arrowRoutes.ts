import { shiftLines, spreadPorts, type ArrowEnds } from '../layout/route/apart';
import { elbow } from '../layout/route/elbow';
import { halfway } from '../layout/route/path';
import { edgeSides, portAt } from '../layout/route/ports';
import { samePoints, simplify } from '../layout/route/polyline';
import { through } from '../layout/route/through';
import type { Board, BoardEdge, BoardNode, Direction, XY } from '../model/types';
import { cached, type RenderCache } from './renderCache';

export interface Route {
  points: XY[];
  label: XY;
}

export type RouteCache = RenderCache<Route>;

type Link = { e: BoardEdge; s: BoardNode; t: BoardNode };

const MIDDLE = { source: 0.5, target: 0.5 };

function draw({ e, s, t }: Link, direction: Direction, at: { source: number; target: number }): Route {
  const sides = edgeSides(direction, e);
  const from = portAt(s, sides.source, at.source);
  const to = portAt(t, sides.target, at.target);
  const points = e.bends.length ? through(from, sides.source, e.bends, to, sides.target) : elbow(from, sides.source, to, sides.target);
  return { points, label: halfway(points) };
}

function linksOf(board: Board): Link[] {
  const nodes = new Map(board.nodes.map((n) => [n.id, n]));
  const links: Link[] = [];
  for (const e of board.edges) {
    const s = nodes.get(e.source);
    const t = nodes.get(e.target);
    if (s && t) links.push({ e, s, t });
  }
  return links;
}

function ends({ e, s, t }: Link, direction: Direction): ArrowEnds {
  const sides = edgeSides(direction, e);
  return { id: e.id, separate: e.separate, source: { node: s.id, side: sides.source, box: s }, target: { node: t.id, side: sides.target, box: t } };
}

export function arrowRoutes(board: Board, cache: RouteCache): Map<string, Route> {
  const links = linksOf(board);
  // why: the board-wide pass runs only when some arrow is separate (ADR-0015).
  const spots = links.some((l) => l.e.separate) ? spreadPorts(links.map((l) => ends(l, board.direction))) : null;
  const out = new Map<string, Route>();
  for (const link of links) {
    const at = spots?.get(link.e.id) ?? MIDDLE;
    out.set(link.e.id, cached(cache, link.e.id, [link.e, link.s, link.t, board.direction, at.source, at.target], () => draw(link, board.direction, at)));
  }
  if (!spots) return out;
  const movable = links.filter((l) => l.e.separate && !l.e.bends.length).map((l) => l.e.id);
  const plain = new Map([...out].map(([id, r]) => [id, simplify(r.points)]));
  for (const [id, points] of shiftLines(plain, movable)) {
    const base = plain.get(id);
    // why: simplifying drops the stub-end points, which would change the corner radii of an arrow that did not move.
    if (base && samePoints(base, points)) continue;
    const key = `${id}|apart`;
    const hit = cache.get(key);
    const route = hit && samePoints(hit.value.points, points) ? hit.value : { points, label: halfway(points) };
    cache.set(key, { deps: [], value: route });
    out.set(id, route);
  }
  return out;
}
