import { useReactFlow, useStoreApi } from '@xyflow/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { boundsOf } from '../../layout/geometry';
import type { XY } from '../../model/types';
import { flowStore } from '../../store/store';
import { isTyping } from '../useKeyboard';
import { ContextMenu } from './ContextMenu';
import type { MenuEntry } from './MenuList';
import { nodeEntries, paneEntries } from './entries';

const CLICK_SLOP = 4;

// Spec: match size uses the right-clicked node, not just any selected one.
function topSelectedAt(x: number, y: number, selection: string[]): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const id = el.closest('.react-flow__node')?.getAttribute('data-id');
    if (id && selection.includes(id)) return id;
  }
  return null;
}

export function useCanvasMenu(boardId: string, editable: boolean): ReactNode {
  const rf = useReactFlow();
  const rfStore = useStoreApi();
  const [menu, setMenu] = useState<{ at: XY; entries: MenuEntry[]; n: number } | null>(null);
  const opens = useRef(0);
  const close = useCallback(() => setMenu(null), []);

  useEffect(() => setMenu(null), [boardId]);

  useEffect(() => {
    if (!editable) return;
    let down: XY | null = null;
    const inCanvas = (t: EventTarget | null): t is Element => t instanceof Element && !!rfStore.getState().domNode?.contains(t);
    // why: ADR-0012
    const onContextMenu = (e: MouseEvent) => {
      if (inCanvas(e.target) && !isTyping(e.target)) e.preventDefault();
    };
    const onDown = (e: PointerEvent) => {
      down = e.button === 2 && inCanvas(e.target) && !isTyping(e.target) ? { x: e.clientX, y: e.clientY } : null;
    };
    const onUp = (e: PointerEvent) => {
      const start = down;
      down = null;
      if (e.button !== 2 || !start || !inCanvas(e.target)) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) >= CLICK_SLOP) return;
      if (e.target.closest('.react-flow__edge, .react-flow__minimap, .react-flow__controls')) return;
      const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = e.target.closest('.react-flow__node')?.getAttribute('data-id');
      const st = flowStore.getState();
      let refId: string | null = null;
      if (e.target.closest('.react-flow__nodesselection') && st.selection.length) {
        refId = topSelectedAt(e.clientX, e.clientY, st.selection) ?? st.selection[0];
      } else if (id && !id.startsWith('lane:')) {
        if (!st.selection.includes(id)) st.select([id]);
        refId = id;
      }
      const entries = refId ? nodeEntries(boardId, refId, at) : paneEntries(boardId, at);
      setMenu({ at: { x: e.clientX, y: e.clientY }, entries, n: ++opens.current });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
      const st = flowStore.getState();
      if (isTyping(e.target) || st.activeBoardId !== boardId || !st.selection.length) return;
      const b = st.project.boards.find((x) => x.id === boardId);
      const box = b && boundsOf(b.nodes.filter((n) => st.selection.includes(n.id)));
      if (!box) return;
      e.preventDefault();
      const corner = { x: box.x, y: box.y + box.h };
      setMenu({ at: rf.flowToScreenPosition(corner), entries: nodeEntries(boardId, st.selection[0], corner), n: ++opens.current });
    };
    document.addEventListener('contextmenu', onContextMenu, true);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [boardId, editable, rf, rfStore]);

  return menu ? <ContextMenu key={menu.n} at={menu.at} entries={menu.entries} onClose={close} /> : null;
}
