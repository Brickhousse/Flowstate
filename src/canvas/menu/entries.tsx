import { tidyBoard } from '../../layout/tidyBoard';
import { TINTS } from '../../model/color';
import type { Board, XY } from '../../model/types';
import { ALIGN_EDGES, alignNodes, distributeNodes, matchSize, reorder, type AlignEdge, type DistributeAxis, type MatchDims, type OrderMove } from '../../ops/arrange';
import { updateSteps } from '../../ops/steps';
import { LAYOUT_PREFS, layoutPrefs, PREF_LABEL } from '../../store/layoutPrefs';
import { flowStore } from '../../store/store';
import { ColorInput } from '../../ui/controls';
import { notify } from '../../ui/toast';
import { arrangeSelection, copySelection, cutSelection, duplicateSelection, pasteClipboard, removeSelection, run } from '../commands';
import type { MenuEntry } from './MenuList';

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

const ALIGN_LABEL: Record<AlignEdge, string> = { left: 'Left', center: 'Center', right: 'Right', top: 'Top', middle: 'Middle', bottom: 'Bottom' };
const DISTRIBUTE: Array<[string, DistributeAxis]> = [
  ['Horizontally', 'horizontal'],
  ['Vertically', 'vertical'],
];
const MATCH: Array<[string, MatchDims]> = [
  ['Width', 'width'],
  ['Height', 'height'],
  ['Both', 'both'],
];
const ORDER: Array<[string, OrderMove, string]> = [
  ['Bring to front', 'front', 'Ctrl+Shift+]'],
  ['Bring forward', 'forward', 'Ctrl+]'],
  ['Send backward', 'backward', 'Ctrl+['],
  ['Send to back', 'back', 'Ctrl+Shift+['],
];

function colourEntries(boardId: string, steps: string[], current: string | null): MenuEntry[] {
  const paint = (color: string | null) => run(boardId, (b) => updateSteps(b, steps.map((id) => ({ id, color }))));
  return [
    { kind: 'item', label: 'Default', icon: <span className="fs-swatch swatch-none" />, run: () => paint(null) },
    ...TINTS.map((t): MenuEntry => ({ kind: 'item', label: t[0].toUpperCase() + t.slice(1), icon: <span className={`fs-swatch swatch-${t}`} />, run: () => paint(t) })),
    {
      kind: 'custom',
      id: 'custom-colour',
      render: (close) => (
        <ColorInput
          label="Custom colour"
          value={current}
          className="menu-item fs-color-input"
          onPick={(hex) => {
            paint(hex);
            close();
          }}
        >
          Custom…
        </ColorInput>
      ),
    },
  ];
}

export function nodeEntries(boardId: string, refId: string, at: XY): MenuEntry[] {
  const st = flowStore.getState();
  const board = st.project.boards.find((b) => b.id === boardId);
  const sel = st.selection;
  const kindOf = (id: string) => board?.nodes.find((n) => n.id === id)?.kind;
  const steps = sel.filter((id) => kindOf(id) === 'step');
  const onSel = (fn: (b: Board, ids: string[]) => unknown) => () => arrangeSelection(boardId, fn);
  const item = (label: string, action: () => void, shortcut?: string): MenuEntry => ({ kind: 'item', label, run: action, shortcut });
  const current = board?.nodes.find((n) => n.id === refId)?.color ?? null;
  return [
    ...editEntries(boardId, at),
    { kind: 'sep' },
    { kind: 'submenu', label: 'Align', disabled: sel.length < 2, entries: ALIGN_EDGES.map((edge) => item(ALIGN_LABEL[edge], onSel((b, ids) => alignNodes(b, ids, edge)))) },
    { kind: 'submenu', label: 'Distribute', disabled: sel.length < 3, entries: DISTRIBUTE.map(([label, axis]) => item(label, onSel((b, ids) => distributeNodes(b, ids, axis)))) },
    { kind: 'submenu', label: 'Match size', disabled: sel.length < 2, entries: MATCH.map(([label, dims]) => item(label, onSel((b, ids) => matchSize(b, ids, refId, dims)))) },
    { kind: 'submenu', label: 'Arrange', entries: ORDER.map(([label, move, keys]) => item(label, onSel((b, ids) => reorder(b, ids, move)), keys)) },
    { kind: 'submenu', label: 'Colour', disabled: !steps.length, entries: colourEntries(boardId, steps, current) },
  ];
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
