import type { Transform } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import type { Route } from '../arrowRoutes';
import { culledOnScreen, overlayCandidates, routeBox } from './culling';
import type { NodeBoxSource } from './edgeVisible';

function step(x: number, y: number): NodeBoxSource {
  return { internals: { positionAbsolute: { x, y } }, measured: { width: 180, height: 72 } };
}

const route = (points: { x: number; y: number }[]): Route => ({ points, label: points[0] });

// A at (0,0) and B at (400,0): the box React Flow culls by is (0,0)-(580,72).
const nodes = new Map<string, NodeBoxSource>([
  ['a', step(0, 0)],
  ['b', step(400, 0)],
]);
const straight = route([{ x: 185.5, y: 36 }, { x: 394.5, y: 36 }]);
const detour = route([{ x: 185.5, y: 36 }, { x: 300, y: 36 }, { x: 300, y: 2000 }, { x: 350, y: 2000 }, { x: 350, y: 36 }, { x: 394.5, y: 36 }]);
const arrows = [
  { id: 'straight', source: 'a', target: 'b' },
  { id: 'detour', source: 'a', target: 'b' },
  { id: 'unrouted', source: 'a', target: 'b' },
  { id: 'orphan', source: 'a', target: 'gone' },
];
const routes = new Map([
  ['straight', straight],
  ['detour', detour],
  ['orphan', detour],
]);

function pane(top: number, left = 0, zoom = 1): { width: number; height: number; transform: Transform } {
  return { width: 1600, height: 900, transform: [-left * zoom, -top * zoom, zoom] };
}

describe('routeBox', () => {
  it('bounds the points, and is cached on the route object', () => {
    expect(routeBox(detour)).toEqual({ x: 185.5, y: 36, x2: 394.5, y2: 2000 });
    expect(routeBox(detour)).toBe(routeBox(detour));
    expect(routeBox(route([...detour.points]))).not.toBe(routeBox(detour));
  });

  it('gives a flat route one unit of height, and a single point one unit each way', () => {
    expect(routeBox(straight)).toEqual({ x: 185.5, y: 36, x2: 394.5, y2: 37 });
    expect(routeBox(route([{ x: 5, y: 5 }]))).toEqual({ x: 5, y: 5, x2: 6, y2: 6 });
  });
});

describe('overlayCandidates', () => {
  it('keeps only arrows with a route that leaves the two boxes and both boxes present', () => {
    expect(overlayCandidates(arrows, routes, nodes).map((a) => a.id)).toEqual(['detour']);
  });

  it('treats a route that leaves the boxes by any amount as a candidate', () => {
    const above = route([{ x: 90, y: -5.5 }, { x: 90, y: -30 }, { x: 490, y: -30 }, { x: 490, y: -5.5 }]);
    expect(overlayCandidates([{ id: 'up', source: 'a', target: 'b' }], new Map([['up', above]]), nodes)).toHaveLength(1);
    const inside = route([{ x: 185.5, y: 36 }, { x: 290, y: 36 }, { x: 290, y: 72 }, { x: 300, y: 72 }, { x: 300, y: 36 }, { x: 394.5, y: 36 }]);
    expect(overlayCandidates([{ id: 'in', source: 'a', target: 'b' }], new Map([['in', inside]]), nodes)).toHaveLength(0);
  });
});

describe('culledOnScreen', () => {
  const candidates = overlayCandidates(arrows, routes, nodes);

  it('lists a culled arrow whose detour is on screen, and drops it once React Flow draws it', () => {
    expect(culledOnScreen(candidates, routes, nodes, pane(1500)).map((a) => a.id)).toEqual(['detour']);
    expect(culledOnScreen(candidates, routes, nodes, pane(72)).map((a) => a.id)).toEqual(['detour']);
    expect(culledOnScreen(candidates, routes, nodes, pane(71.999))).toEqual([]);
    expect(culledOnScreen(candidates, routes, nodes, pane(0))).toEqual([]);
  });

  it('lists nothing when neither the boxes nor the route are on screen', () => {
    expect(culledOnScreen(candidates, routes, nodes, pane(2001))).toEqual([]);
    expect(culledOnScreen(candidates, routes, nodes, pane(1500, 400))).toEqual([]);
    expect(culledOnScreen(candidates, routes, nodes, pane(1500, -1600))).toEqual([]);
  });

  it('applies the zoom to the pane', () => {
    expect(culledOnScreen(candidates, routes, nodes, pane(1500, 0, 0.5)).map((a) => a.id)).toEqual(['detour']);
    expect(culledOnScreen(candidates, routes, nodes, pane(50, 0, 0.5))).toEqual([]);
    expect(culledOnScreen(candidates, routes, nodes, pane(1990, 340, 4)).map((a) => a.id)).toEqual(['detour']);
  });

  it('draws nothing while the pane has no size, as React Flow draws nothing then', () => {
    expect(culledOnScreen(candidates, routes, nodes, { width: 0, height: 900, transform: [0, -1500, 1] })).toEqual([]);
    expect(culledOnScreen(candidates, routes, nodes, { width: 1600, height: 0, transform: [0, -1500, 1] })).toEqual([]);
  });

  it('skips a candidate whose route or box has gone since it was chosen', () => {
    const stale = [{ id: 'detour', source: 'a', target: 'b' }, { id: 'orphan', source: 'a', target: 'gone' }];
    expect(culledOnScreen(stale, new Map(), nodes, pane(1500))).toEqual([]);
    expect(culledOnScreen(stale, routes, nodes, pane(1500)).map((a) => a.id)).toEqual(['detour']);
  });
});
