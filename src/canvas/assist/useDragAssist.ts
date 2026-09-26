import { useStoreApi } from '@xyflow/react';
import { useEffect, useMemo, useRef } from 'react';
import { boundsOf, type Rect } from '../../layout/geometry';
import type { Board } from '../../model/types';
import { layoutPrefs } from '../../store/layoutPrefs';
import { flowStore } from '../../store/store';
import { buildCandidates, rectOf, type SizeOf } from './candidates';
import { mods, watchModifiers } from './modifiers';
import { assistOverlay, clearOverlay } from './overlay';
import { lockAxis, snapMove, type Axis, type Candidates } from './snap';

export type XY = { x: number; y: number };
export type Size = { width: number; height: number };

interface Session {
  ids: string[];
  start: Map<string, XY>;
  ghosts: Rect[];
  box: Rect;
  cands: Candidates;
  delta: XY;
}

export interface DragAssist {
  active(): boolean;
  start(ids: string[]): void;
  adjustMove(positions: Record<string, XY>): void;
  finish(): void;
}

export function useDragAssist(boardId: string, editable: boolean, measured: ReadonlyMap<string, Size>): DragAssist {
  const rfStore = useStoreApi();
  const session = useRef<Session | null>(null);

  useEffect(() => {
    if (!editable) return;
    return watchModifiers(() => {
      const s = session.current;
      if (s) assistOverlay.setState({ ghosts: mods.ctrl ? s.ghosts : [] });
    });
  }, [editable]);

  return useMemo(() => {
    const boardOf = (): Board | undefined => flowStore.getState().project.boards.find((b) => b.id === boardId);
    const sizeOf: SizeOf = (id) => {
      const m = measured.get(id);
      return m ? { w: m.width, h: m.height } : undefined;
    };
    const view = (): { rect: Rect; zoom: number } => {
      const { width, height, transform } = rfStore.getState();
      const [tx, ty, zoom] = transform;
      return { rect: { x: -tx / zoom, y: -ty / zoom, w: width / zoom, h: height / zoom }, zoom };
    };
    return {
      active: () => session.current !== null,
      start(ids) {
        const b = boardOf();
        if (!b || !editable) return;
        const dragged = new Set(ids);
        const start = new Map<string, XY>();
        for (const n of b.nodes) if (dragged.has(n.id) || (n.groupId && dragged.has(n.groupId))) start.set(n.id, { x: n.x, y: n.y });
        const ghosts = b.nodes.filter((n) => dragged.has(n.id)).map((n) => rectOf(n, sizeOf));
        const box = boundsOf(ghosts);
        if (!box) return;
        session.current = { ids, start, ghosts, box, cands: buildCandidates(b, ids, box, view().rect, sizeOf), delta: { x: 0, y: 0 } };
      },
      adjustMove(positions) {
        const s = session.current;
        const ref = s?.ids.find((id) => positions[id] && s.start.has(id));
        const origin = ref ? s?.start.get(ref) : undefined;
        if (!s || !ref || !origin) return;
        let dx = positions[ref].x - origin.x;
        let dy = positions[ref].y - origin.y;
        let lock: Axis | null = null;
        if (mods.shift) {
          lock = lockAxis(dx, dy);
          if (lock === 'x') dy = 0;
          else dx = 0;
        }
        const moving = { ...s.box, x: s.box.x + dx, y: s.box.y + dy };
        const snap = snapMove(moving, s.cands, layoutPrefs.getState().prefs, view().zoom, { alt: mods.alt, lock });
        s.delta = { x: dx + snap.dx, y: dy + snap.dy };
        for (const id of s.ids) {
          const p = s.start.get(id);
          if (p && positions[id]) positions[id] = { x: p.x + s.delta.x, y: p.y + s.delta.y };
        }
        assistOverlay.setState({ guides: snap.guides, ghosts: mods.ctrl ? s.ghosts : [] });
      },
      finish() {
        session.current = null;
        clearOverlay();
      },
    };
  }, [boardId, editable, measured, rfStore]);
}
