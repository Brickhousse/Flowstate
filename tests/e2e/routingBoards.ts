import { GAP_MAIN } from '../../src/layout/geometry';
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

const DETOUR_COLS = [10, 12];
const DETOUR_DEPTH = 1400;

// why: 20 hand-shaped arrows whose detours run seven rows away from their boxes, so that at 100% about ten of them
// are on screen while their boxes are not, which is what the culled-arrow layer draws (ADR-0018).
export function detourArrows(b: Board): void {
  const at = cells(b);
  const byId = new Map(b.nodes.map((n) => [n.id, n]));
  for (const e of b.edges) {
    const s = at.get(e.source);
    const t = at.get(e.target);
    const n = byId.get(e.source);
    if (!s || !t || !n || s.row !== t.row || t.col !== s.col + 1 || !DETOUR_COLS.includes(s.col)) continue;
    const y = n.y + n.h / 2;
    const far = y + (s.row < ROWS / 2 ? DETOUR_DEPTH : -DETOUR_DEPTH);
    const left = n.x + n.w + GAP_MAIN / 3;
    const right = n.x + n.w + (GAP_MAIN * 2) / 3;
    e.bends = [{ x: left, y }, { x: left, y: far }, { x: right, y: far }, { x: right, y }];
  }
}

const NOTES = [
  'Why this step exists\n\nWho it hands on to, and what they need from it.',
  'Overflows: a single first line far too long for the box to show without cutting it short',
  'Short',
];

export function noteSteps(b: Board): void {
  const at = cells(b);
  for (const n of b.nodes) {
    const cell = at.get(n.id);
    if (cell) n.note = NOTES[(cell.col + 1) % NOTES.length];
  }
}
