import { isColor, TINTS } from '../model/color';
import { OpError } from './errors';

export function assertColor(value: string): void {
  if (!isColor(value)) throw new OpError(`Unknown colour "${value}". Use ${TINTS.join(', ')}, a #rrggbb value, or null.`);
}
