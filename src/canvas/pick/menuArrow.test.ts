import { describe, expect, it } from 'vitest';
import { menuArrow } from './menuArrow';

const never = () => {
  throw new Error('hit test should not run');
};

describe('menuArrow', () => {
  it('takes a handle, label or bend square at its word, bend included', () => {
    expect(menuArrow({ on: 'named', edgeId: 'e1', bend: 2 }, never, [])).toEqual({ edgeId: 'e1', bend: 2 });
    expect(menuArrow({ on: 'named', edgeId: 'e1', bend: null }, never, ['e2'])).toEqual({ edgeId: 'e1', bend: null });
  });

  it('takes the arrow React Flow reports on a line, unless a selected arrow is also under the pointer', () => {
    expect(menuArrow({ on: 'line', edgeId: 'e1' }, () => ['e2', 'e1'], [])).toEqual({ edgeId: 'e1', bend: null });
    expect(menuArrow({ on: 'line', edgeId: 'e1' }, () => ['e2', 'e1'], ['e2'])).toEqual({ edgeId: 'e2', bend: null });
    expect(menuArrow({ on: 'line', edgeId: 'e1' }, () => [], ['e3'])).toEqual({ edgeId: 'e1', bend: null });
  });

  it('takes the top arrow in reach of a side dot, or a selected one there, and none when nothing is in reach', () => {
    expect(menuArrow({ on: 'dot' }, () => ['e2', 'e1'], [])).toEqual({ edgeId: 'e2', bend: null });
    expect(menuArrow({ on: 'dot' }, () => ['e2', 'e1'], ['e3', 'e1'])).toEqual({ edgeId: 'e1', bend: null });
    expect(menuArrow({ on: 'dot' }, () => [], ['e1'])).toBeNull();
  });
});
