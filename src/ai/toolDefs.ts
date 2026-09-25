import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { TOOL_SCHEMAS, type ToolName } from './schemas';

const DESCRIPTIONS: Record<ToolName, string> = {
  add_steps:
    'Add one or more steps. Use "after" to connect each new step from an existing step id, or from a ref defined earlier in the same call, which is how to add a whole sequence in one call. Steps without "after" are placed at the end of the board, unconnected.',
  update_steps: 'Change properties of existing steps. Set duration, actor, status or lane to null to clear it.',
  delete_steps: "Delete steps and their arrows. With reconnect true, each deleted step's predecessors are connected to its successors so the flow stays intact.",
  connect:
    'Add arrows. type flow (default) is the next step, dependency means the target cannot start until the source is done, handoff is data or information passed. Connecting an existing pair again only updates its label.',
  disconnect: 'Remove the arrows between pairs of steps.',
  insert_between: 'Insert a new step on an existing arrow, so from -> to becomes from -> new -> to. Use this for "put X between A and B".',
  branch_parallel:
    'Create parallel paths from a step. Each branch is a sequence of new steps, or {"existing": id} for steps to split off from where they are now (they are spliced out and their neighbours reconnected). With join_at, every branch ends in an arrow to that step and any direct from -> join_at arrow is removed.',
  move_steps: 'Reposition steps without changing arrows: relative to an anchor step (after, before, above, below), into a lane, or into a group.',
  add_flag: 'Attach a blocker, warning or question to a step or an arrow.',
  resolve_flag: 'Mark a flag resolved, or reopen it with resolved false.',
  group: 'Draw a labelled frame around steps, for a phase or stage.',
  set_lanes: 'Set the complete, ordered list of swimlanes for a board. Existing lanes are kept by name. An empty list removes all lanes.',
  add_text: 'Add a free text note on the board, optionally near a step.',
  read_board: 'Read the full summary of another board in this project.',
  create_board: 'Create a new board, for example a future-state redesign, and switch to it unless switch_to is false.',
  tidy: 'Auto-layout a whole board. Use after building or restructuring many steps at once.',
};

export const TOOL_DEFS: Anthropic.Tool[] = (Object.keys(TOOL_SCHEMAS) as ToolName[]).map((name) => {
  const { $schema: _schema, ...schema } = z.toJSONSchema(TOOL_SCHEMAS[name]) as Record<string, unknown>;
  return { name, description: DESCRIPTIONS[name], input_schema: schema as Anthropic.Tool.InputSchema };
});
