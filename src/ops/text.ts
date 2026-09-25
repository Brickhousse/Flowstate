import { makeNode } from '../model/factory';
import type { Board } from '../model/types';
import { nudgeFree, positionAtEnd, positionBeside } from '../layout/place';
import { getNode } from './query';

export function addText(b: Board, args: { text: string; x?: number; y?: number; near?: string }): string {
  const node = makeNode(b, 'text', { title: args.text.trim() });
  if (args.near) {
    positionBeside(b, getNode(b, args.near), node, -1);
    nudgeFree(b, node, -1);
  } else if (args.x !== undefined && args.y !== undefined) {
    node.x = args.x;
    node.y = args.y;
  } else {
    positionAtEnd(b, node);
    nudgeFree(b, node);
  }
  b.nodes.push(node);
  return node.id;
}
