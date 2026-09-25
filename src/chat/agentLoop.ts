import type Anthropic from '@anthropic-ai/sdk';
import type { ToolOutcome } from '../ai/executor';
import { mergeStats, type Stats } from '../ai/stats';
import { readSSE } from './sse';

export const MAX_ROUNDS = 12;
const LENGTH_LIMIT = 'The response hit the length limit.';
const EXPECTED_STOPS = new Set<Anthropic.StopReason>(['end_turn', 'tool_use', 'max_tokens', 'refusal']);

function stopError(reason: Anthropic.StopReason | null, failure: string | null): string | null {
  if (reason === 'max_tokens') return LENGTH_LIMIT;
  if (reason !== null && EXPECTED_STOPS.has(reason)) return failure;
  return reason === null ? 'The response ended unexpectedly (no stop reason).' : `The response ended unexpectedly (stop reason: ${reason}).`;
}

const isBlankText = (block: Anthropic.ContentBlock): boolean => block.type === 'text' && block.text.trim() === '';

export interface TurnDeps {
  post(body: { model: string; messages: Anthropic.MessageParam[] }, signal: AbortSignal): Promise<Response>;
  execute(name: string, input: unknown): Promise<ToolOutcome>;
}

export interface TurnCallbacks {
  onText(delta: string): void;
  onTool(name: string, outcome: ToolOutcome): void;
}

export interface TurnResult {
  messages: Anthropic.MessageParam[];
  stats: Stats;
  touched: string[];
  error: string | null;
}

interface Done {
  content: Anthropic.ContentBlock[];
  stop_reason: Anthropic.StopReason | null;
}

export function appendUser(history: Anthropic.MessageParam[], blocks: Anthropic.ContentBlockParam[]): Anthropic.MessageParam[] {
  const last = history[history.length - 1];
  if (last?.role === 'user') {
    const previous: Anthropic.ContentBlockParam[] = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content;
    return [...history.slice(0, -1), { role: 'user', content: [...previous, ...blocks] }];
  }
  return [...history, { role: 'user', content: blocks }];
}

async function errorFrom(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Chat request failed (${res.status}).`;
  } catch {
    return `Chat request failed (${res.status}).`;
  }
}

export async function runTurn(
  deps: TurnDeps,
  callbacks: TurnCallbacks,
  history: Anthropic.MessageParam[],
  userContent: string,
  model: string,
  signal: AbortSignal,
): Promise<TurnResult> {
  let messages = appendUser(history, [{ type: 'text', text: userContent }]);
  let stats: Stats = {};
  const touched = new Set<string>();
  const finish = (error: string | null, final = messages): TurnResult => ({ messages: final, stats, touched: [...touched], error });
  const record = (name: string, outcome: ToolOutcome) => {
    stats = mergeStats(stats, outcome.stats);
    for (const id of outcome.touched) touched.add(id);
    callbacks.onTool(name, outcome);
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const fallback = round === 0 ? history : messages;
    let res: Response;
    try {
      res = await deps.post({ model, messages }, signal);
    } catch {
      return finish(signal.aborted ? 'Stopped.' : 'Could not reach the Flowstate server.', fallback);
    }
    if (!res.ok || !res.body) return finish(await errorFrom(res), fallback);

    const outcomes = new Map<string, ToolOutcome>();
    let done: Done | null = null;
    let failure: string | null = null;
    try {
      for await (const ev of readSSE(res.body)) {
        if (ev.event === 'text') callbacks.onText((JSON.parse(ev.data) as { delta: string }).delta);
        else if (ev.event === 'tool') {
          if (signal.aborted) {
            failure = 'Stopped.';
            break;
          }
          const block = JSON.parse(ev.data) as Anthropic.ToolUseBlock;
          const outcome = await deps.execute(block.name, block.input);
          outcomes.set(block.id, outcome);
          record(block.name, outcome);
        } else if (ev.event === 'done') done = JSON.parse(ev.data) as Done;
        else if (ev.event === 'error') failure = (JSON.parse(ev.data) as { message: string }).message;
      }
    } catch {
      failure = signal.aborted ? 'Stopped.' : 'The response was interrupted.';
    }
    if (!done) return finish(failure ?? 'The response ended unexpectedly.', fallback);
    if (done.stop_reason === 'refusal') return finish('Claude declined this request.', history);

    // The API rejects blank text blocks, and an empty assistant message anywhere but last, so both are left out.
    const content = done.content.filter((b) => !isBlankText(b));
    if (content.length) messages = [...messages, { role: 'assistant', content }];
    const toolUses = content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) return finish(stopError(done.stop_reason, failure));

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      let outcome = outcomes.get(use.id);
      if (!outcome && done.stop_reason === 'tool_use') {
        outcome = await deps.execute(use.name, use.input);
        record(use.name, outcome);
      }
      outcome ??= { ok: false, content: 'Not applied: the response was cut off before this call finished.', touched: [], stats: {} };
      results.push({ type: 'tool_result', tool_use_id: use.id, content: outcome.content, ...(outcome.ok ? {} : { is_error: true }) });
    }
    messages = appendUser(messages, results);
    if (done.stop_reason !== 'tool_use') return finish(stopError(done.stop_reason, failure));
  }
  return finish(`Stopped after ${MAX_ROUNDS} rounds of edits.`);
}
