import { tidyBoard } from '../../layout/tidyBoard';
import { LAYOUT_PREFS, layoutPrefs, PREF_LABEL } from '../../store/layoutPrefs';
import { flowStore } from '../../store/store';
import { notify } from '../../ui/toast';
import { copySelection, cutSelection, duplicateSelection, pasteClipboard, removeSelection, type XY } from '../commands';
import type { MenuEntry } from './ContextMenu';

export function editEntries(boardId: string, at: XY): MenuEntry[] {
  const clip = flowStore.getState().clipboard;
  return [
    { kind: 'item', label: 'Cut', shortcut: 'Ctrl+X', run: () => cutSelection(boardId) },
    { kind: 'item', label: 'Copy', shortcut: 'Ctrl+C', run: () => copySelection(boardId) },
    { kind: 'item', label: 'Paste', shortcut: 'Ctrl+V', disabled: !clip, run: () => pasteClipboard(boardId, at) },
    { kind: 'item', label: 'Duplicate', shortcut: 'Ctrl+D', run: () => duplicateSelection(boardId) },
    { kind: 'item', label: 'Delete', shortcut: 'Del', run: () => removeSelection(boardId) },
  ];
}

export function nodeEntries(boardId: string, at: XY): MenuEntry[] {
  return editEntries(boardId, at);
}

export function paneEntries(boardId: string, at: XY): MenuEntry[] {
  const st = flowStore.getState();
  const prefs = layoutPrefs.getState().prefs;
  const ids = st.project.boards.find((b) => b.id === boardId)?.nodes.map((n) => n.id) ?? [];
  return [
    { kind: 'item', label: 'Paste here', shortcut: 'Ctrl+V', disabled: !st.clipboard, run: () => pasteClipboard(boardId, at) },
    { kind: 'item', label: 'Select all', shortcut: 'Ctrl+A', disabled: !ids.length, run: () => flowStore.getState().select(ids) },
    {
      kind: 'item',
      label: 'Tidy layout',
      shortcut: 'L',
      run: () => void tidyBoard(flowStore, boardId).catch((err: unknown) => notify(`Tidy failed: ${err instanceof Error ? err.message : String(err)}`)),
    },
    { kind: 'sep' },
    ...LAYOUT_PREFS.map((k): MenuEntry => ({ kind: 'item', label: PREF_LABEL[k], checked: prefs[k], run: () => layoutPrefs.getState().toggle(k) })),
  ];
}
