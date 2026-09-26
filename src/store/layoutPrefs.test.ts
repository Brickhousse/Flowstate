import { describe, expect, it } from 'vitest';
import { createLayoutPrefs, DEFAULT_PREFS, loadPrefs, PREFS_KEY } from './layoutPrefs';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

describe('layout prefs', () => {
  it('defaults every assist on', () => {
    expect(DEFAULT_PREFS).toEqual({ gridSnap: true, smartGuides: true, spacingGuides: true, resizeSnap: true, arrowNudge: true });
    expect(loadPrefs(fakeStorage())).toEqual(DEFAULT_PREFS);
  });

  it('keeps stored booleans and ignores anything else', () => {
    const s = fakeStorage({ [PREFS_KEY]: JSON.stringify({ gridSnap: false, smartGuides: 'no', bogus: true }) });
    expect(loadPrefs(s)).toEqual({ ...DEFAULT_PREFS, gridSnap: false });
  });

  it('falls back to defaults on corrupt JSON, a throwing store, or no store', () => {
    expect(loadPrefs(fakeStorage({ [PREFS_KEY]: '{' }))).toEqual(DEFAULT_PREFS);
    expect(
      loadPrefs({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toEqual(DEFAULT_PREFS);
    expect(loadPrefs(undefined)).toEqual(DEFAULT_PREFS);
  });

  it('toggle flips one pref and persists it', () => {
    const s = fakeStorage();
    const store = createLayoutPrefs(s);
    store.getState().toggle('spacingGuides');
    expect(store.getState().prefs).toEqual({ ...DEFAULT_PREFS, spacingGuides: false });
    expect(loadPrefs(s)).toEqual({ ...DEFAULT_PREFS, spacingGuides: false });
  });

  it('toggle survives a store that refuses writes', () => {
    const store = createLayoutPrefs({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    store.getState().toggle('gridSnap');
    expect(store.getState().prefs.gridSnap).toBe(false);
  });
});
