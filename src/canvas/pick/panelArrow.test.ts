import { describe, expect, it } from 'vitest';
import { panelArrow } from './panelArrow';

describe('panelArrow', () => {
  const listed = ['e5', 'e4'];

  it('is the one selected arrow when it is listed', () => {
    expect(panelArrow(listed, ['e4'], [])).toBe('e4');
  });

  it('closes the panel once no arrow is selected, as after a delete or an undo', () => {
    expect(panelArrow(listed, [], [])).toBeNull();
  });

  it('closes the panel when the selected arrow is not one of the listed arrows', () => {
    expect(panelArrow(listed, ['e9'], [])).toBeNull();
  });

  it('closes the panel when more than one thing is selected, matching the toolbar rule', () => {
    expect(panelArrow(listed, ['e4', 'e5'], [])).toBeNull();
    expect(panelArrow(listed, ['e4'], ['s1'])).toBeNull();
  });
});
