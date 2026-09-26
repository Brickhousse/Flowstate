import { Check, Magnet } from 'lucide-react';
import { LAYOUT_PREFS, layoutPrefs, PREF_LABEL, useLayoutPrefs } from '../store/layoutPrefs';
import { MenuButton } from './Popover';

const SHORTCUT: Partial<Record<(typeof LAYOUT_PREFS)[number], string>> = { gridSnap: "Ctrl+'" };

export function LayoutMenu() {
  const prefs = useLayoutPrefs();
  return (
    <MenuButton
      title="Layout assists"
      label={
        <>
          <Magnet size={14} />
          <span>Layout</span>
        </>
      }
    >
      {() =>
        LAYOUT_PREFS.map((k) => (
          <button key={k} type="button" role="menuitemcheckbox" aria-checked={prefs[k]} className="menu-item" onClick={() => layoutPrefs.getState().toggle(k)}>
            <Check size={14} className={prefs[k] ? undefined : 'is-hidden'} />
            <span>{PREF_LABEL[k]}</span>
            {SHORTCUT[k] && <span className="menu-shortcut">{SHORTCUT[k]}</span>}
          </button>
        ))
      }
    </MenuButton>
  );
}
