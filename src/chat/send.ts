import { executeTool } from '../ai/executor';
import { storeToolContext } from '../ai/storeContext';
import { reveal } from '../canvas/reveal';
import { tidyBoard } from '../layout/tidyBoard';
import { flowStore } from '../store/store';
import { runTurn, type TurnResult } from './agentLoop';
import { useChat } from './chatStore';
import { buildUserContent, expandMentions, type Mention } from './context';

export async function sendMessage(raw: string, mentions: Mention[]): Promise<void> {
  const chat = useChat.getState();
  const text = raw.trim();
  if (!text || chat.controller) return;
  const flow = flowStore.getState();
  const content = buildUserContent(flow.project, flow.activeBoardId, flow.selection, expandMentions(text, mentions));
  chat.addUser(text);
  const controller = new AbortController();
  const assistantId = chat.startAssistant(controller);
  const ctx = storeToolContext(flowStore, (boardId) => tidyBoard(flowStore, boardId));
  const projectId = flow.project.id;

  flowStore.getState().begin();
  let result: TurnResult;
  try {
    result = await runTurn(
      {
        post: (body, signal) => fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal }),
        execute: async (name, input) => {
          if (flowStore.getState().project.id !== projectId) return { ok: false, content: 'Not applied: the project was closed.', touched: [], stats: {} };
          const outcome = await executeTool(ctx, name, input);
          flowStore.getState().markGlow(outcome.touched);
          reveal(outcome.touched);
          return outcome;
        },
      },
      {
        onText: (delta) => useChat.getState().appendText(assistantId, delta),
        onTool: (_name, outcome) => useChat.getState().addStats(assistantId, outcome.stats),
      },
      chat.api,
      content,
      chat.model,
      controller.signal,
    );
  } catch (err) {
    result = { messages: chat.api, stats: {}, touched: [], error: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` };
  }
  const entryId = flowStore.getState().commit();
  useChat.getState().finish(assistantId, { stats: result.stats, entryId, error: result.error }, result.messages);
}
