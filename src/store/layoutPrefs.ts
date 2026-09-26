import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export const LAYOUT_PREFS = ['gridSnap', 'smartGuides', 'spacingGuides', 'resizeSnap', 'arrowNudge'] as const;
export type LayoutPref = (typeof LAYOUT_PREFS)[number];
export type LayoutPrefs = Record<LayoutPref, boolean>;

export const PREFS_KEY = 'flowstate.layoutPrefs';
export const DEFAULT_PREFS: LayoutPrefs = { gridSnap: true, smartGuides: true, spacingGuides: true, resizeSnap: true, arrowNudge: true };
export const PREF_LABEL: Record<LayoutPref, string> = {
  gridSnap: 'Snap to grid',
  smartGuides: 'Smart guides',
  spacingGuides: 'Spacing guides',
  resizeSnap: 'Snap while resizing',
  arrowNudge: 'Ctrl+arrow nudge',
};

type Reader = Pick<Storage, 'getItem'>;
type ReadWriter = Pick<Storage, 'getItem' | 'setItem'>;

export function loadPrefs(storage: Reader | undefined): LayoutPrefs {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed: unknown = JSON.parse(raw);
    const stored = new Map(parsed && typeof parsed === 'object' ? Object.entries(parsed) : []);
    const out = { ...DEFAULT_PREFS };
    for (const k of LAYOUT_PREFS) {
      const v = stored.get(k);
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage: ReadWriter | undefined, prefs: LayoutPrefs): void {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private windows and full quotas refuse writes; the in-memory prefs still apply.
  }
}

export function createLayoutPrefs(storage: ReadWriter | undefined) {
  return createStore<{ prefs: LayoutPrefs; toggle(k: LayoutPref): void }>()((set, get) => ({
    prefs: loadPrefs(storage),
    toggle(k) {
      const prefs = { ...get().prefs, [k]: !get().prefs[k] };
      set({ prefs });
      savePrefs(storage, prefs);
    },
  }));
}

function browserStorage(): ReadWriter | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export const layoutPrefs = createLayoutPrefs(browserStorage());

export function useLayoutPrefs(): LayoutPrefs {
  return useStore(layoutPrefs, (s) => s.prefs);
}
