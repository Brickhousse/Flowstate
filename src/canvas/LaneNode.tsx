import type { NodeProps } from '@xyflow/react';
import { memo, useState } from 'react';
import { renameLane } from '../ops/lanes';
import { InlineRename } from '../ui/controls';
import { editBoard } from './boardChange';
import type { LaneFlowNode } from './toFlow';

export const LaneNode = memo(function LaneNode({ data }: NodeProps<LaneFlowNode>) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div className={`fs-lane ${data.alt ? 'alt' : ''} dir-${data.direction}`}>
      {renaming ? (
        <span className="fs-lane-label">
          <InlineRename
            label="Lane name"
            value={data.lane.name}
            onDone={(name) => {
              setRenaming(false);
              if (name) editBoard((b) => renameLane(b, data.lane.id, name));
            }}
          />
        </span>
      ) : (
        <span className="fs-lane-label" title={data.editable ? 'Double-click to rename' : undefined} onDoubleClick={() => data.editable && setRenaming(true)}>
          {data.lane.name}
        </span>
      )}
    </div>
  );
});
