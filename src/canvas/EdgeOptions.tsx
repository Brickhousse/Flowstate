import { RouteOff, Trash } from 'lucide-react';
import { useState } from 'react';
import { EDGE_TYPES, FLAG_KINDS, type BoardEdge } from '../model/types';
import { resetPath } from '../ops/arrowPath';
import { deleteEdges, updateEdge } from '../ops/edges';
import { Divider, FieldInput, ToolButton } from '../ui/controls';
import { addFlagAndFocus, editBoard } from './boardChange';
import { ColorRow, ColorSwatch } from './ColorPicker';
import { FlagList } from './FlagList';
import { EDGE_LABEL, EdgeTypeIcon, FLAG_KEY, FLAG_LABEL, FlagIcon } from './labels';

export function EdgeOptions({ edge }: { edge: BoardEdge }) {
  const [colorOpen, setColorOpen] = useState(false);
  return (
    <>
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
        <ToolButton title="Colour" active={colorOpen} onClick={() => setColorOpen(!colorOpen)}>
          <ColorSwatch color={edge.color} line />
        </ToolButton>
        {edge.bends.length > 0 && (
          <ToolButton title="Reset path" onClick={() => editBoard((b) => resetPath(b, [edge.id]))}>
            <RouteOff size={14} />
          </ToolButton>
        )}
        <ToolButton title="Delete arrow (Del)" onClick={() => editBoard((b) => deleteEdges(b, [edge.id]))}>
          <Trash size={14} />
        </ToolButton>
      </div>
      {colorOpen && <ColorRow value={edge.color} line onPick={(color) => editBoard((b) => updateEdge(b, edge.id, { color }))} />}
      {edge.flags.length > 0 && <FlagList flags={edge.flags} />}
    </>
  );
}
