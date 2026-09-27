import { boundsOf } from '../layout/geometry';
import type { Board } from '../model/types';
import { copySubgraph, pasteSubgraph, type Clip } from '../ops/clipboard';
import { deleteEdges } from '../ops/edges';
import { deleteSteps, setPositions, withGroupMembers } from '../ops/steps';
import { flowStore } from '../store/store';
import { runSafely } from './safe';

export type XY = { x: number; y: number };

let pasteCount = 0;

export function run<R>(boardId: string, fn: (b: Board) => R): R | undefined {
  return runSafely(() => flowStore.getState().changeBoard(fn, boardId));
}

function boardOf(boardId: string): Board | undefined {
  return flowStore.getState().project.boards.find((b) => b.id === boardId);
}

function keep(clip: Clip): void {
  flowStore.getState().setClipboard(clip);
  pasteCount = 0;
}

export function copySelection(boardId: string): void {
  const sel = flowStore.getState().selection;
  const b = boardOf(boardId);
  if (!b || !sel.length) return;
  keep(copySubgraph(b, sel));
}

export function cutSelection(boardId: string): void {
  const sel = flowStore.getState().selection;
  if (!sel.length) return;
  const clip = run(boardId, (b) => {
    const c = copySubgraph(b, sel);
    deleteSteps(b, c.nodes.map((n) => n.id));
    return c;
  });
  if (!clip) return;
  keep(clip);
  flowStore.getState().select([]);
}

export function pasteClipboard(boardId: string, at?: XY): void {
  const st = flowStore.getState();
  const clip = st.clipboard;
  if (!clip) return;
  const box = at ? boundsOf(clip.nodes) : null;
  let dx: number;
  let dy: number;
  if (at && box) {
    dx = at.x - box.x;
    dy = at.y - box.y;
  } else {
    pasteCount += 1;
    dx = dy = 40 * pasteCount;
  }
  const ids = run(boardId, (b) => pasteSubgraph(b, clip, dx, dy));
  if (ids) st.select(ids);
}

export function duplicateSelection(boardId: string): void {
  const sel = flowStore.getState().selection;
  if (!sel.length) return;
  const ids = run(boardId, (b) => pasteSubgraph(b, copySubgraph(b, sel), 40, 40));
  if (ids) flowStore.getState().select(ids);
}

export function removeSelection(boardId: string, reconnect = false): void {
  const st = flowStore.getState();
  const sel = st.selection;
  const edges = st.edgeSelection;
  if (!sel.length && !edges.length) return;
  run(boardId, (b) => {
    if (sel.length) deleteSteps(b, sel, { reconnect });
    const live = edges.filter((id) => b.edges.some((e) => e.id === id));
    if (live.length) deleteEdges(b, live);
  });
  st.select([]);
}

export function nudgeSelection(boardId: string, dx: number, dy: number): void {
  const sel = flowStore.getState().selection;
  if (!sel.length) return;
  run(boardId, (b) => {
    const picked = new Set(sel);
    const positions: Record<string, XY> = {};
    for (const n of b.nodes) {
      if (picked.has(n.id) && !(n.groupId && picked.has(n.groupId))) positions[n.id] = { x: n.x + dx, y: n.y + dy };
    }
    setPositions(b, withGroupMembers(b, positions));
  });
}

export function arrangeSelection(boardId: string, fn: (b: Board, ids: string[]) => unknown): void {
  const sel = flowStore.getState().selection;
  if (!sel.length) return;
  run(boardId, (b) => fn(b, sel));
}
