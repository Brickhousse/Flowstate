export const TINTS = ['blue', 'green', 'amber', 'rose', 'violet', 'slate'] as const;
export type Tint = (typeof TINTS)[number];
export type Fill = { kind: 'tint'; tint: Tint } | { kind: 'hex'; hex: string; ink: 'dark' | 'light' } | null;

const HEX = /^#[0-9a-f]{6}$/i;

export function isTint(value: string): value is Tint {
  return TINTS.some((t) => t === value);
}

export function isHex(value: string): boolean {
  return HEX.test(value);
}

export function isColor(value: string): boolean {
  return isTint(value) || isHex(value);
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Must match --text in .fs-step.ink-dark and .fs-step.ink-light (canvas.css).
const INK_DARK = luminance('#1b2130');
const INK_LIGHT = luminance('#ffffff');

export function inkOn(hex: string): 'dark' | 'light' {
  const lum = luminance(hex);
  return contrast(lum, INK_DARK) >= contrast(lum, INK_LIGHT) ? 'dark' : 'light';
}

export function fillOf(color: string | null): Fill {
  if (!color) return null;
  if (isTint(color)) return { kind: 'tint', tint: color };
  if (isHex(color)) return { kind: 'hex', hex: color, ink: inkOn(color) };
  return null;
}
