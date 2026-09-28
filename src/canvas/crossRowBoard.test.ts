import { describe, expect, it } from 'vitest';
import { crossRowBoard, routingBoard, separateCrossings, separateSkips } from '../../tests/e2e/routingBoards';
import { simplify } from '../layout/route/through';
import { createBoard } from '../model/factory';
import type { Board, XY } from '../model/types';
import { arrowRoutes, type RouteCache } from './arrowRoutes';

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
});
