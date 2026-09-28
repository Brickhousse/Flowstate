import { getSmoothStepPath, Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { SIDES, type Side } from '../../model/types';
import { elbow } from './elbow';
import { roundedPath } from './path';

const POSITION: Record<Side, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };
const SOURCE = { x: 100, y: 100 };
const TARGETS = [
  { x: 400, y: 220 },
  { x: -200, y: -20 },
  { x: 140, y: 400 },
  { x: 60, y: -200 },
  { x: 400, y: 105 },
  { x: 110, y: 110 },
  { x: 100, y: 300 },
  { x: 300, y: 100 },
  { x: 100.5, y: 100.25 },
];

describe('elbow', () => {
  for (const s of SIDES) {
    for (const t of SIDES) {
      it(`draws ${s} to ${t} exactly as getSmoothStepPath`, () => {
        for (const target of TARGETS) {
          const [expected] = getSmoothStepPath({
            sourceX: SOURCE.x,
            sourceY: SOURCE.y,
            sourcePosition: POSITION[s],
            targetX: target.x,
            targetY: target.y,
            targetPosition: POSITION[t],
            borderRadius: 14,
            offset: 22,
          });
          expect(roundedPath(elbow(SOURCE, s, target, t), 14), `to ${target.x},${target.y}`).toBe(expected);
        }
      });
    }
  }
});
