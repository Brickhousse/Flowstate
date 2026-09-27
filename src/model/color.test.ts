import { describe, expect, it } from 'vitest';
import { fillOf, inkOn, isColor } from './color';

describe('colour', () => {
  it('accepts presets and #rrggbb only', () => {
    expect(isColor('green')).toBe(true);
    expect(isColor('#A1b2C3')).toBe(true);
    expect(isColor('red')).toBe(false);
    expect(isColor('#abc')).toBe(false);
  });

  it('resolves a stored colour to a preset tint, a custom fill, or the default', () => {
    expect(fillOf(null)).toBeNull();
    expect(fillOf('blue')).toEqual({ kind: 'tint', tint: 'blue' });
    expect(fillOf('#ffeb3b')).toEqual({ kind: 'hex', hex: '#ffeb3b', ink: 'dark' });
    expect(fillOf('red')).toBeNull();
  });

  it('picks the more readable ink for a custom fill', () => {
    expect(inkOn('#ffffff')).toBe('dark');
    expect(inkOn('#000000')).toBe('light');
    expect(inkOn('#1b2130')).toBe('light');
  });

  it('weighs ink against the text tokens, not pure black', () => {
    expect(inkOn('#7a7a7a')).toBe('light');
  });
});
