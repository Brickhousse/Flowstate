import type Anthropic from '@anthropic-ai/sdk';
import { create } from 'zustand';
import { mergeStats, type Stats } from '../ai/stats';
import { flowStore } from '../store/store';
import type { Mention } from './context';

export const MODEL_OPTIONS = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
] as const;
export type ModelId = (typeof MODEL_OPTIONS)[number]['id'];

export type ChatItem =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'assistant'; text: string; stats: Stats; entryId: number | null; error: string | null; running: boolean };

interface ChatState {
  items: ChatItem[];
  api: Anthropic.MessageParam[];
  model: ModelId;
  controller: AbortController | null;
  draft: string;
  mentions: Mention[];
  addUser(text: string): void;
  startAssistant(controller: AbortController): number;
  appendText(id: number, delta: string): void;
  addStats(id: number, stats: Stats): void;
  finish(id: number, patch: { stats: Stats; entryId: number | null; error: string | null }, api: Anthropic.MessageParam[]): void;
  setModel(model: ModelId): void;
  setDraft(draft: string): void;
  setMentions(mentions: Mention[]): void;
  clearDraft(): void;
  stop(): void;
  reset(): void;
}

let seq = 0;

const patchAssistant = (items: ChatItem[], id: number, fn: (item: Extract<ChatItem, { role: 'assistant' }>) => ChatItem) =>
  items.map((i) => (i.id === id && i.role === 'assistant' ? fn(i) : i));

export const useChat = create<ChatState>()((set, get) => ({
  items: [],
  api: [],
  model: 'claude-sonnet-5',
  controller: null,
  draft: '',
  mentions: [],
  addUser(text) {
    set({ items: [...get().items, { id: ++seq, role: 'user', text }] });
  },
  startAssistant(controller) {
    const id = ++seq;
    set({ controller, items: [...get().items, { id, role: 'assistant', text: '', stats: {}, entryId: null, error: null, running: true }] });
    return id;
  },
  appendText(id, delta) {
    set({ items: patchAssistant(get().items, id, (i) => ({ ...i, text: i.text + delta })) });
  },
  addStats(id, stats) {
    set({ items: patchAssistant(get().items, id, (i) => ({ ...i, stats: mergeStats(i.stats, stats) })) });
  },
  finish(id, patch, api) {
    if (!get().items.some((i) => i.id === id)) return;
    set({ api, controller: null, items: patchAssistant(get().items, id, (i) => ({ ...i, ...patch, running: false })) });
  },
  setModel(model) {
    set({ model });
  },
  setDraft(draft) {
    set({ draft });
  },
  setMentions(mentions) {
    set({ mentions });
  },
  clearDraft() {
    set({ draft: '', mentions: [] });
  },
  stop() {
    get().controller?.abort();
  },
  reset() {
    get().controller?.abort();
    set({ items: [], api: [], controller: null, draft: '', mentions: [] });
  },
}));

flowStore.subscribe((s, prev) => {
  if (s.project.id !== prev.project.id) useChat.getState().reset();
});
