import { elbow } from '../layout/route/elbow';
import { halfway } from '../layout/route/path';
import { edgeSides, portAt } from '../layout/route/ports';
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

export function arrowRoutes(board: Board, cache: RouteCache): Map<string, Route> {
  const out = new Map<string, Route>();
  for (const link of linksOf(board)) {
    out.set(link.e.id, cached(cache, link.e.id, [link.e, link.s, link.t, board.direction], () => draw(link, board.direction, MIDDLE)));
  }
  return out;
}
