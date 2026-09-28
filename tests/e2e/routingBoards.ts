import type { Board } from '../../src/model/types';
import { connect, disconnect } from '../../src/ops/edges';
import { addStep } from '../../src/ops/steps';

const ROWS = 10;
const COLS = 20;
// why: an arrow running back two rows turns along the middle of the row between, on that row's arrows.
const CROSSINGS: [from: number, to: number][] = [[8, 3], [15, 10], [12, 6]];
const CROSSING_COUNT = 20;

const title = (row: number, col: number) => `R${row} C${col}`;

function cells(b: Board): Map<string, { row: number; col: number }> {
  const out = new Map<string, { row: number; col: number }>();
  for (const n of b.nodes) {
    const m = /^R(\d+) C(\d+)$/.exec(n.title);
    if (m) out.set(n.id, { row: Number(m[1]), col: Number(m[2]) });
  }
  return out;
}

function stepIds(b: Board): (row: number, col: number) => string {
  const ids = new Map(b.nodes.map((n) => [n.title, n.id]));
  return (row, col) => ids.get(title(row, col))!;
}

export function routingBoard(b: Board): void {
  for (let row = 0; row < ROWS; row++) {
    const ids = [addStep(b, { title: title(row, 0), x: 0, y: row * 200 })];
    for (let col = 1; col < COLS; col++) ids.push(addStep(b, { title: title(row, col), after: ids[col - 1] }));
    connect(b, { source: ids[5], target: ids[7] });
  }
}

export function crossRowBoard(b: Board): void {
  routingBoard(b);
  const id = stepIds(b);
  for (let row = 0; row < ROWS; row++) for (const col of [COLS - 3, COLS - 2]) disconnect(b, { source: id(row, col), target: id(row, col + 1) });
  for (let k = 0; k < CROSSING_COUNT; k++) {
    const row = k % (ROWS - 2);
    const [from, to] = CROSSINGS[Math.floor(k / (ROWS - 2))];
    connect(b, { source: id(row, from), target: id(row + 2, to) });
  }
}

export function separateSkips(b: Board): void {
  const at = cells(b);
  for (const e of b.edges) {
    const s = at.get(e.source);
    const t = at.get(e.target);
    if (s && t && s.row === t.row && s.col === 5 && (t.col === 6 || t.col === 7)) e.separate = true;
  }
}

export function separateCrossings(b: Board): void {
  const at = cells(b);
  for (const e of b.edges) if (at.get(e.source)?.row !== at.get(e.target)?.row) e.separate = true;
}
