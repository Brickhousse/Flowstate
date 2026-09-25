import { EdgeLabelRenderer } from '@xyflow/react';
import { Trash } from 'lucide-react';
import { EDGE_TYPES, FLAG_KINDS, type BoardEdge, type EdgeType } from '../model/types';
import { deleteEdges, updateEdge } from '../ops/edges';
import { useFlow } from '../store/store';
import { Divider, FieldInput, ToolButton } from '../ui/controls';
import { addFlagAndFocus, editBoard } from './boardChange';
import { FlagList } from './FlagList';
import { EDGE_LABEL, FLAG_KEY, FLAG_LABEL, FlagIcon } from './labels';

function EdgeTypeIcon({ type }: { type: EdgeType }) {
  const dash = type === 'dependency' ? '4 3' : type === 'handoff' ? '1 3' : undefined;
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden>
      <path d="M1 5 H15" stroke="currentColor" strokeWidth="1.6" strokeDasharray={dash} strokeLinecap="round" />
      <path d="M14 1.5 L19 5 L14 8.5 Z" fill="currentColor" />
    </svg>
  );
}

export function EdgeToolbar({ edge, x, y }: { edge: BoardEdge; x: number; y: number }) {
  const visible = useFlow((s) => s.edgeSelection.length === 1 && s.edgeSelection[0] === edge.id && s.selection.length === 0);
  if (!visible) return null;
  return (
    <EdgeLabelRenderer>
      <div className="fs-toolbar fs-edge-toolbar nodrag nopan" style={{ transform: `translate(-50%, calc(-100% - 20px)) translate(${x}px, ${y}px)` }}>
        <div className="fs-toolbar-row">
          {EDGE_TYPES.map((t) => (
            <ToolButton key={t} title={EDGE_LABEL[t]} active={edge.type === t} onClick={() => editBoard((b) => updateEdge(b, edge.id, { type: t }))}>
              <EdgeTypeIcon type={t} />
            </ToolButton>
          ))}
          <Divider />
          <FieldInput
            label="Arrow label"
            width={130}
            placeholder="Label"
            value={edge.label}
            focusKey={`label:${edge.id}`}
            onCommit={(label) => editBoard((b) => updateEdge(b, edge.id, { label }))}
          />
          <Divider />
          {FLAG_KINDS.map((k) => (
            <ToolButton key={k} title={`Add ${FLAG_LABEL[k].toLowerCase()} (${FLAG_KEY[k]})`} className={`flag-tool flag-tool-${k}`} onClick={() => addFlagAndFocus(edge.id, k)}>
              <FlagIcon kind={k} size={14} />
            </ToolButton>
          ))}
          <ToolButton title="Delete arrow (Del)" onClick={() => editBoard((b) => deleteEdges(b, [edge.id]))}>
            <Trash size={14} />
          </ToolButton>
        </div>
        {edge.flags.length > 0 && <FlagList flags={edge.flags} />}
      </div>
    </EdgeLabelRenderer>
  );
}
