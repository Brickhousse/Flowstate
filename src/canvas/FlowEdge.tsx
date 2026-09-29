import type { EdgeProps } from '@xyflow/react';
import { Arrow } from './Arrow';
import type { FlowEdgeType } from './toFlow';

export function FlowEdge({ id, data, selected, markerEnd }: EdgeProps<FlowEdgeType>) {
  if (!data?.route) return null;
  return <Arrow id={id} data={data} route={data.route} selected={!!selected} markerEnd={markerEnd} />;
}
