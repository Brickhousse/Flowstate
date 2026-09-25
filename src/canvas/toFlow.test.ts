import { describe, expect, it } from 'vitest';
import { setLanes } from '../ops/lanes';
import { chain } from '../ops/testkit';
import { updateSteps } from '../ops/steps';
import { runOp } from '../ops/run';
import { toFlowEdges, toFlowNodes, type FlowEdgeType, type FlowNode, type FlowView, type RenderCache } from './toFlow';

const view = (over: Partial<FlowView> = {}): FlowView => ({
  selection: new Set(),
  edgeSelection: new Set(),
  criticalNodes: null,
  criticalEdges: null,
  glow: {},
  editable: true,
  edgeColor: '#888',
  criticalColor: '#f60',
  accentColor: '#46f',
  ...over,
});

describe('toFlowNodes', () => {
  it('maps nodes with size, type and selection', () => {
    const { b, ids } = chain(['A', 'B']);
    const nodes = toFlowNodes(b, view({ selection: new Set([ids[1]]) }), new Map());
    expect(nodes.map((n) => [n.id, n.type, n.selected, n.width, n.height])).toEqual([
      [ids[0], 'step', false, 180, 72],
      [ids[1], 'step', true, 180, 72],
    ]);
  });

  it('reuses unchanged node objects between renders', () => {
    const { b, ids } = chain(['A', 'B']);
    const cache: RenderCache<FlowNode> = new Map();
    const first = toFlowNodes(b, view(), cache);
    const next = runOp(b, (d) => updateSteps(d, [{ id: ids[1], title: 'B2' }])).board;
    const second = toFlowNodes(next, view(), cache);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
  });

  it('adds lane bands behind everything and dims off-path steps', () => {
    const { b, ids } = chain(['A', 'B']);
    setLanes(b, ['Ops', 'Legal']);
    const nodes = toFlowNodes(b, view({ criticalNodes: new Set([ids[0]]) }), new Map());
    const lanes = nodes.filter((n) => n.type === 'lane');
    expect(lanes).toHaveLength(2);
    expect(lanes.every((n) => n.zIndex === -2 && n.selectable === false)).toBe(true);
    const steps = nodes.filter((n) => n.type === 'step');
    expect(steps.map((n) => [n.data.critical, n.data.dimmed])).toEqual([
      [true, false],
      [false, true],
    ]);
  });
});

describe('toFlowEdges', () => {
  it('uses automatic sides by direction and explicit sides when set', () => {
    const { b } = chain(['A', 'B']);
    const cache: RenderCache<FlowEdgeType> = new Map();
    expect(toFlowEdges(b, view(), cache)[0]).toMatchObject({ sourceHandle: 'right', targetHandle: 'left', type: 'flow' });
    b.direction = 'TB';
    b.edges[0] = { ...b.edges[0] };
    expect(toFlowEdges(b, view(), cache)[0]).toMatchObject({ sourceHandle: 'bottom', targetHandle: 'top' });
    b.edges[0] = { ...b.edges[0], sourceSide: 'left' };
    expect(toFlowEdges(b, view(), cache)[0].sourceHandle).toBe('left');
  });
});
