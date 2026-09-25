import { useEffect, useRef, useState, type ReactNode } from 'react';
import { consumeFocus } from '../canvas/focusKey';

export function ToolButton({ title, active, className, onClick, children }: { title: string; active?: boolean; className?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`fs-tool ${active ? 'is-active' : ''} ${className ?? ''}`} title={title} aria-label={title} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

export function Divider() {
  return <span className="fs-divider" aria-hidden />;
}

export function FieldInput({
  label,
  value,
  placeholder,
  width,
  focusKey,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  width: number;
  focusKey?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const skip = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (focusKey && consumeFocus(focusKey)) ref.current?.focus();
  }, [focusKey]);
  const commit = () => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    if (draft.trim() !== value) onCommit(draft.trim());
  };
  return (
    <input
      ref={ref}
      className="fs-field nodrag nopan"
      aria-label={label}
      title={label}
      placeholder={placeholder}
      style={{ width }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          skip.current = true;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
