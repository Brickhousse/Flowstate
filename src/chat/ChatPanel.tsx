import { Bot, PanelRightClose, Plus, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { describeStats } from '../ai/stats';
import { flowStore, useFlow } from '../store/store';
import { MODEL_OPTIONS, useChat, type ChatItem } from './chatStore';
import { Composer, focusComposer } from './Composer';
import './chat.css';

const EXAMPLES = [
  'Add intake, review and approval steps',
  'Put a quality check between the last two steps',
  'Split the selected step off as a parallel path',
  'Which human steps could an AI agent take over?',
  'Draft an agentic version of this board on a new board',
];

function ChatEmpty() {
  return (
    <div className="chat-empty">
      <p>Describe a change or ask about the board. Selected steps are "this" and "these". Type @ to mention a step.</p>
      {EXAMPLES.map((t) => (
        <button
          key={t}
          type="button"
          className="chat-example"
          onClick={() => {
            useChat.getState().setDraft(t);
            focusComposer();
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function ChatMessage({ item }: { item: ChatItem }) {
  const latestEntry = useFlow((s) => s.past[s.past.length - 1]?.id ?? null);
  const inTx = useFlow((s) => s.tx !== null);
  if (item.role === 'user') return <div className="chat-msg is-user">{item.text}</div>;
  const summary = describeStats(item.stats);
  const canUndo = item.entryId !== null && item.entryId === latestEntry && !inTx;
  return (
    <div className="chat-msg is-assistant">
      {item.text && <div className="chat-text">{item.text}</div>}
      {item.running && !item.text && (
        <div className="chat-typing" aria-label="Working">
          <span />
          <span />
          <span />
        </div>
      )}
      {(summary || item.entryId !== null) && (
        <div className="chat-change">
          {summary && <span className="chat-chip">{summary}</span>}
          {item.entryId !== null && (
            <button
              type="button"
              className="chat-undo"
              disabled={!canUndo}
              title={canUndo ? 'Undo these changes' : 'Later changes were made. Use Ctrl+Z to step back.'}
              onClick={() => flowStore.getState().undoEntry(item.entryId!)}
            >
              <Undo2 size={12} /> Undo
            </button>
          )}
        </div>
      )}
      {item.error && (
        <div className="chat-error" role="alert">
          {item.error}
        </div>
      )}
    </div>
  );
}

export function ChatPanel() {
  const items = useChat((s) => s.items);
  const model = useChat((s) => s.model);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [items]);
  return (
    <aside className="chat" aria-label="Assistant">
      <header className="chat-head">
        <span className="chat-title">
          <Bot size={15} /> Assistant
        </span>
        <select
          className="chat-model"
          aria-label="Model"
          value={model}
          onChange={(e) => {
            const option = MODEL_OPTIONS.find((o) => o.id === e.target.value);
            if (option) useChat.getState().setModel(option.id);
          }}
        >
          {MODEL_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" className="chat-icon" aria-label="New chat" title="New chat" onClick={() => useChat.getState().reset()}>
          <Plus size={14} />
        </button>
        <button type="button" className="chat-icon" aria-label="Hide assistant" title="Hide assistant (Ctrl+/)" onClick={() => flowStore.getState().setChatOpen(false)}>
          <PanelRightClose size={14} />
        </button>
      </header>
      <div className="chat-list" ref={list}>
        {items.length === 0 ? <ChatEmpty /> : items.map((item) => <ChatMessage key={item.id} item={item} />)}
      </div>
      <Composer />
    </aside>
  );
}
