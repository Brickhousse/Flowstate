import type { Side, XY } from '../../model/types';
import { sideAxis, stubEnd, type Axis } from './ports';
import { simplify } from './polyline';

export function through(source: XY, sourceSide: Side, bends: XY[], target: XY, targetSide: Side): XY[] {
  const out: XY[] = [source, stubEnd(source, sourceSide)];
  let axis: Axis = sideAxis(sourceSide);
  for (const p of [...bends, stubEnd(target, targetSide)]) {
    const last = out[out.length - 1];
    if (last.x !== p.x && last.y !== p.y) out.push(axis === 'x' ? { x: last.x, y: p.y } : { x: p.x, y: last.y });
    else if (last.x === p.x && last.y !== p.y) axis = 'y';
    else if (last.y === p.y && last.x !== p.x) axis = 'x';
    out.push(p);
  }
  out.push(target);
  return simplify(out);
}
