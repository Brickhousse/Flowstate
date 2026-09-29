import type { Box, Rect, Transform } from '@xyflow/react';

// The fields nodeToBox in @xyflow/system reads from an internal node.
export interface NodeBoxSource {
  internals: { positionAbsolute: { x: number; y: number } };
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
  initialWidth?: number;
  initialHeight?: number;
}

export interface Pane {
  width: number;
  height: number;
  transform: Transform;
}

export function nodeBox(node: NodeBoxSource): Box {
  const { x, y } = node.internals.positionAbsolute;
  return {
    x,
    y,
    x2: x + (node.measured?.width ?? node.width ?? node.initialWidth ?? 0),
    y2: y + (node.measured?.height ?? node.height ?? node.initialHeight ?? 0),
  };
}

export function boundsOfBoxes(a: Box, b: Box): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) };
}

export function boxToRect({ x, y, x2, y2 }: Box): Rect {
  return { x, y, width: x2 - x, height: y2 - y };
}

export function paneRect({ width, height, transform }: Pane): Rect {
  return { x: -transform[0] / transform[2], y: -transform[1] / transform[2], width: width / transform[2], height: height / transform[2] };
}

export function overlapArea(a: Rect, b: Rect): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return Math.ceil(xOverlap * yOverlap);
}

// why: a line-for-line port of isEdgeVisible in @xyflow/system, which @xyflow/react does not export (ADR-0018).
export function isEdgeVisible({ sourceNode, targetNode, width, height, transform }: Pane & { sourceNode: NodeBoxSource; targetNode: NodeBoxSource }): boolean {
  const edgeBox = boundsOfBoxes(nodeBox(sourceNode), nodeBox(targetNode));
  if (edgeBox.x === edgeBox.x2) edgeBox.x2 += 1;
  if (edgeBox.y === edgeBox.y2) edgeBox.y2 += 1;
  return overlapArea(paneRect({ width, height, transform }), boxToRect(edgeBox)) > 0;
}
