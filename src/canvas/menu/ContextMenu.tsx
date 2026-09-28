import { Check, ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isTyping } from '../useKeyboard';

export type MenuEntry =
  | { kind: 'item'; label: string; shortcut?: string; disabled?: boolean; checked?: boolean; radio?: boolean; icon?: ReactNode; preview?: () => void; run: () => void }
  | { kind: 'submenu'; label: string; disabled?: boolean; entries: MenuEntry[] }
  | { kind: 'custom'; id: string; render: (close: () => void) => ReactNode }
  | { kind: 'sep' };

export type MenuAnchor = { x: number; y: number };

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

type ListProps = { entries: MenuEntry[]; close: () => void; onBack?: () => void; label?: string; passKeys?: boolean };

function MenuList({ entries, close, onBack, label, passKeys }: ListProps) {
  const [active, setActive] = useState(() => entries.findIndex(actionable));
  const [open, setOpen] = useState<number | null>(null);
  const [flip, setFlip] = useState({ x: false, y: false });
  const ref = useRef<HTMLDivElement>(null);

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
      if (actionable(entries[j])) return highlight(j);
    }
  };
  const activate = (i: number) => {
    const e = entries[i];
    if (!actionable(e)) return;
    if (e.kind === 'submenu') return setOpen(i);
    close();
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
    <div ref={ref} role="menu" aria-label={label} tabIndex={-1} className={`menu-panel fs-menu${flip.x ? ' flip-x' : ''}${flip.y ? ' flip-y' : ''}`} onKeyDown={onKeyDown}>
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
              if (e.kind !== 'submenu') ref.current?.focus();
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

type MenuProps = { at: MenuAnchor; entries: MenuEntry[]; label?: string; passKeys?: boolean; onClose: () => void };

// passKeys: keys other than Up, Down, Enter and Escape close the menu and carry on to the canvas shortcuts.
export function ContextMenu({ at, entries, label, passKeys, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);

  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: Math.max(4, Math.min(at.x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(at.y, window.innerHeight - r.height - 4)) });
  }, [at]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // A native colour dialog blurs the window; closing then would unmount the input before its change fires.
    const onBlur = () => {
      const a = document.activeElement;
      if (!(a instanceof HTMLInputElement && a.type === 'color' && ref.current?.contains(a))) onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('wheel', onClose, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('wheel', onClose, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div ref={ref} className="fs-context-menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <MenuList entries={entries} close={onClose} label={label} passKeys={passKeys} />
    </div>,
    document.body,
  );
}
