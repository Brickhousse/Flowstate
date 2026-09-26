import { describe, expect, it } from 'vitest';
import type { Rect } from '../../layout/geometry';
import { lockAxis, snapMove, snapResize, type Candidates, type SnapPrefs } from './snap';

const box = (x: number, y: number, w = 100, h = 50): Rect => ({ x, y, w, h });
const cands = (boxes: Rect[], yLines: number[] = [], xLines: number[] = []): Candidates => ({ boxes, xLines, yLines });
const ALL: SnapPrefs = { gridSnap: true, smartGuides: true, spacingGuides: true };
const GUIDES_ONLY: SnapPrefs = { gridSnap: false, smartGuides: true, spacingGuides: false };
const FREE = { alt: false, lock: null };

describe('snapMove', () => {
  it('snaps the top-left corner to the 20px grid when nothing is near', () => {
    expect(snapMove(box(113, 47), cands([]), ALL, 1, FREE)).toEqual({ dx: 7, dy: -7, guides: [] });
  });

  it('prefers a smart guide over the grid and reports the guide lines', () => {
    const r = snapMove(box(300, 3), cands([box(0, 0)]), ALL, 1, FREE);
    expect(r.dx).toBe(0);
    expect(r.dy).toBe(-3);
    expect(r.guides).toContainEqual({ kind: 'line', axis: 'y', at: 0, from: 0, to: 400 });
  });

  it('keeps the snap distance at 6 screen pixels whatever the zoom', () => {
    const target = cands([box(0, 0)]);
    expect(snapMove(box(300, 10), target, GUIDES_ONLY, 1, FREE).dy).toBe(0);
    expect(snapMove(box(300, 10), target, GUIDES_ONLY, 0.5, FREE).dy).toBe(-10);
    expect(snapMove(box(300, 5), target, GUIDES_ONLY, 1, FREE).dy).toBe(-5);
    expect(snapMove(box(300, 5), target, GUIDES_ONLY, 2, FREE).dy).toBe(0);
  });

  it('does nothing while Alt is held', () => {
    expect(snapMove(box(113, 3), cands([box(0, 0)]), ALL, 1, { alt: true, lock: null })).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('only snaps the free axis under an axis lock', () => {
    const r = snapMove(box(113, 3), cands([box(0, 0)]), ALL, 1, { alt: false, lock: 'x' });
    expect(r.dx).toBe(7);
    expect(r.dy).toBe(0);
  });

  it('matches an existing gap in the same row', () => {
    const r = snapMove(box(403, 0), cands([box(0, 0), box(200, 0)]), ALL, 1, FREE);
    expect(r.dx).toBe(-3);
    expect(r.guides).toContainEqual({ kind: 'gap', axis: 'x', start: 300, end: 400, cross: 25 });
    expect(r.guides).toContainEqual({ kind: 'gap', axis: 'x', start: 100, end: 200, cross: 25 });
  });

  it('centres between two neighbours with equal gaps', () => {
    const r = snapMove(box(203, 0), cands([box(0, 0), box(400, 0)]), ALL, 1, FREE);
    expect(r.dx).toBe(-3);
    expect(r.guides).toContainEqual({ kind: 'gap', axis: 'x', start: 100, end: 200, cross: 25 });
    expect(r.guides).toContainEqual({ kind: 'gap', axis: 'x', start: 300, end: 400, cross: 25 });
  });

  it('treats lane boundaries as guide lines', () => {
    const r = snapMove(box(0, 236), cands([], [240]), ALL, 1, FREE);
    expect(r.dy).toBe(4);
    expect(r.guides).toContainEqual({ kind: 'line', axis: 'y', at: 240, from: 0, to: 100 });
  });

  it('leaves the box alone when every assist is off', () => {
    const off: SnapPrefs = { gridSnap: false, smartGuides: false, spacingGuides: false };
    expect(snapMove(box(113, 3), cands([box(0, 0)]), off, 1, FREE)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('never returns negative zero', () => {
    const r = snapMove(box(-6, -6), cands([]), ALL, 1, FREE);
    expect(Object.is(r.dx, 6) && Object.is(r.dy, 6)).toBe(true);
    expect(Object.is(snapMove(box(0, 0), cands([]), ALL, 1, FREE).dx, 0)).toBe(true);
  });
});

describe('snapResize', () => {
  const MIN = { w: 40, h: 32 };
  const none = { left: false, right: false, top: false, bottom: false };

  it('snaps a dragged right edge to a neighbour line', () => {
    const r = snapResize({ x: -200, y: 100, w: 297, h: 50 }, { ...none, right: true }, cands([box(0, 0)]), ALL, 1, false, MIN);
    expect(r.rect).toEqual({ x: -200, y: 100, w: 300, h: 50 });
    expect(r.guides.some((g) => g.kind === 'line' && g.axis === 'x' && g.at === 100)).toBe(true);
  });

  it('falls back to the grid for the dragged edge only', () => {
    expect(snapResize({ x: 3, y: 0, w: 130, h: 47 }, { ...none, right: true, bottom: true }, cands([]), ALL, 1, false, MIN).rect).toEqual({ x: 3, y: 0, w: 137, h: 40 });
  });

  it('moves the left edge and keeps the right edge fixed', () => {
    expect(snapResize({ x: 97, y: 0, w: 103, h: 50 }, { ...none, left: true }, cands([box(0, 200)]), ALL, 1, false, MIN).rect).toEqual({ x: 100, y: 0, w: 100, h: 50 });
  });

  it('refuses a snap that would shrink below the minimum size', () => {
    expect(snapResize({ x: 97, y: 0, w: 42, h: 50 }, { ...none, left: true }, cands([box(100, 200)]), ALL, 1, false, MIN).rect).toEqual({ x: 97, y: 0, w: 42, h: 50 });
  });

  it('does nothing while Alt is held', () => {
    expect(snapResize({ x: 0, y: 0, w: 133, h: 50 }, { ...none, right: true }, cands([]), ALL, 1, true, MIN).rect).toEqual({ x: 0, y: 0, w: 133, h: 50 });
  });
});

describe('lockAxis', () => {
  it('locks to the axis with the larger movement, x on a tie', () => {
    expect(lockAxis(10, -3)).toBe('x');
    expect(lockAxis(2, -9)).toBe('y');
    expect(lockAxis(5, 5)).toBe('x');
  });
});
