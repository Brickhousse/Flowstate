import { useReactFlow } from '@xyflow/react';
import { Rows3, SquareDashed, Type } from 'lucide-react';
import { editBoard } from '../canvas/boardChange';
import { SHAPE_MIME } from '../canvas/Canvas';
import { SHAPE_LABEL } from '../canvas/labels';
import { reveal } from '../canvas/reveal';
import { ShapeIcon } from '../canvas/ShapeSvg';
import { viewCenter } from '../canvas/viewport';
import { SHAPE_SIZE } from '../model/factory';
import { SHAPES, type Shape } from '../model/types';
import { groupSteps } from '../ops/groups';
import { setLanes } from '../ops/lanes';
import { addStep } from '../ops/steps';
import { addText } from '../ops/text';
import { flowStore } from '../store/store';

export function Palette() {
  const rf = useReactFlow();
  const edit = (id: string | undefined) => {
    if (!id) return;
    const st = flowStore.getState();
    st.select([id]);
    st.setEditing(id);
    reveal([id]);
  };

  const place = (shape: Shape) => {
    const st = flowStore.getState();
    const one = st.selection.length === 1 ? st.selection[0] : null;
    edit(
      editBoard((b) => {
        const anchor = b.nodes.find((n) => n.id === one && n.kind === 'step');
        if (anchor) return addStep(b, { shape, after: anchor.id, actor: anchor.actor });
        const c = viewCenter(rf);
        const size = SHAPE_SIZE[shape];
        return addStep(b, { shape, x: c.x - size.w / 2, y: c.y - size.h / 2 });
      }),
    );
  };

  const addNote = () => {
    const c = viewCenter(rf);
    edit(editBoard((b) => addText(b, { text: '', x: c.x - 110, y: c.y - 22 })));
  };

  const groupSelection = () => {
    const ids = flowStore.getState().selection;
    edit(editBoard((b) => groupSteps(b, ids.filter((id) => b.nodes.find((n) => n.id === id)?.kind !== 'group'), 'Group')));
  };

  const toggleLanes = () => editBoard((b) => setLanes(b, b.lanes.length ? [] : ['Lane 1', 'Lane 2']));

  return (
    <aside className="palette" aria-label="Shapes">
      {SHAPES.map((shape, i) => (
        <button
          key={shape}
          type="button"
          className="palette-btn"
          aria-label={SHAPE_LABEL[shape]}
          title={`${SHAPE_LABEL[shape]} (${i + 1}). Click to add after the selection, or drag onto the board.`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(SHAPE_MIME, shape);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={() => place(shape)}
        >
          <ShapeIcon shape={shape} />
        </button>
      ))}
      <div className="palette-sep" />
      <button type="button" className="palette-btn" aria-label="Free text" title="Free text (T)" onClick={addNote}>
        <Type size={16} />
      </button>
      <button type="button" className="palette-btn" aria-label="Group selection" title="Group the selected steps" onClick={groupSelection}>
        <SquareDashed size={16} />
      </button>
      <button type="button" className="palette-btn" aria-label="Toggle swimlanes" title="Toggle swimlanes" onClick={toggleLanes}>
        <Rows3 size={16} />
      </button>
    </aside>
  );
}
