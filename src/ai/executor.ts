import { z } from 'zod';
import { summarizeBoard } from '../analysis/summary';
import { DurationError, parseDuration } from '../model/duration';
import type { Board, Project } from '../model/types';
import { alignNodes, distributeNodes, matchSize, reorder, type AlignEdge, type DistributeAxis, type MatchDims, type OrderMove } from '../ops/arrange';
import { reattach, resetPath, routeAround, setSeparate } from '../ops/arrowPath';
import { connect, disconnect, updateEdge } from '../ops/edges';
import { OpError } from '../ops/errors';
import { addFlag, setFlagResolved } from '../ops/flags';
import { groupSteps } from '../ops/groups';
import { setLanes } from '../ops/lanes';
import { findEdge, getEdge, getNode } from '../ops/query';
import { addStep, deleteSteps, updateSteps, type StepFields, type StepUpdate } from '../ops/steps';
import { branchParallel, insertBetween, moveSteps, type BranchItem } from '../ops/structure';
import { addText } from '../ops/text';
import { TOOL_SCHEMAS, type ArrangeAction, type StepInputValue, type ToolName } from './schemas';
import type { Stats } from './stats';

export interface ToolContext {
  getProject(): Project;
  activeBoardId(): string;
  changeBoard<R>(boardId: string, fn: (b: Board) => R): R;
  createBoard(name: string, activate: boolean): string;
  tidy(boardId: string): Promise<void>;
}

export interface ToolOutcome {
  ok: boolean;
  content: string;
  touched: string[];
  stats: Stats;
}

interface HandlerResult {
  result: unknown;
  touched?: string[];
  stats?: Stats;
}

type Input<N extends ToolName> = z.infer<(typeof TOOL_SCHEMAS)[N]>;
type Handler<N extends ToolName> = (ctx: ToolContext, input: Input<N>, boardId: string) => HandlerResult | Promise<HandlerResult>;

function resolveBoard(project: Project, ref: string | undefined, fallback: string): Board {
  const names = project.boards.map((b) => `"${b.name}"`).join(', ');
  if (!ref) {
    const board = project.boards.find((b) => b.id === fallback);
    if (!board) throw new OpError(`The board this turn was working on has been deleted. Pass "board" to pick one of: ${names}.`);
    return board;
  }
  const wanted = ref.trim().toLowerCase();
  const found = project.boards.find((b) => b.id === ref) ?? project.boards.find((b) => b.name.toLowerCase() === wanted);
  if (!found) throw new OpError(`Unknown board "${ref}". Boards: ${names}.`);
  return found;
}

function resolveLane(board: Board, ref: string): string {
  const wanted = ref.trim().toLowerCase();
  const lane = board.lanes.find((l) => l.id === ref) ?? board.lanes.find((l) => l.name.toLowerCase() === wanted);
  if (!lane) throw new OpError(`Unknown lane "${ref}". Lanes: ${board.lanes.map((l) => `${l.id} "${l.name}"`).join(', ') || 'none. Create them with set_lanes'}.`);
  return lane.id;
}

function toFields(board: Board, input: StepInputValue): { fields: StepFields; laneId?: string } {
  const fields: StepFields = {
    title: input.title,
    shape: input.shape,
    actor: input.actor,
    owner: input.owner,
    note: input.note,
    status: input.status,
    replaces: input.replaces,
  };
  if (input.duration !== undefined) fields.durationMin = parseDuration(input.duration);
  return { fields, laneId: input.lane ? resolveLane(board, input.lane) : undefined };
}

const ALIGN: Partial<Record<ArrangeAction, AlignEdge>> = {
  align_left: 'left',
  align_center: 'center',
  align_right: 'right',
  align_top: 'top',
  align_middle: 'middle',
  align_bottom: 'bottom',
};
const DISTRIBUTE: Partial<Record<ArrangeAction, DistributeAxis>> = { distribute_horizontal: 'horizontal', distribute_vertical: 'vertical' };
const MATCH: Partial<Record<ArrangeAction, MatchDims>> = { match_width: 'width', match_height: 'height', match_size: 'both' };
const ORDER: Partial<Record<ArrangeAction, OrderMove>> = {
  bring_to_front: 'front',
  bring_forward: 'forward',
  send_backward: 'backward',
  send_to_back: 'back',
};

function applyArrange(b: Board, ids: string[], action: ArrangeAction, reference: string | undefined): string[] {
  const edge = ALIGN[action];
  if (edge) return alignNodes(b, ids, edge);
  const axis = DISTRIBUTE[action];
  if (axis) return distributeNodes(b, ids, axis);
  const dims = MATCH[action];
  if (dims) {
    if (!reference) throw new OpError(`${action} needs "reference": the step whose size to copy.`);
    return matchSize(b, ids, reference, dims);
  }
  const move = ORDER[action];
  if (move) return reorder(b, ids, move);
  throw new OpError(`Unknown arrange action "${action}".`);
}

const handlers: { [N in ToolName]: Handler<N> } = {
  add_steps: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const refs = new Map<string, string>();
      const created: Array<{ ref?: string; id: string; title: string }> = [];
      let arrows = 0;
      for (const step of input.steps) {
        const { fields, laneId } = toFields(b, step);
        const after = step.after ? (refs.get(step.after) ?? step.after) : undefined;
        const id = addStep(b, { ...fields, after, laneId, groupId: step.group, edgeType: step.edge_type, edgeLabel: step.edge_label });
        if (after) arrows++;
        if (step.ref) refs.set(step.ref, id);
        created.push({ ...(step.ref ? { ref: step.ref } : {}), id, title: step.title });
      }
      return { result: { created }, touched: created.map((c) => c.id), stats: { stepsAdded: created.length, ...(arrows ? { arrowsAdded: arrows } : {}) } };
    }),

  update_steps: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const updates: StepUpdate[] = input.updates.map(({ id, duration, lane, ...rest }) => ({
        id,
        ...rest,
        ...(duration !== undefined ? { durationMin: duration === null ? null : parseDuration(duration) } : {}),
        ...(lane !== undefined ? { laneId: lane === null ? null : resolveLane(b, lane) } : {}),
      }));
      updateSteps(b, updates);
      const ids = updates.map((u) => u.id);
      return { result: { updated: ids }, touched: ids, stats: { stepsUpdated: ids.length } };
    }),

  delete_steps: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const out = deleteSteps(b, input.ids, { reconnect: input.reconnect });
      return { result: out, stats: { stepsDeleted: out.deleted.length, ...(out.reconnected ? { arrowsAdded: out.reconnected } : {}) } };
    }),

  connect: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      let added = 0;
      const ids = input.links.map((l) => {
        const isNew = !findEdge(b, l.from, l.to, l.type ?? 'flow');
        const id = connect(b, { source: l.from, target: l.to, type: l.type, label: l.label });
        if (isNew) added++;
        return id;
      });
      return { result: { arrows: ids }, touched: input.links.flatMap((l) => [l.from, l.to]), stats: added ? { arrowsAdded: added } : {} };
    }),

  disconnect: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const removed = input.links.reduce((sum, l) => sum + disconnect(b, { source: l.from, target: l.to }), 0);
      return { result: { removed }, stats: { arrowsRemoved: removed } };
    }),

  update_arrows: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const { from_side, to_side, separate, reset_path, route_around, color } = input;
      if (!from_side && !to_side && separate === undefined && !reset_path && !route_around && color === undefined) {
        throw new OpError('Say what to change: from_side, to_side, separate, reset_path, route_around or color.');
      }
      const matched = input.links.flatMap((l) => {
        const found = b.edges.filter((e) => e.source === l.from && e.target === l.to && (!l.type || e.type === l.type));
        if (!found.length) throw new OpError(`${l.from} is not connected to ${l.to}.`);
        return found.map((e) => e.id);
      });
      const ids = [...new Set(matched)];
      for (const id of ids) {
        const e = getEdge(b, id);
        if (from_side) reattach(b, id, 'source', e.source, from_side);
        if (to_side) reattach(b, id, 'target', e.target, to_side);
        if (reset_path) resetPath(b, [id]);
        if (route_around && !routeAround(b, id)) throw new OpError(`No route found around the steps for ${e.source} -> ${e.target}.`);
        if (color !== undefined) updateEdge(b, id, { color });
      }
      if (separate !== undefined) setSeparate(b, ids, separate);
      return { result: { updated: ids }, touched: input.links.flatMap((l) => [l.from, l.to]), stats: { arrowsUpdated: ids.length } };
    }),

  insert_between: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const { fields, laneId } = toFields(b, input.step);
      const id = insertBetween(b, input.from, input.to, fields);
      if (laneId) updateSteps(b, [{ id, laneId }]);
      return { result: { id }, touched: [id], stats: { stepsAdded: 1, arrowsAdded: 1 } };
    }),

  branch_parallel: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      type BranchMeta = { existing: string } | { fields: StepFields; laneId?: string };
      const meta: BranchMeta[][] = input.branches.map((branch) => branch.map((item) => ('existing' in item ? { existing: item.existing } : toFields(b, item))));
      const items: BranchItem[][] = meta.map((branch) => branch.map((m) => ('existing' in m ? { existing: m.existing } : m.fields)));
      const directEdgeRemoved = !!(input.join_at && findEdge(b, input.from, input.join_at, 'flow'));
      const ids = branchParallel(b, input.from, items, input.join_at);
      for (let i = 0; i < ids.length; i++) {
        for (let j = 0; j < ids[i].length; j++) {
          const m = meta[i][j];
          if (!('existing' in m) && m.laneId) updateSteps(b, [{ id: ids[i][j], laneId: m.laneId }]);
        }
      }
      const moved = items.flat().filter((i) => 'existing' in i).length;
      const added = ids.flat().length - moved;
      const arrows = ids.reduce((sum, br) => sum + br.length + (input.join_at ? 1 : 0), 0);
      return {
        result: { branches: ids },
        touched: ids.flat(),
        stats: {
          ...(added ? { stepsAdded: added } : {}),
          ...(moved ? { moved } : {}),
          arrowsAdded: arrows,
          ...(directEdgeRemoved ? { arrowsRemoved: 1 } : {}),
        },
      };
    }),

  move_steps: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const ids = moveSteps(b, { ids: input.ids, relation: input.relation, anchor: input.anchor, laneId: input.lane ? resolveLane(b, input.lane) : undefined, groupId: input.group });
      return { result: { moved: ids }, touched: ids, stats: { moved: ids.length } };
    }),

  add_flag: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const id = addFlag(b, input.target, input.kind, input.text);
      return { result: { flag_id: id }, touched: [input.target], stats: { flagsAdded: 1 } };
    }),

  resolve_flag: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const resolved = input.resolved ?? true;
      setFlagResolved(b, input.flag_id, resolved);
      return { result: { flag_id: input.flag_id, resolved }, stats: resolved ? { flagsResolved: 1 } : { flagsReopened: 1 } };
    }),

  group: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const id = groupSteps(b, input.ids, input.title);
      return { result: { group_id: id }, touched: input.ids, stats: { grouped: 1 } };
    }),

  set_lanes: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const ids = setLanes(b, input.lanes);
      return { result: { lanes: b.lanes.map((l) => ({ id: l.id, name: l.name })) }, stats: { lanesSet: ids.length || 1 } };
    }),

  add_text: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const id = addText(b, { text: input.text, near: input.near });
      return { result: { id }, touched: [id], stats: { textAdded: 1 } };
    }),

  read_board: (ctx, _input, boardId) => ({ result: summarizeBoard(ctx.getProject(), boardId) }),
  read_notes: (ctx, input, boardId) => {
    const b = resolveBoard(ctx.getProject(), boardId, boardId);
    return { result: { notes: input.ids.map((id) => ({ id, note: getNode(b, id).note })) } };
  },

  create_board: (ctx, input) => {
    const id = ctx.createBoard(input.name, input.switch_to ?? true);
    const name = ctx.getProject().boards.find((b) => b.id === id)!.name;
    return { result: { board_id: id, name }, stats: { boardsCreated: 1 } };
  },

  tidy: async (ctx, _input, boardId) => {
    await ctx.tidy(boardId);
    return { result: 'Tidied the board.', stats: { tidied: 1 } };
  },

  arrange: (ctx, input, boardId) =>
    ctx.changeBoard(boardId, (b) => {
      const ids = applyArrange(b, input.ids, input.action, input.reference);
      return { result: { arranged: ids }, touched: ids, stats: { arranged: ids.length } };
    }),
};

function fail(content: string): ToolOutcome {
  return { ok: false, content, touched: [], stats: {} };
}

function stepList(project: Project, boardId: string): string {
  const board = project.boards.find((b) => b.id === boardId);
  const steps = board?.nodes.filter((n) => n.kind === 'step') ?? [];
  const shown = steps.slice(0, 30).map((n) => `${n.id} ${JSON.stringify(n.title || '(untitled)')}`);
  return shown.length ? ` Steps on this board: ${shown.join(', ')}${steps.length > 30 ? ', ...' : ''}.` : ' This board has no steps.';
}

function arrowList(project: Project, boardId: string): string {
  const board = project.boards.find((b) => b.id === boardId);
  const edges = board?.edges ?? [];
  const shown = edges.slice(0, 30).map((e) => `${e.id}: ${e.source} -> ${e.target}`);
  return shown.length ? ` Arrows: ${shown.join(', ')}${edges.length > 30 ? ', ...' : ''}.` : ' This board has no arrows.';
}

function errorHint(message: string, project: Project, boardId: string): string {
  if (message.startsWith('Unknown step or arrow')) return stepList(project, boardId) + arrowList(project, boardId);
  if (message.startsWith('Unknown step')) return stepList(project, boardId);
  return '';
}

function isToolName(name: string): name is ToolName {
  return Object.hasOwn(TOOL_SCHEMAS, name);
}

export async function executeTool(ctx: ToolContext, name: string, input: unknown): Promise<ToolOutcome> {
  if (!isToolName(name)) return fail(`Unknown tool "${name}".`);
  const parsed = TOOL_SCHEMAS[name].safeParse(input);
  if (!parsed.success) return fail(`Invalid input: ${z.prettifyError(parsed.error)}`);
  const data = parsed.data;
  let boardId = ctx.activeBoardId();
  try {
    if (name !== 'create_board') boardId = resolveBoard(ctx.getProject(), 'board' in data ? data.board : undefined, boardId).id;
    const handler = handlers[name] as Handler<ToolName>;
    const out = await handler(ctx, data, boardId);
    return {
      ok: true,
      content: typeof out.result === 'string' ? out.result : JSON.stringify(out.result),
      touched: out.touched ?? [],
      stats: out.stats ?? {},
    };
  } catch (err) {
    if (err instanceof OpError || err instanceof DurationError) {
      return fail(err.message + errorHint(err.message, ctx.getProject(), boardId));
    }
    throw err;
  }
}
