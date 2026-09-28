import type { Side, XY } from '../../model/types';
import { SIDE_DIR, sideAxis, STUB } from './ports';

// why: a line-for-line port of getPoints in @xyflow/system dist/esm/index.js, so automatic arrows draw as before (ADR-0014).
function heading(source: XY, sourceSide: Side, target: XY): XY {
  if (sideAxis(sourceSide) === 'x') return source.x < target.x ? { x: 1, y: 0 } : { x: -1, y: 0 };
  return source.y < target.y ? { x: 0, y: 1 } : { x: 0, y: -1 };
}

export function elbow(source: XY, sourceSide: Side, target: XY, targetSide: Side, offset = STUB): XY[] {
  const sd = SIDE_DIR[sourceSide];
  const td = SIDE_DIR[targetSide];
  const sGap = { x: source.x + sd.x * offset, y: source.y + sd.y * offset };
  const tGap = { x: target.x + td.x * offset, y: target.y + td.y * offset };
  const dir = heading(sGap, sourceSide, tGap);
  const axis = dir.x !== 0 ? 'x' : 'y';
  const current = dir[axis];
  const sShift = { x: 0, y: 0 };
  const tShift = { x: 0, y: 0 };
  let points: XY[];
  if (sd[axis] * td[axis] === -1) {
    const cx = axis === 'x' ? sGap.x + (tGap.x - sGap.x) * 0.5 : (sGap.x + tGap.x) / 2;
    const cy = axis === 'x' ? (sGap.y + tGap.y) / 2 : sGap.y + (tGap.y - sGap.y) * 0.5;
    const vertical = [{ x: cx, y: sGap.y }, { x: cx, y: tGap.y }];
    const horizontal = [{ x: sGap.x, y: cy }, { x: tGap.x, y: cy }];
    if (sd[axis] === current) points = axis === 'x' ? vertical : horizontal;
    else points = axis === 'x' ? horizontal : vertical;
  } else {
    const sourceTarget = [{ x: sGap.x, y: tGap.y }];
    const targetSource = [{ x: tGap.x, y: sGap.y }];
    if (axis === 'x') points = sd.x === current ? targetSource : sourceTarget;
    else points = sd.y === current ? sourceTarget : targetSource;
    if (sourceSide === targetSide) {
      const diff = Math.abs(source[axis] - target[axis]);
      if (diff <= offset) {
        const gap = Math.min(offset - 1, offset - diff);
        if (sd[axis] === current) sShift[axis] = (sGap[axis] > source[axis] ? -1 : 1) * gap;
        else tShift[axis] = (tGap[axis] > target[axis] ? -1 : 1) * gap;
      }
    } else {
      const other = axis === 'x' ? 'y' : 'x';
      const sameDir = sd[axis] === td[other];
      const above = sGap[other] > tGap[other];
      const below = sGap[other] < tGap[other];
      const flip = (sd[axis] === 1 && ((!sameDir && above) || (sameDir && below))) || (sd[axis] !== 1 && ((!sameDir && below) || (sameDir && above)));
      if (flip) points = axis === 'x' ? sourceTarget : targetSource;
    }
  }
  const gs = { x: sGap.x + sShift.x, y: sGap.y + sShift.y };
  const gt = { x: tGap.x + tShift.x, y: tGap.y + tShift.y };
  const first = points[0];
  const last = points[points.length - 1];
  return [source, ...(gs.x !== first.x || gs.y !== first.y ? [gs] : []), ...points, ...(gt.x !== last.x || gt.y !== last.y ? [gt] : []), target];
}
