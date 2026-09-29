import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { Clock } from 'lucide-react';
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { fillOf } from '../model/color';
import { formatDuration } from '../model/duration';
import { firstLine, hasMoreLines } from '../model/note';
import type { Side } from '../model/types';
import { flowStore, useFlow } from '../store/store';
import { AddHandles } from './AddHandles';
import { endResize } from './assist/overlay';
import { RESIZE_MIN } from './assist/snap';
import { FlagBadges } from './FlagBadges';
import { FloatingToolbar } from './FloatingToolbar';
import { ACTOR_LABEL, ActorIcon } from './labels';
import { NOTE_MARKER_CLASS, NOTE_TOGGLE_CLASS } from './note/noteControls';
import { ShapeSvg } from './ShapeSvg';
import { StepTitle } from './StepTitle';
import type { StepFlowNode } from './toFlow';

const HANDLES: Array<[Side, Position]> = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
];

const begin = () => flowStore.getState().begin();
const MARKER_CLASS = `${NOTE_MARKER_CLASS} nodrag nopan ${NOTE_TOGGLE_CLASS}`;

function noteOverflows(body: HTMLElement): boolean {
  const text = body.querySelector(':scope > .fs-note > .fs-note-text');
  return !!text && text.scrollWidth > text.clientWidth;
}

function markNoteOverflow(body: HTMLElement, overflows: boolean): void {
  body.querySelector(':scope > .fs-note')?.toggleAttribute('data-overflow', overflows);
}

function fitTitle(body: HTMLElement): void {
  const title = body.querySelector(':scope > div.fs-title');
  if (!title) return;
  const style = getComputedStyle(body);
  const gap = parseFloat(style.rowGap) || 0;
  let room = body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  for (const child of body.children) if (child !== title) room -= child.getBoundingClientRect().height + gap;
  const line = parseFloat(getComputedStyle(title).lineHeight);
  body.style.setProperty('--title-lines', String(Math.max(1, Math.floor(room / line))));
}

export const StepNode = memo(function StepNode({ id, data, selected }: NodeProps<StepFlowNode>) {
  const editing = useFlow((s) => s.editingId === id);
  const { node, critical, dimmed, glowing, editable } = data;
  const body = useRef<HTMLDivElement>(null);
  const noteLine = useMemo(() => ({ first: firstLine(node.note), more: hasMoreLines(node.note) }), [node.note]);
  useLayoutEffect(() => {
    if (!body.current) return;
    // Overflow is read before fitTitle writes and marked after, so every read shares one layout.
    const overflows = !noteLine.more && noteOverflows(body.current);
    fitTitle(body.current);
    markNoteOverflow(body.current, overflows);
  }, [node.w, node.h, node.shape, node.title, noteLine, node.owner, node.durationMin, critical, editing]);
  const fill = fillOf(node.color);
  const className = [
    'fs-step',
    `shape-${node.shape}`,
    node.actor && `actor-${node.actor}`,
    fill?.kind === 'tint' && `tint-${fill.tint}`,
    fill?.kind === 'hex' && `ink-${fill.ink}`,
    selected && 'is-selected',
    critical && 'is-critical',
    dimmed && 'is-dimmed',
    glowing && 'is-glowing',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} style={{ width: node.w, height: node.h }} data-testid={`node-${id}`} title={node.replaces ? `Replaces: ${node.replaces}` : undefined}>
      {editable && <NodeResizer isVisible={selected} minWidth={RESIZE_MIN.step.w} minHeight={RESIZE_MIN.step.h} onResizeStart={begin} onResizeEnd={endResize} />}
      {editable && selected && <FloatingToolbar node={node} />}
      <ShapeSvg shape={node.shape} w={node.w} h={node.h} fill={fill?.kind === 'hex' ? fill.hex : undefined} />
      {node.actor && (
        <span className="fs-actor-chip" title={ACTOR_LABEL[node.actor]}>
          <ActorIcon actor={node.actor} />
        </span>
      )}
      <div ref={body} className="fs-step-body">
        <StepTitle node={node} editable={editable} />
        {node.note && (
          <div className={noteLine.more ? 'fs-note has-more' : 'fs-note'}>
            <span className="fs-note-text">{noteLine.first}</span>
            <button type="button" className={MARKER_CLASS} title="Open note" aria-label="Open note" aria-haspopup="dialog" aria-expanded="false" />
          </div>
        )}
        {(node.owner || node.durationMin !== null || critical) && (
          <div className="fs-step-meta">
            {node.owner && <span className="fs-owner">{node.owner}</span>}
            {node.durationMin !== null ? (
              <span>
                <Clock size={10} />
                {formatDuration(node.durationMin)}
              </span>
            ) : (
              critical && <span className="fs-no-duration">no duration</span>
            )}
          </div>
        )}
      </div>
      <FlagBadges flags={node.flags} />
      {node.status && <span className={`fs-status status-${node.status}`} title={node.status} />}
      {editable && !editing && <AddHandles nodeId={id} />}
      {HANDLES.map(([side, position]) => (
        <Handle key={side} id={side} type="source" position={position} className="fs-handle" isConnectable={editable} />
      ))}
    </div>
  );
});
