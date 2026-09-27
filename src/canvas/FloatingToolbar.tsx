import { NodeToolbar, Position } from '@xyflow/react';
import { Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { fillOf, TINTS } from '../model/color';
import { DurationError, formatDuration, parseDuration } from '../model/duration';
import { ACTORS, FLAG_KINDS, SHAPES, STATUSES, type BoardNode } from '../model/types';
import { updateSteps, type StepFields } from '../ops/steps';
import { useFlow } from '../store/store';
import { ColorInput, Divider, FieldInput, ToolButton } from '../ui/controls';
import { notify } from '../ui/toast';
import { addFlagAndFocus, editBoard } from './boardChange';
import { FlagList } from './FlagList';
import { ACTOR_LABEL, ActorIcon, FLAG_KEY, FLAG_LABEL, FlagIcon, SHAPE_LABEL } from './labels';
import { ShapeIcon } from './ShapeSvg';

type Panel = 'shape' | 'color' | 'more' | null;

export function FloatingToolbar({ node }: { node: BoardNode }) {
  const visible = useFlow((s) => s.selection.length === 1 && s.selection[0] === node.id && s.editingId !== node.id && s.edgeSelection.length === 0);
  const [panel, setPanel] = useState<Panel>(null);
  const fill = fillOf(node.color);
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);
  const update = (patch: StepFields) => editBoard((b) => updateSteps(b, [{ id: node.id, ...patch }]));
  const setDuration = (text: string) => {
    try {
      update({ durationMin: parseDuration(text) });
    } catch (err) {
      if (err instanceof DurationError) notify(err.message);
      else throw err;
    }
  };

  return (
    <NodeToolbar isVisible={visible} position={Position.Top} offset={14} className="fs-toolbar nodrag nopan">
      <div className="fs-toolbar-row">
        <ToolButton title="Shape (1-9)" active={panel === 'shape'} onClick={() => toggle('shape')}>
          <ShapeIcon shape={node.shape} />
        </ToolButton>
        <Divider />
        {ACTORS.map((a) => (
          <ToolButton key={a} title={`${ACTOR_LABEL[a]} (A)`} active={node.actor === a} className={`actor-${a}`} onClick={() => update({ actor: node.actor === a ? null : a })}>
            <ActorIcon actor={a} size={14} />
          </ToolButton>
        ))}
        <Divider />
        <FieldInput label="Duration" width={70} placeholder="2h" value={node.durationMin === null ? '' : formatDuration(node.durationMin)} onCommit={setDuration} />
        <FieldInput label="Owner" width={124} placeholder="Owner" value={node.owner} onCommit={(owner) => update({ owner })} />
        <Divider />
        {FLAG_KINDS.map((k) => (
          <ToolButton key={k} title={`Add ${FLAG_LABEL[k].toLowerCase()} (${FLAG_KEY[k]})`} className={`flag-tool flag-tool-${k}`} onClick={() => addFlagAndFocus(node.id, k)}>
            <FlagIcon kind={k} size={14} />
          </ToolButton>
        ))}
        <ToolButton title="Colour" active={panel === 'color'} onClick={() => toggle('color')}>
          <span className={`fs-swatch swatch-${fill?.kind === 'tint' ? fill.tint : 'none'}`} style={fill?.kind === 'hex' ? { background: fill.hex } : undefined} />
        </ToolButton>
        <ToolButton title="More details" active={panel === 'more'} onClick={() => toggle('more')}>
          <Ellipsis size={15} />
        </ToolButton>
      </div>
      {panel === 'shape' && (
        <div className="fs-toolbar-row">
          {SHAPES.map((s, i) => (
            <ToolButton key={s} title={`${SHAPE_LABEL[s]} (${i + 1})`} active={node.shape === s} onClick={() => update({ shape: s })}>
              <ShapeIcon shape={s} />
            </ToolButton>
          ))}
        </div>
      )}
      {panel === 'color' && (
        <div className="fs-toolbar-row">
          {[null, ...TINTS].map((c) => (
            <ToolButton key={c ?? 'none'} title={c ?? 'Default'} active={node.color === c} onClick={() => update({ color: c })}>
              <span className={`fs-swatch swatch-${c ?? 'none'}`} />
            </ToolButton>
          ))}
          <ColorInput label="Custom colour" value={node.color} className="fs-color-input" onPick={(hex) => update({ color: hex })} />
        </div>
      )}
      {panel === 'more' && (
        <div className="fs-toolbar-row">
          <FieldInput label="Note" width={220} placeholder="One-line note" value={node.note} onCommit={(note) => update({ note })} />
          <select className="fs-field nodrag" aria-label="Status" value={node.status ?? ''} onChange={(e) => update({ status: STATUSES.find((s) => s === e.target.value) ?? null })}>
            <option value="">No status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <FieldInput label="Replaces" width={170} placeholder="Old steps this replaces" value={node.replaces} onCommit={(replaces) => update({ replaces })} />
        </div>
      )}
      {node.flags.length > 0 && <FlagList flags={node.flags} />}
    </NodeToolbar>
  );
}
