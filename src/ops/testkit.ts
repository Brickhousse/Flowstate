import { createBoard } from '../model/factory';
import type { Board, BoardNode, EdgeType } from '../model/types';
import { addStep } from './steps';

export function chain(titles: string[], board: Board = createBoard('Test')): { b: Board; ids: string[] } {
  const ids: string[] = [];
  for (const title of titles) {
    ids.push(addStep(board, ids.length ? { title, after: ids[ids.length - 1] } : { title, x: 0, y: 0 }));
  }
  return { b: board, ids };
}

export function node(b: Board, id: string): BoardNode {
  const n = b.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`No node ${id}`);
  return n;
}

export function byTitle(b: Board, title: string): BoardNode {
  const n = b.nodes.find((x) => x.title === title);
  if (!n) throw new Error(`No node titled ${title}`);
  return n;
}

export function links(b: Board, type?: EdgeType): string[] {
  const title = (id: string) => node(b, id).title;
  return b.edges
    .filter((e) => !type || e.type === type)
    .map((e) => `${title(e.source)}>${title(e.target)}`)
    .sort();
}
