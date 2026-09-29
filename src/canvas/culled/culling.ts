import type { Box } from '@xyflow/react';
import type { Route } from '../arrowRoutes';
import { boundsOfBoxes, boxToRect, isEdgeVisible, nodeBox, overlapArea, paneRect, type NodeBoxSource, type Pane } from './edgeVisible';

export interface ArrowLink {
  id: string;
  source: string;
  target: string;
}

export type NodeBoxes = ReadonlyMap<string, NodeBoxSource>;

const boxes = new WeakMap<Route, Box>();
const NONE: never[] = [];

export function routeBox(route: Route): Box {
  const hit = boxes.get(route);
  if (hit) return hit;
  const box = { x: Infinity, y: Infinity, x2: -Infinity, y2: -Infinity };
  for (const p of route.points) {
    box.x = Math.min(box.x, p.x);
    box.y = Math.min(box.y, p.y);
    box.x2 = Math.max(box.x2, p.x);
    box.y2 = Math.max(box.y2, p.y);
  }
  if (box.x === box.x2) box.x2 += 1;
  if (box.y === box.y2) box.y2 += 1;
  boxes.set(route, box);
  return box;
}

function within(inner: Box, outer: Box): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x2 <= outer.x2 && inner.y2 <= outer.y2;
}

// why: React Flow culls by the two boxes, so only an arrow whose route leaves them can be culled while on screen.
export function overlayCandidates<T extends ArrowLink>(arrows: readonly T[], routes: ReadonlyMap<string, Route>, nodes: NodeBoxes): T[] {
  return arrows.filter((a) => {
    const route = routes.get(a.id);
    const s = nodes.get(a.source);
    const t = nodes.get(a.target);
    return !!route && !!s && !!t && !within(routeBox(route), boundsOfBoxes(nodeBox(s), nodeBox(t)));
  });
}

export function culledOnScreen<T extends ArrowLink>(candidates: readonly T[], routes: ReadonlyMap<string, Route>, nodes: NodeBoxes, pane: Pane): T[] {
  if (!pane.width || !pane.height) return NONE;
  const view = paneRect(pane);
  const out = candidates.filter((a) => {
    const route = routes.get(a.id);
    const sourceNode = nodes.get(a.source);
    const targetNode = nodes.get(a.target);
    if (!route || !sourceNode || !targetNode || overlapArea(view, boxToRect(routeBox(route))) <= 0) return false;
    return !isEdgeVisible({ sourceNode, targetNode, width: pane.width, height: pane.height, transform: pane.transform });
  });
  return out.length ? out : NONE;
}
