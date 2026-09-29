import { toPng, toSvg } from 'html-to-image';
import { boundsOf, type Rect } from '../layout/place';
import type { Board } from '../model/types';
import { flowStore } from '../store/store';
import { download, slug } from './download';

const PADDING = 48;
const MAX_SIDE = 8000;
const HIDDEN = ['fs-toolbar', 'fs-add', 'fs-handle', 'react-flow__resize-control', 'fs-note-marker'];

function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let n = 0;
    const tick = () => (++n >= count ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
}

export function exportBounds(board: Board, selection: string[]): Rect | null {
  const picked = selection.length ? board.nodes.filter((n) => selection.includes(n.id)) : board.nodes;
  return boundsOf(picked);
}

export async function exportBoardImage(kind: 'png' | 'svg'): Promise<void> {
  const st = flowStore.getState();
  const board = st.project.boards.find((b) => b.id === st.activeBoardId)!;
  const bounds = exportBounds(board, st.selection);
  if (!bounds) throw new Error('The board is empty.');
  st.setExporting(true);
  try {
    await nextFrames(3);
    const el = document.querySelector<HTMLElement>('.fs-canvas-main .react-flow__viewport');
    if (!el) throw new Error('Canvas not found.');
    const fullW = bounds.w + PADDING * 2;
    const fullH = bounds.h + PADDING * 2;
    const scale = Math.min(1, MAX_SIDE / Math.max(fullW, fullH));
    const width = Math.ceil(fullW * scale);
    const height = Math.ceil(fullH * scale);
    const options = {
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),
      width,
      height,
      style: { width: `${width}px`, height: `${height}px`, transform: `translate(${(PADDING - bounds.x) * scale}px, ${(PADDING - bounds.y) * scale}px) scale(${scale})` },
      filter: (node: HTMLElement) => !(node.classList && HIDDEN.some((c) => node.classList.contains(c))),
    };
    const url = kind === 'png' ? await toPng(el, { ...options, pixelRatio: scale < 1 ? 1 : 2 }) : await toSvg(el, options);
    download(url, `${slug(st.project.name)}-${slug(board.name)}.${kind}`);
  } finally {
    st.setExporting(false);
  }
}
