import { Plus } from 'lucide-react';
import { SIDES, type Side } from '../model/types';
import { addStepOnSide } from '../ops/structure';
import { flowStore } from '../store/store';
import { runSafely } from './safe';

export function AddHandles({ nodeId }: { nodeId: string }) {
  const add = (side: Side) => {
    const st = flowStore.getState();
    const id = runSafely(() => st.changeBoard((b) => addStepOnSide(b, nodeId, side)));
    if (id) {
      st.select([id]);
      st.setEditing(id);
    }
  };
  return (
    <>
      {SIDES.map((side) => (
        <button
          key={side}
          type="button"
          className={`fs-add fs-add-${side} nodrag nopan`}
          title="Add a connected step"
          aria-label={`Add step ${side}`}
          onClick={(e) => {
            e.stopPropagation();
            add(side);
          }}
        >
          <Plus size={12} strokeWidth={2.5} />
        </button>
      ))}
    </>
  );
}
