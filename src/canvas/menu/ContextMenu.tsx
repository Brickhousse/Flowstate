import { Check, ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type MenuEntry =
  | { kind: 'item'; label: string; shortcut?: string; disabled?: boolean; checked?: boolean; icon?: ReactNode; run: () => void }
  | { kind: 'submenu'; label: string; disabled?: boolean; entries: MenuEntry[] }
  | { kind: 'custom'; id: string; render: (close: () => void) => ReactNode }
  | { kind: 'sep' };

export type MenuAnchor = { x: number; y: number };

type Actionable = Extract<MenuEntry, { kind: 'item' | 'submenu' }>;

function actionable(e: MenuEntry | undefined): e is Actionable {
  return !!e && (e.kind === 'item' || e.kind === 'submenu') && !e.disabled;
}

function MenuList({ entries, close, onBack }: { entries: MenuEntry[]; close: () => void; onBack?: () => void }) {
  const [active, setActive] = useState(() => entries.findIndex(actionable));
  const [open, setOpen] = useState<number | null>(null);
  const [flip, setFlip] = useState({ x: false, y: false });
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setFlip({ x: r.right > window.innerWidth - 4, y: r.bottom > window.innerHeight - 4 });
    ref.current?.focus();
  }, []);

  const move = (dir: 1 | -1) => {
    for (let i = 1; i <= entries.length; i++) {
      const j = (active + dir * i + entries.length) % entries.length;
      if (actionable(entries[j])) return setActive(j);
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
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div ref={ref} role="menu" tabIndex={-1} className={`menu-panel fs-menu${flip.x ? ' flip-x' : ''}${flip.y ? ' flip-y' : ''}`} onKeyDown={onKeyDown}>
      {entries.map((e, i) => {
        if (e.kind === 'sep') return <div key={`sep${i}`} className="menu-sep" role="separator" />;
        if (e.kind === 'custom') return <div key={e.id}>{e.render(close)}</div>;
        const isOpen = e.kind === 'submenu' && open === i;
        return (
          <div
            key={e.label}
            className="fs-menu-row"
            onMouseEnter={() => {
              setActive(i);
              setOpen(e.kind === 'submenu' && !e.disabled ? i : null);
              if (e.kind !== 'submenu') ref.current?.focus();
            }}
          >
            <button
              type="button"
              tabIndex={-1}
              role={e.kind === 'item' && e.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={e.kind === 'item' ? e.checked : undefined}
              aria-haspopup={e.kind === 'submenu' ? 'menu' : undefined}
              aria-expanded={e.kind === 'submenu' ? isOpen : undefined}
              disabled={e.disabled}
              className={`menu-item${i === active ? ' is-active' : ''}`}
              onClick={() => activate(i)}
            >
              {e.kind === 'item' && e.checked !== undefined && <Check size={13} className={e.checked ? undefined : 'is-hidden'} />}
              {e.kind === 'item' && e.icon}
              <span>{e.label}</span>
              {e.kind === 'item' && e.shortcut && <span className="menu-shortcut">{e.shortcut}</span>}
              {e.kind === 'submenu' && <ChevronRight size={13} className="menu-shortcut" />}
            </button>
            {isOpen && <MenuList entries={e.entries} close={close} onBack={back} />}
          </div>
        );
      })}
    </div>
  );
}

export function ContextMenu({ at, entries, onClose }: { at: MenuAnchor; entries: MenuEntry[]; onClose: () => void }) {
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
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('wheel', onClose, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('wheel', onClose, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div ref={ref} className="fs-context-menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <MenuList entries={entries} close={onClose} />
    </div>,
    document.body,
  );
}
