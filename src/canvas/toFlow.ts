import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { axes, boundsOf, laneBands } from '../layout/place';
import { autoSides } from '../layout/route/ports';
import { fillOf, type Tint } from '../model/color';
import type { Board, BoardEdge, BoardNode, Direction, Lane } from '../model/types';
import type { Route } from './arrowRoutes';
import { cached, type RenderCache } from './renderCache';

export type NodeViewData = { node: BoardNode; critical: boolean; dimmed: boolean; glowing: boolean; editable: boolean };
export type LaneViewData = { lane: Lane; alt: boolean; direction: Direction; editable: boolean };
export type EdgeViewData = { edge: BoardEdge; route: Route | undefined; critical: boolean; dimmed: boolean; editable: boolean; color: string; labelColor: string | null };

export type StepFlowNode = Node<NodeViewData, 'step'>;
export type TextFlowNode = Node<NodeViewData, 'text'>;
export type GroupFlowNode = Node<NodeViewData, 'group'>;
export type LaneFlowNode = Node<LaneViewData, 'lane'>;
export type FlowNode = StepFlowNode | TextFlowNode | GroupFlowNode | LaneFlowNode;
export type FlowEdgeType = Edge<EdgeViewData, 'flow'>;

export interface FlowView {
  selection: ReadonlySet<string>;
  edgeSelection: ReadonlySet<string>;
  criticalNodes: ReadonlySet<string> | null;
  criticalEdges: ReadonlySet<string> | null;
  glow: Record<string, number>;
  editable: boolean;
  edgeColor: string;
  criticalColor: string;
  accentColor: string;
  tintLines: Record<Tint, string>;
}

const LANE_MARGIN = 320;

export function laneNodes(board: Board, editable: boolean): LaneFlowNode[] {
  if (board.lanes.length === 0) return [];
  const ax = axes(board);
  const box = boundsOf(board.nodes.filter((n) => n.kind !== 'text'));
  const start = (box ? box[ax.main] : 0) - LANE_MARGIN;
  const length = (box ? box[ax.mainSize] : 1200) + LANE_MARGIN * 2;
  const byId = new Map(board.lanes.map((l) => [l.id, l]));
  return laneBands(board).map((band, i) => {
    const horizontal = ax.main === 'x';
    return {
      id: `lane:${band.id}`,
      type: 'lane',
      position: horizontal ? { x: start, y: band.start } : { x: band.start, y: start },
      width: horizontal ? length : band.size,
      height: horizontal ? band.size : length,
      data: { lane: byId.get(band.id)!, alt: i % 2 === 1, direction: board.direction, editable },
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      zIndex: -2,
    };
  });
}

export type Measured = ReadonlyMap<string, { width: number; height: number }>;

export function toFlowNodes(board: Board, view: FlowView, cache: RenderCache<FlowNode>, measured?: Measured): FlowNode[] {
  const out: FlowNode[] = laneNodes(board, view.editable);
  for (const n of board.nodes) {
    const selected = view.selection.has(n.id);
    const critical = !!view.criticalNodes?.has(n.id);
    const dimmed = !!view.criticalNodes && !critical && n.kind === 'step';
    const glowing = n.id in view.glow;
    out.push(
      cached(cache, n.id, [n, selected, critical, dimmed, glowing, view.editable, measured?.get(n.id)], () => ({
        id: n.id,
        type: n.kind,
        position: { x: n.x, y: n.y },
        width: n.w,
        height: n.h,
        ...(measured?.get(n.id) ? { measured: measured.get(n.id) } : {}),
        data: { node: n, critical, dimmed, glowing, editable: view.editable },
        selected,
        draggable: view.editable,
        connectable: view.editable && n.kind !== 'group',
        zIndex: n.kind === 'group' ? -1 : 0,
      }) as FlowNode),
    );
  }
  return out;
}

function lineColor(color: string | null, tintLines: Record<Tint, string>): string | null {
  const fill = fillOf(color);
  if (!fill) return null;
  return fill.kind === 'tint' ? tintLines[fill.tint] : fill.hex;
}

export function toFlowEdges(board: Board, view: FlowView, cache: RenderCache<FlowEdgeType>, routes: ReadonlyMap<string, Route>): FlowEdgeType[] {
  const sides = autoSides(board.direction);
  return board.edges.map((e) => {
    const selected = view.edgeSelection.has(e.id);
    const critical = !!view.criticalEdges?.has(e.id);
    const dimmed = !!view.criticalEdges && !critical;
    const own = lineColor(e.color, view.tintLines);
    const color = critical ? view.criticalColor : selected ? view.accentColor : (own ?? view.edgeColor);
    const route = routes.get(e.id);
    return cached(cache, e.id, [e, route, selected, critical, dimmed, view.editable, color, own, board.direction], () => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceSide ?? sides.source,
      targetHandle: e.targetSide ?? sides.target,
      type: 'flow' as const,
      selected,
      data: { edge: e, route, critical, dimmed, editable: view.editable, color, labelColor: own },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color },
      zIndex: critical ? 1 : 0,
    }));
  });
}
