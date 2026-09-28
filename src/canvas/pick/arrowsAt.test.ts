import { describe, expect, it } from 'vitest';
import type { XY } from '../../model/types';
import type { Route } from '../arrowRoutes';
import { arrowsAt, pickTolerance, stackOrder } from './arrowsAt';

const route = (...points: XY[]): Route => ({ points, label: points[0] });

// Two arrows leaving the same side run together along y=36 until x=300, then part ways.
const routes = new Map<string, Route>([
  ['e1', route({ x: 185.5, y: 36 }, { x: 394.5, y: 36 })],
  ['e2', route({ x: 185.5, y: 36 }, { x: 300, y: 36 }, { x: 300, y: 336 }, { x: 394.5, y: 336 })],
  ['e3', route({ x: 0, y: 500 }, { x: 400, y: 500 })],
]);
const order = ['e1', 'e2', 'e3'];

describe('arrowsAt', () => {
  it('finds every arrow on a shared line, the one drawn last first', () => {
    expect(arrowsAt(routes, order, { x: 250, y: 36 }, 9)).toEqual(['e2', 'e1']);
    expect(arrowsAt(routes, ['e2', 'e1', 'e3'], { x: 250, y: 36 }, 9)).toEqual(['e1', 'e2']);
  });

  it('finds only the arrow near the point once the lines part', () => {
    expect(arrowsAt(routes, order, { x: 300, y: 200 }, 9)).toEqual(['e2']);
  });

  it('includes a point exactly at the tolerance and excludes one just past it', () => {
    expect(arrowsAt(routes, order, { x: 200, y: 509 }, 9)).toEqual(['e3']);
    expect(arrowsAt(routes, order, { x: 200, y: 509.5 }, 9)).toEqual([]);
  });

  it('reaches past an arrow end onto the side dot it starts from', () => {
    expect(arrowsAt(routes, order, { x: 181, y: 36 }, 9)).toEqual(['e2', 'e1']);
    expect(arrowsAt(routes, order, { x: 398, y: 336 }, 9)).toEqual(['e2']);
    expect(arrowsAt(routes, order, { x: 175, y: 36 }, 9)).toEqual([]);
  });

  it('skips ids with no route', () => {
    expect(arrowsAt(routes, ['gone', 'e3'], { x: 10, y: 500 }, 9)).toEqual(['e3']);
  });
});

describe('pickTolerance', () => {
  it('is half the hit stroke in board units at 100% zoom and above', () => {
    expect(pickTolerance(1)).toBe(9);
    expect(pickTolerance(2)).toBe(9);
  });

  it('keeps 9 screen pixels of reach below 100% zoom', () => {
    expect(pickTolerance(0.5)).toBe(18);
    expect(pickTolerance(0.25)).toBe(36);
  });

  it('turns a near miss at 100% into a hit when zoomed out', () => {
    const at = { x: 200, y: 514 };
    expect(arrowsAt(routes, order, at, pickTolerance(1))).toEqual([]);
    expect(arrowsAt(routes, order, at, pickTolerance(0.5))).toEqual(['e3']);
  });
});

describe('stackOrder', () => {
  it('keeps list order within a layer and draws higher layers later', () => {
    expect(stackOrder([{ id: 'a', zIndex: 1 }, { id: 'b' }, { id: 'c', zIndex: 0 }, { id: 'd', zIndex: 1 }])).toEqual(['b', 'c', 'a', 'd']);
  });
});
