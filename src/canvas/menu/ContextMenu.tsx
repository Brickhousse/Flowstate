import { Check, ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { isTyping } from '../useKeyboard';
import { focusStops, MenuFooter } from './MenuFooter';

export type MenuEntry =
  | { kind: 'item'; label: string; shortcut?: string; disabled?: boolean; checked?: boolean; radio?: boolean; icon?: ReactNode; keepOpen?: boolean; preview?: () => void; run: () => void }
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

function MenuList({ entries, close, onBack, onTab, onLeave, label, passKeys, listRef }: ListProps) {
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

type MenuProps = { at: MenuAnchor; entries: MenuEntry[]; label?: string; passKeys?: boolean; footer?: ReactNode; onListLeave?: () => void; onClose: () => void };

// passKeys: keys other than Up, Down, Enter and Escape close the menu and carry on to the canvas shortcuts.
// footer: a section below the list that Tab reaches; it grows the menu into one panel.
export function ContextMenu({ at, entries, label, passKeys, footer, onListLeave, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const clamp = () => {
      const r = el.getBoundingClientRect();
      const x = Math.max(4, Math.min(at.x, window.innerWidth - r.width - 4));
      const y = Math.max(4, Math.min(at.y, window.innerHeight - r.height - 4));
      setPos((p) => (p.x === x && p.y === y ? p : { x, y }));
    };
    clamp();
    const resized = new ResizeObserver(clamp);
    resized.observe(el);
    return () => resized.disconnect();
  }, [at]);

  const scrolls = !!footer;
  useEffect(() => {
    const outside = (e: PointerEvent | WheelEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    // A native colour dialog blurs the window; closing then would unmount the input before its change fires.
    const onBlur = () => {
      const a = document.activeElement;
      if (!(a instanceof HTMLInputElement && a.type === 'color' && ref.current?.contains(a))) onClose();
    };
    window.addEventListener('pointerdown', outside, true);
    // Only the footer panel caps its list height, so only there does a wheel inside it scroll instead of closing.
    const onWheel = scrolls ? outside : onClose;
    window.addEventListener('wheel', onWheel, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, scrolls]);

  const toFooter = (back: boolean) => focusStops(foot.current).at(back ? -1 : 0)?.focus();
  return createPortal(
    <div ref={ref} className={`fs-context-menu${footer ? ' has-footer' : ''}`} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <MenuList entries={entries} close={onClose} label={label} passKeys={passKeys} listRef={list} onTab={footer ? toFooter : undefined} onLeave={onListLeave} />
      {footer && (
        <MenuFooter ref={foot} list={list} onClose={onClose}>
          {footer}
        </MenuFooter>
      )}
    </div>,
    document.body,
  );
}
