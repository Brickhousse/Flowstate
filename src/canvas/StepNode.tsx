import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { Clock } from 'lucide-react';
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { NoteMarker } from './note/NoteMarker';
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

function noteOverflows(body: HTMLElement): boolean {
  const text = body.querySelector(':scope > .fs-note > .fs-note-text');
  return !!text && text.scrollWidth > text.clientWidth;
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
  const [noteCut, setNoteCut] = useState(false);
  const noteLine = useMemo(() => ({ first: firstLine(node.note), more: hasMoreLines(node.note) }), [node.note]);
  useLayoutEffect(() => {
    if (!body.current) return;
    // Read before fitTitle writes, so both measurements share one layout.
    setNoteCut(!hasMoreLines(node.note) && noteOverflows(body.current));
    fitTitle(body.current);
  }, [node.w, node.h, node.shape, node.title, node.note, node.owner, node.durationMin, critical, editing]);
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
          <div className="fs-note">
            <span className="fs-note-text">{noteLine.first}</span>
            {(noteCut || noteLine.more) && <NoteMarker nodeId={id} />}
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
