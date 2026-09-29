import { describe, expect, it } from 'vitest';
import { crossRowBoard, detourArrows, routingBoard, separateCrossings, separateSkips } from '../../tests/e2e/routingBoards';
import { simplify } from '../layout/route/polyline';
import { createBoard } from '../model/factory';
import type { Board, XY } from '../model/types';
import { arrowRoutes, type RouteCache } from './arrowRoutes';
import { overlayCandidates } from './culled/culling';
import type { NodeBoxSource } from './culled/edgeVisible';

const samePoints = (a: XY[], b: XY[]) => a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);

function shiftedArrows(b: Board): string[] {
  const cache: RouteCache = new Map();
  const routes = arrowRoutes(b, cache);
  return b.edges.filter((e) => e.separate && !samePoints(simplify(routes.get(e.id)!.points), simplify(cache.get(e.id)!.value.points))).map((e) => e.id);
}

describe('perf routing boards', () => {
  it('builds 200 steps and 200 arrows in both variants', () => {
    for (const build of [routingBoard, crossRowBoard]) {
      const b = createBoard('B');
      build(b);
      expect([b.nodes.length, b.edges.length]).toEqual([200, 200]);
    }
  });

  it('marks 20 arrows separate on each board', () => {
    const skips = createBoard('B');
    routingBoard(skips);
    separateSkips(skips);
    const crossings = createBoard('B');
    crossRowBoard(crossings);
    separateCrossings(crossings);
    expect(skips.edges.filter((e) => e.separate)).toHaveLength(20);
    expect(crossings.edges.filter((e) => e.separate)).toHaveLength(20);
  });

  it('shifts every separate arrow on the cross-row board and none on the routing board', () => {
    const skips = createBoard('B');
    routingBoard(skips);
    separateSkips(skips);
    const crossings = createBoard('B');
    crossRowBoard(crossings);
    separateCrossings(crossings);
    expect(shiftedArrows(skips)).toHaveLength(0);
    expect(shiftedArrows(crossings)).toHaveLength(20);
  });

  it('gives 20 arrows a detour that leaves the box React Flow culls by, and no other arrow one', () => {
    const b = createBoard('B');
    routingBoard(b);
    separateSkips(b);
    detourArrows(b);
    expect(b.edges.filter((e) => e.bends.length)).toHaveLength(20);
    const nodes = new Map<string, NodeBoxSource>(b.nodes.map((n) => [n.id, { internals: { positionAbsolute: { x: n.x, y: n.y } }, width: n.w, height: n.h }]));
    const candidates = overlayCandidates(b.edges, arrowRoutes(b, new Map()), nodes);
    expect(candidates.map((e) => e.id).sort()).toEqual(b.edges.filter((e) => e.bends.length).map((e) => e.id).sort());
  });
});
