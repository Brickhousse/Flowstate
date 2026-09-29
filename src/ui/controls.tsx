import { useEffect, useRef, useState, type ReactNode } from 'react';
import { consumeFocus, registerFocus } from '../canvas/focusKey';
import { isHex } from '../model/color';

type ToolButtonProps = { title: string; active?: boolean; className?: string; keepFocus?: boolean; opensDialog?: boolean; onClick: () => void; children: ReactNode };

export function ToolButton({ title, active, className, keepFocus, opensDialog, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`fs-tool ${active ? 'is-active' : ''} ${className ?? ''}`}
      title={title}
      aria-label={title}
      aria-pressed={opensDialog ? undefined : active}
      aria-haspopup={opensDialog ? 'dialog' : undefined}
      aria-expanded={opensDialog ? !!active : undefined}
      onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}
      onClick={onClick}
    >
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
    if (!focusKey) return;
    const focus = () => ref.current?.focus();
    if (consumeFocus(focusKey)) focus();
    return registerFocus(focusKey, focus);
  }, [focusKey]);
  const commit = () => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    if (draft.trim() !== value) onCommit(draft.trim());
    setDraft(value);
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
        if (e.nativeEvent.isComposing) return;
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

export function ColorInput({ label, value, onPick, className, children }: { label: string; value: string | null; onPick: (hex: string) => void; className?: string; children?: ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // React's onChange fires on every picker drag step, which would flood undo; the native change fires once.
    const onChange = () => onPick(el.value);
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, [onPick]);
  return (
    <label className={className} title={label}>
      <input ref={ref} type="color" aria-label={label} className="nodrag" defaultValue={value && isHex(value) ? value : '#4c6ef5'} />
      {children}
    </label>
  );
}

export function InlineRename({ value, label, onDone }: { value: string; label: string; onDone: (name: string | null) => void }) {
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      className="fs-field inline-rename nodrag nopan"
      aria-label={label}
      defaultValue={value}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => finish(e.currentTarget.value.trim() || null)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(e.currentTarget.value.trim() || null);
        if (e.key === 'Escape') finish(null);
      }}
    />
  );
}
