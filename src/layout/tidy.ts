import type { ELK, ElkNode } from 'elkjs/lib/elk-api';
import type { Board, BoardNode } from '../model/types';
import { axes, GAP_CROSS, GAP_MAIN, laneBands } from './place';

export interface TidyResult {
  positions: Record<string, { x: number; y: number }>;
  laneHeights: Record<string, number>;
}

const LANE_PAD = 32;
const ROW_CLEARANCE = 24;
const BELOW_LANES = 80;

export async function computeTidy(elk: ELK, board: Board): Promise<TidyResult> {
  const nodes = board.nodes.filter((n) => n.kind === 'step');
  const ids = new Set(nodes.map((n) => n.id));
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': board.direction === 'LR' ? 'RIGHT' : 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(GAP_MAIN),
      'elk.spacing.nodeNode': String(GAP_CROSS),
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': '120',
    },
    children: nodes.map((n) => ({ id: n.id, width: n.w, height: n.h })),
    edges: board.edges
      .filter((e) => e.type !== 'handoff' && ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const out = await elk.layout(graph);
  const positions: TidyResult['positions'] = {};
  for (const c of out.children ?? []) positions[c.id] = { x: c.x ?? 0, y: c.y ?? 0 };
  const laneHeights: TidyResult['laneHeights'] = {};
  if (board.lanes.length) arrangeLanes(board, nodes, positions, laneHeights);
  return { positions, laneHeights };
}

function arrangeLanes(board: Board, nodes: BoardNode[], positions: TidyResult['positions'], laneHeights: TidyResult['laneHeights']): void {
  const ax = axes(board);
  const bands = laneBands(board);
  let start = 0;
  for (const band of bands) {
    const members = nodes.filter((n) => n.laneId === band.id).sort((a, b) => positions[a.id][ax.main] - positions[b.id][ax.main]);
    const rowSize = members.length ? Math.max(...members.map((m) => m[ax.crossSize])) : 0;
    const rowEnds: number[] = [];
    const rowOf = new Map<string, number>();
    for (const m of members) {
      const p = positions[m.id];
      let row = rowEnds.findIndex((end) => end + ROW_CLEARANCE <= p[ax.main]);
      if (row === -1) {
        row = rowEnds.length;
        rowEnds.push(0);
      }
      rowEnds[row] = p[ax.main] + m[ax.mainSize];
      rowOf.set(m.id, row);
    }
    const content = rowEnds.length * rowSize + Math.max(0, rowEnds.length - 1) * GAP_CROSS;
    const size = Math.max(band.size, content + LANE_PAD * 2);
    const offset = start + (size - content) / 2;
    for (const m of members) {
      positions[m.id][ax.cross] = offset + rowOf.get(m.id)! * (rowSize + GAP_CROSS) + (rowSize - m[ax.crossSize]) / 2;
    }
    laneHeights[band.id] = size;
    start += size;
  }
  const laneIds = new Set(bands.map((b) => b.id));
  const free = nodes.filter((n) => !n.laneId || !laneIds.has(n.laneId));
  if (free.length) {
    const minCross = Math.min(...free.map((n) => positions[n.id][ax.cross]));
    for (const n of free) positions[n.id][ax.cross] += start + BELOW_LANES - minCross;
  }
}
