import { Check, ChevronRight } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { isTyping } from '../useKeyboard';

export type MenuEntry =
  | { kind: 'item'; label: string; shortcut?: string; disabled?: boolean; checked?: boolean; radio?: boolean; icon?: ReactNode; keepOpen?: boolean; preview?: () => void; run: () => void }
  | { kind: 'submenu'; label: string; disabled?: boolean; entries: MenuEntry[] }
  | { kind: 'custom'; id: string; render: (close: () => void) => ReactNode }
  | { kind: 'sep' };

// aria-keyshortcuts wants UI Events modifier/key names, not the display abbreviations we show.
const ARIA_KEY: Record<string, string> = { Ctrl: 'Control', Del: 'Delete' };
function ariaShortcut(shortcut: string): string {
  return shortcut
    .split('+')
    .map((part) => ARIA_KEY[part] ?? part)
    .join('+');
}

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);
const LIST_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Enter', 'Escape']);

type Actionable = Extract<MenuEntry, { kind: 'item' | 'submenu' }>;

function actionable(e: MenuEntry | undefined): e is Actionable {
  return !!e && (e.kind === 'item' || e.kind === 'submenu') && !e.disabled;
}

type ListProps = {
  entries: MenuEntry[];
  close: () => void;
  onBack?: () => void;
  onTab?: (back: boolean) => void;
  onLeave?: () => void;
  label?: string;
  passKeys?: boolean;
  listRef?: RefObject<HTMLDivElement | null>;
};

export function MenuList({ entries, close, onBack, onTab, onLeave, label, passKeys, listRef }: ListProps) {
  const [active, setActive] = useState(() => entries.findIndex(actionable));
  const [open, setOpen] = useState<number | null>(null);
  const [flip, setFlip] = useState({ x: false, y: false });
  const own = useRef<HTMLDivElement>(null);
  const ref = listRef ?? own;

  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setFlip({ x: r.right > window.innerWidth - 4, y: r.bottom > window.innerHeight - 4 });
    ref.current?.focus();
  }, []);

  const highlight = (i: number) => {
    setActive(i);
    const e = entries[i];
    if (e?.kind === 'item') e.preview?.();
  };
  const move = (dir: 1 | -1) => {
    for (let i = 1; i <= entries.length; i++) {
      const j = (active + dir * i + entries.length) % entries.length;
      if (actionable(entries[j])) {
        ref.current?.children[j]?.scrollIntoView({ block: 'nearest' });
        return highlight(j);
      }
    }
  };
  const activate = (i: number) => {
    const e = entries[i];
    if (!actionable(e)) return;
    if (e.kind === 'submenu') return setOpen(i);
    if (!e.keepOpen) close();
    e.run();
  };
  const back = () => {
    setOpen(null);
    ref.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' && e.key !== 'Tab' && isTyping(e.target)) {
      e.stopPropagation();
      return;
    }
    if (e.key === 'Tab' && onTab) {
      e.preventDefault();
      e.stopPropagation();
      onTab(e.shiftKey);
      return;
    }
    if (passKeys && !LIST_KEYS.has(e.key)) {
      if (!MODIFIERS.has(e.key)) close();
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        move(1);
        break;
      case 'ArrowUp':
        move(-1);
        break;
      case 'Enter':
      case ' ':
        activate(active);
        break;
      case 'ArrowRight':
        if (entries[active]?.kind === 'submenu') activate(active);
        break;
      case 'ArrowLeft':
        onBack?.();
        break;
      case 'Escape':
        if (onBack) onBack();
        else close();
        break;
      case 'Tab':
        close();
        break;
      default:
        if (!MODIFIERS.has(e.key)) e.stopPropagation();
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div ref={ref} role="menu" aria-label={label} tabIndex={-1} className={`menu-panel fs-menu${flip.x ? ' flip-x' : ''}${flip.y ? ' flip-y' : ''}`} onKeyDown={onKeyDown} onMouseLeave={onLeave}>
      {entries.map((e, i) => {
        if (e.kind === 'sep') return <div key={`sep${i}`} className="menu-sep" role="separator" />;
        if (e.kind === 'custom') return <div key={e.id}>{e.render(close)}</div>;
        const isOpen = e.kind === 'submenu' && open === i;
        return (
          <div
            key={i}
            className="fs-menu-row"
            onMouseEnter={() => {
              highlight(i);
              setOpen(e.kind === 'submenu' && !e.disabled ? i : null);
              if (e.kind !== 'submenu' && !isTyping(document.activeElement)) ref.current?.focus();
            }}
          >
            <button
              type="button"
              tabIndex={-1}
              role={e.kind !== 'item' ? 'menuitem' : e.radio ? 'menuitemradio' : e.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={e.kind === 'item' ? e.checked : undefined}
              aria-haspopup={e.kind === 'submenu' ? 'menu' : undefined}
              aria-expanded={e.kind === 'submenu' ? isOpen : undefined}
              aria-keyshortcuts={e.kind === 'item' && e.shortcut ? ariaShortcut(e.shortcut) : undefined}
              disabled={e.disabled}
              className={`menu-item${i === active ? ' is-active' : ''}`}
              onClick={() => activate(i)}
            >
              {e.kind === 'item' && e.checked !== undefined && <Check size={13} className={e.checked ? undefined : 'is-hidden'} />}
              {e.kind === 'item' && e.icon}
              <span>{e.label}</span>
              {e.kind === 'item' && e.shortcut && (
                <span className="menu-shortcut" aria-hidden>
                  {e.shortcut}
                </span>
              )}
              {e.kind === 'submenu' && <ChevronRight size={13} className="menu-shortcut" />}
            </button>
            {isOpen && <MenuList entries={e.entries} close={close} onBack={back} />}
          </div>
        );
      })}
    </div>
  );
}
