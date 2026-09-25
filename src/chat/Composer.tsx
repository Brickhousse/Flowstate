import { Send, Square } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BoardNode } from '../model/types';
import { selectActiveBoard, useFlow } from '../store/store';
import { useChat } from './chatStore';
import type { Mention } from './context';
import { sendMessage } from './send';

export function focusComposer(): void {
  document.querySelector<HTMLTextAreaElement>('.chat-input')?.focus();
}

export function Composer() {
  const text = useChat((s) => s.draft);
  const running = useChat((s) => s.controller !== null);
  const board = useFlow(selectActiveBoard);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [query, setQuery] = useState<{ start: number; term: string } | null>(null);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const setText = (value: string) => useChat.getState().setDraft(value);

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !ref.current) return;
    ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [text]);

  const options = useMemo(() => {
    if (!query) return [];
    const term = query.term.toLowerCase();
    return board.nodes.filter((n) => n.kind === 'step' && n.title && n.title.toLowerCase().includes(term)).slice(0, 6);
  }, [query, board]);

  const track = (value: string, caret: number) => {
    const match = /@([^@\n]{0,40})$/.exec(value.slice(0, caret));
    setQuery(match ? { start: caret - match[0].length, term: match[1] } : null);
    setActive(0);
  };

  const pick = (node: BoardNode) => {
    const el = ref.current;
    if (!query || !el) return;
    const insert = `@${node.title} `;
    pendingCaret.current = query.start + insert.length;
    setText(text.slice(0, query.start) + insert + text.slice(el.selectionStart));
    setMentions((ms) => [...ms.filter((m) => m.label !== node.title), { label: node.title, id: node.id }]);
    setQuery(null);
    el.focus();
  };

  const submit = () => {
    if (!text.trim() || running) return;
    void sendMessage(text, mentions.filter((m) => text.includes(`@${m.label}`)));
    setText('');
    setMentions([]);
  };

  return (
    <div className="chat-composer">
      {options.length > 0 && (
        <div className="mention-menu" role="listbox" aria-label="Mention a step">
          {options.map((n, i) => (
            <button
              key={n.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className="mention-option"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(n);
              }}
            >
              {n.title}
              <span>{n.id}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        className="chat-input"
        rows={2}
        aria-label="Message"
        placeholder="Describe a change or ask a question. Type @ to mention a step."
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          track(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (options.length) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((active + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              pick(options[active]);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setQuery(null);
              return;
            }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.currentTarget.blur();
          }
        }}
      />
      {running ? (
        <button type="button" className="chat-send is-stop" aria-label="Stop" title="Stop" onClick={() => useChat.getState().stop()}>
          <Square size={12} />
        </button>
      ) : (
        <button type="button" className="chat-send" aria-label="Send" title="Send (Enter)" disabled={!text.trim()} onClick={submit}>
          <Send size={14} />
        </button>
      )}
    </div>
  );
}
