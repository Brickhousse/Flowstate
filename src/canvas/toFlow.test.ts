import { describe, expect, it } from 'vitest';
import { setLanes } from '../ops/lanes';
import { chain } from '../ops/testkit';
import { updateSteps } from '../ops/steps';
import { updateEdge } from '../ops/edges';
import { runOp } from '../ops/run';
import { arrowRoutes } from './arrowRoutes';
import type { RenderCache } from './renderCache';
import { toFlowEdges, toFlowNodes, type FlowEdgeType, type FlowNode, type FlowView } from './toFlow';

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
  tintLines: { blue: '#00b', green: '#0b0', amber: '#b80', rose: '#b04', violet: '#80b', slate: '#555' },
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
    expect(toFlowEdges(b, view(), cache, arrowRoutes(b, new Map()))[0]).toMatchObject({ sourceHandle: 'right', targetHandle: 'left', type: 'flow' });
    b.direction = 'TB';
    b.edges[0] = { ...b.edges[0] };
    expect(toFlowEdges(b, view(), cache, arrowRoutes(b, new Map()))[0]).toMatchObject({ sourceHandle: 'bottom', targetHandle: 'top' });
    b.edges[0] = { ...b.edges[0], sourceSide: 'left' };
    expect(toFlowEdges(b, view(), cache, arrowRoutes(b, new Map()))[0].sourceHandle).toBe('left');
  });

  it('carries each route and rebuilds the edge when its route changes', () => {
    const { b } = chain(['A', 'B']);
    const cache: RenderCache<FlowEdgeType> = new Map();
    const routes = arrowRoutes(b, new Map());
    const first = toFlowEdges(b, view(), cache, routes)[0];
    expect(first.data!.route).toBe(routes.get(b.edges[0].id));
    expect(toFlowEdges(b, view(), cache, routes)[0]).toBe(first);
    expect(toFlowEdges(b, view(), cache, arrowRoutes(b, new Map()))[0]).not.toBe(first);
  });
});

describe('arrow colour', () => {
  const colors = (edges: FlowEdgeType[]) => edges.map((e) => [e.data!.color, e.markerEnd, e.data!.labelColor]);
  const head = (color: string) => expect.objectContaining({ color });

  it('draws a tinted arrow in its line shade and a hex arrow as picked, head and label too', () => {
    const { b } = chain(['A', 'B', 'C', 'D']);
    b.edges[0].color = 'violet';
    b.edges[1].color = '#12ab34';
    expect(colors(toFlowEdges(b, view(), new Map(), arrowRoutes(b, new Map())))).toEqual([
      ['#80b', head('#80b'), '#80b'],
      ['#12ab34', head('#12ab34'), '#12ab34'],
      ['#888', head('#888'), null],
    ]);
  });

  it('gives the line and head to the critical and selected colours while they apply, keeping the label', () => {
    const { b } = chain(['A', 'B', 'C']);
    b.edges[0].color = 'green';
    b.edges[1].color = 'green';
    const [e1, e2] = b.edges.map((e) => e.id);
    const edges = toFlowEdges(b, view({ edgeSelection: new Set([e1, e2]), criticalEdges: new Set([e2]) }), new Map(), arrowRoutes(b, new Map()));
    expect(colors(edges)).toEqual([
      ['#46f', head('#46f'), '#0b0'],
      ['#f60', head('#f60'), '#0b0'],
    ]);
  });

  it('rebuilds only the recoloured arrow, and every tinted arrow when the theme changes', () => {
    const { b } = chain(['A', 'B', 'C']);
    b.edges[1].color = 'blue';
    const cache: RenderCache<FlowEdgeType> = new Map();
    const routeCache = new Map();
    const first = toFlowEdges(b, view(), cache, arrowRoutes(b, routeCache));
    const next = runOp(b, (d) => updateEdge(d, d.edges[0].id, { color: 'amber' })).board;
    const second = toFlowEdges(next, view(), cache, arrowRoutes(next, routeCache));
    expect(second[0]).not.toBe(first[0]);
    expect(second[0].data!.color).toBe('#b80');
    expect(second[1]).toBe(first[1]);
    const dark = view({ tintLines: { ...view().tintLines, blue: '#99f' } });
    const third = toFlowEdges(next, dark, cache, arrowRoutes(next, routeCache));
    expect(third[1].data!.color).toBe('#99f');
  });
});
