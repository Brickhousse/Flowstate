import { z } from 'zod';
import { ACTORS, EDGE_TYPES, FLAG_KINDS, SHAPES, STATUSES } from '../model/types';

const board = z.string().optional().describe('Board name or id. Defaults to the board the user is looking at.');
const id = z.string().describe('Id from the board summary, like s12.');

export const ARRANGE_ACTIONS = [
  'align_left',
  'align_center',
  'align_right',
  'align_top',
  'align_middle',
  'align_bottom',
  'distribute_horizontal',
  'distribute_vertical',
  'match_width',
  'match_height',
  'match_size',
  'bring_to_front',
  'bring_forward',
  'send_backward',
  'send_to_back',
] as const;
export type ArrangeAction = (typeof ARRANGE_ACTIONS)[number];

export const StepInput = z.object({
  title: z.string().min(1).describe('Short title, ideally 2 to 6 words.'),
  shape: z.enum(SHAPES).optional().describe('Defaults to process.'),
  actor: z.enum(ACTORS).optional().describe('person, system, or agent (an AI agent).'),
  owner: z.string().optional().describe('Person, team, system or agent name.'),
  duration: z.string().optional().describe('Working time like 30m, 2h, 1.5d or 1w. 1d = 8h.'),
  note: z.string().optional(),
  status: z.enum(STATUSES).optional(),
  lane: z.string().optional().describe('Lane id or name.'),
  replaces: z.string().optional().describe('Old-process steps this replaces, as free text.'),
});
export type StepInputValue = z.infer<typeof StepInput>;

export const TOOL_SCHEMAS = {
  add_steps: z.object({
    board,
    steps: z
      .array(
        StepInput.extend({
          ref: z.string().optional().describe('Temporary handle so later steps in this call can refer to this one.'),
          after: z.string().optional().describe('Step id, or a ref from earlier in this call, to connect from.'),
          group: z.string().optional().describe('Group id to place the step in.'),
          edge_type: z.enum(EDGE_TYPES).optional(),
          edge_label: z.string().optional(),
        }),
      )
      .min(1),
  }),
  update_steps: z.object({
    board,
    updates: z
      .array(
        z.object({
          id,
          title: z.string().min(1).optional(),
          shape: z.enum(SHAPES).optional(),
          actor: z.enum(ACTORS).nullable().optional(),
          owner: z.string().optional(),
          duration: z.string().nullable().optional(),
          note: z.string().optional(),
          status: z.enum(STATUSES).nullable().optional(),
          lane: z.string().nullable().optional(),
          replaces: z.string().optional(),
          color: z.string().nullable().optional().describe('blue, green, amber, rose, violet, slate, a #rrggbb value, or null for the default.'),
        }),
      )
      .min(1),
  }),
  delete_steps: z.object({ board, ids: z.array(id).min(1), reconnect: z.boolean().optional() }),
  connect: z.object({
    board,
    links: z.array(z.object({ from: id, to: id, type: z.enum(EDGE_TYPES).optional(), label: z.string().optional() })).min(1),
  }),
  disconnect: z.object({ board, links: z.array(z.object({ from: id, to: id })).min(1) }),
  insert_between: z.object({ board, from: id, to: id, step: StepInput }),
  branch_parallel: z.object({
    board,
    from: id,
    branches: z.array(z.array(z.union([z.object({ existing: id }), StepInput])).min(1)).min(1),
    join_at: z.string().optional(),
  }),
  move_steps: z.object({
    board,
    ids: z.array(id).min(1),
    relation: z.enum(['after', 'before', 'above', 'below']).optional(),
    anchor: z.string().optional(),
    lane: z.string().optional(),
    group: z.string().optional(),
  }),
  add_flag: z.object({ board, target: z.string().describe('Step id or arrow id.'), kind: z.enum(FLAG_KINDS), text: z.string().min(1) }),
  resolve_flag: z.object({ board, flag_id: z.string(), resolved: z.boolean().optional() }),
  group: z.object({ board, ids: z.array(id).min(1), title: z.string().min(1) }),
  set_lanes: z.object({ board, lanes: z.array(z.string()) }),
  add_text: z.object({ board, text: z.string().min(1), near: z.string().optional() }),
  read_board: z.object({ board: z.string().describe('Board name or id.') }),
  create_board: z.object({ name: z.string().min(1), switch_to: z.boolean().optional() }),
  tidy: z.object({ board }),
  arrange: z.object({
    board,
    ids: z.array(id).min(1),
    action: z.enum(ARRANGE_ACTIONS),
    reference: z.string().optional().describe('For match_width, match_height and match_size: the step whose size to copy.'),
  }),
};

export type ToolName = keyof typeof TOOL_SCHEMAS;
