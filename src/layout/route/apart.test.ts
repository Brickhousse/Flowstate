import { describe, expect, it } from 'vitest';
import type { XY } from '../../model/types';
import { shiftLines, spreadPorts, type ArrowEnds } from './apart';

const A = { x: 0, y: 0, w: 180, h: 72 };
const box = (y: number) => ({ x: 400, y, w: 180, h: 72 });

function fromA(id: string, targetY: number, separate: boolean): ArrowEnds {
  return { id, separate, source: { node: 'a', side: 'right', box: A }, target: { node: `n${id}`, side: 'left', box: box(targetY) } };
}

describe('spreadPorts', () => {
  it('spreads separate arrows evenly along a side, ordered by where their other end is', () => {
    const spots = spreadPorts([fromA('e1', 200, true), fromA('e2', -200, true), fromA('e3', 0, true)]);
    expect([spots.get('e2')!.source, spots.get('e3')!.source, spots.get('e1')!.source]).toEqual([0.25, 0.5, 0.75]);
    expect(spots.get('e1')!.target).toBe(0.5);
  });

  it('keeps shared arrows on the midpoint and puts separate ones in the half facing their other end', () => {
    const spots = spreadPorts([fromA('e1', 0, false), fromA('e2', 300, true), fromA('e3', -300, true), fromA('e4', 500, true)]);
    expect(spots.has('e1')).toBe(false);
    expect(spots.get('e3')!.source).toBe(0.25);
    expect(spots.get('e2')!.source).toBeCloseTo(0.5 + 0.5 / 3);
    expect(spots.get('e4')!.source).toBeCloseTo(0.5 + 1 / 3);
  });

  it('leaves sides without a separate arrow alone', () => {
    expect(spreadPorts([fromA('e1', 0, false), fromA('e2', 100, false)]).size).toBe(0);
  });
});

describe('shiftLines', () => {
  const trunk = (x: number, y0: number, y1: number): XY[] => [{ x: 185.5, y: y0 }, { x, y: y0 }, { x, y: y1 }, { x: 394.5, y: y1 }];

  it('moves a separate arrow sideways off a line it shares, in 10px steps', () => {
    const routes = new Map([
      ['shared', trunk(290, 36, 336)],
      ['apart', trunk(290, 236, 536)],
    ]);
    expect(shiftLines(routes, ['apart']).get('apart')).toEqual(trunk(300, 236, 536));
  });

  it('tries the other side next and stops after five steps', () => {
    const routes = new Map([
      ['a', trunk(290, 36, 336)],
      ['b', trunk(300, 36, 336)],
      ['c', trunk(280, 36, 336)],
      ['apart', trunk(290, 236, 536)],
    ]);
    expect(shiftLines(routes, ['apart']).get('apart')).toEqual(trunk(310, 236, 536));
    const walls = new Map([...[270, 280, 290, 300, 310, 320].map((x): [string, XY[]] => [`w${x}`, trunk(x, 36, 336)]), ['apart', trunk(290, 236, 536)]]);
    expect(shiftLines(walls, ['apart']).get('apart')).toEqual(trunk(320, 236, 536));
  });

  it('never moves other arrows and ignores lines that only cross', () => {
    const cross: XY[] = [{ x: 200, y: 400 }, { x: 250, y: 400 }, { x: 350, y: 400 }, { x: 400, y: 400 }];
    const routes = new Map([
      ['other', cross],
      ['apart', trunk(290, 236, 536)],
    ]);
    const out = shiftLines(routes, ['apart']);
    expect(out.get('apart')).toEqual(trunk(290, 236, 536));
    expect(out.has('other')).toBe(false);
  });
});
