import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
  type OnConnectEnd,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { criticalPath } from '../analysis/criticalPath';
import { SHAPE_SIZE } from '../model/factory';
import { SHAPES, SIDES, type Shape, type Side } from '../model/types';
import { copySubgraph, pasteSubgraph } from '../ops/clipboard';
import { connect } from '../ops/edges';
import { addStep, resizeNode, setPositions, withGroupMembers } from '../ops/steps';
import { flowStore, useFlow } from '../store/store';
import { GuidesOverlay } from './assist/GuidesOverlay';
import { useDragAssist } from './assist/useDragAssist';
import { cursor } from './cursor';
import { FlowEdge } from './FlowEdge';
import { requestFocus } from './focusKey';
import { GroupNode } from './GroupNode';
import { LaneNode } from './LaneNode';
import { setRevealer } from './reveal';
import { runSafely } from './safe';
import { StepNode } from './StepNode';
import { TextNode } from './TextNode';
import { toFlowEdges, toFlowNodes, type FlowEdgeType, type FlowNode, type FlowView, type RenderCache } from './toFlow';
import { useKeyboard } from './useKeyboard';
import { useThemeColors, type ThemeColors } from './useThemeColors';
import { FIT_VIEW } from './viewport';
import './canvas.css';

export const SHAPE_MIME = 'application/x-flowstate-shape';

const nodeTypes = { step: StepNode, text: TextNode, group: GroupNode, lane: LaneNode };
const edgeTypes = { flow: FlowEdge };
const EMPTY: string[] = [];
const viewports = new Map<string, Viewport>();

function asSide(value: string | null | undefined): Side | null {
  return SIDES.find((s) => s === value) ?? null;
}

function minimapColor(type: string | undefined, actor: string | null | undefined, colors: ThemeColors): string {
  if (type === 'lane' || type === 'group' || type === 'text') return 'transparent';
  if (actor === 'person') return colors.person;
  if (actor === 'system') return colors.system;
  if (actor === 'agent') return colors.agent;
  return colors.stepStroke;
}

function revealIds(rf: ReactFlowInstance<FlowNode, FlowEdgeType>, ids: string[]): void {
  const nodes = ids.map((id) => rf.getNode(id)).filter((n): n is FlowNode => !!n);
  const pane = document.querySelector('.fs-canvas-main')?.getBoundingClientRect();
  if (nodes.length === 0 || !pane) return;
  const { x, y, zoom } = rf.getViewport();
  const visible = nodes.some((n) => {
    const sx = n.position.x * zoom + x;
    const sy = n.position.y * zoom + y;
    return sx > 0 && sy > 0 && sx < pane.width && sy < pane.height;
  });
  if (visible) return;
  const first = nodes[0];
  rf.setCenter(first.position.x + (first.width ?? 0) / 2, first.position.y + (first.height ?? 0) / 2, { zoom, duration: 400 });
}

// Undo React Flow's drag-start multi-select toggle in its own lookup as well as our store; see ADR 0008.
function keepSelected(rf: ReactFlowInstance<FlowNode, FlowEdgeType>, ids: string[]): void {
  for (const id of ids) {
    const n = rf.getInternalNode(id);
    if (n) n.selected = true;
  }
  const st = flowStore.getState();
  st.select(ids, st.edgeSelection);
}

function endDrag(dragging: { current: string[] | null }): void {
  if (!dragging.current) return;
  dragging.current = null;
  flowStore.getState().commit();
}

export function Canvas({ boardId, editable }: { boardId: string; editable: boolean }) {
  const board = useFlow((s) => s.project.boards.find((b) => b.id === boardId));
  const selection = useFlow((s) => (editable ? s.selection : EMPTY));
  const edgeSelection = useFlow((s) => (editable ? s.edgeSelection : EMPTY));
  const glow = useFlow((s) => s.glow);
  const showCritical = useFlow((s) => s.criticalPath);
  const exporting = useFlow((s) => s.exporting);
  const colors = useThemeColors();
  const rf = useReactFlow<FlowNode, FlowEdgeType>();
  useKeyboard(boardId, editable);
  const nodeCache = useRef<RenderCache<FlowNode>>(new Map());
  const edgeCache = useRef<RenderCache<FlowEdgeType>>(new Map());
  const measured = useRef(new Map<string, { width: number; height: number }>());
  const assist = useDragAssist(boardId, editable, measured.current);
  const [measureTick, setMeasureTick] = useState(0);
  const [connecting, setConnecting] = useState(false);
  // Ids whose disappearance ends the drag: React Flow never fires onNodeDragStop once the grabbed node unmounts.
  const dragging = useRef<string[] | null>(null);

  const cp = useMemo(() => (showCritical && board ? criticalPath(board) : null), [showCritical, board]);
  const view = useMemo<FlowView>(
    () => ({
      selection: new Set(selection),
      edgeSelection: new Set(edgeSelection),
      criticalNodes: cp ? new Set(cp.nodeIds) : null,
      criticalEdges: cp ? new Set(cp.edgeIds) : null,
      glow,
      editable,
      edgeColor: colors.edge,
      criticalColor: colors.critical,
      accentColor: colors.accent,
    }),
    [selection, edgeSelection, cp, glow, editable, colors],
  );
  // React Flow drops handle bounds for nodes without `measured`, which hides their edges for a frame on every change.
  const nodes = useMemo(() => (board ? toFlowNodes(board, view, nodeCache.current, measured.current) : []), [board, view, measureTick]);
  const edges = useMemo(() => (board ? toFlowEdges(board, view, edgeCache.current) : []), [board, view]);

  useEffect(() => (editable ? setRevealer((ids) => revealIds(rf, ids)) : undefined), [rf, editable]);
  useEffect(
    () => () => {
      assist.finish();
      endDrag(dragging);
    },
    [assist],
  );
  useEffect(() => {
    const watched = dragging.current;
    if (watched && !watched.some((id) => board?.nodes.some((n) => n.id === id))) {
      assist.finish();
      endDrag(dragging);
    }
  }, [board, assist]);

  const startEditing = useCallback((id: string) => {
    const st = flowStore.getState();
    st.select([id]);
    st.setEditing(id);
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const st = flowStore.getState();
      const positions: Record<string, { x: number; y: number }> = {};
      const sizes: Record<string, { width: number; height: number }> = {};
      let nextSelection: Set<string> | null = null;
      let remeasured = false;
      for (const ch of changes) {
        if (ch.type === 'position' && ch.position && !ch.id.startsWith('lane:')) positions[ch.id] = ch.position;
        else if (ch.type === 'dimensions' && ch.dimensions) {
          if (ch.resizing) sizes[ch.id] = ch.dimensions;
          // The resize-end change repeats the resizer's unsnapped size, so only DOM measurements are taken as is.
          else if (ch.resizing === undefined) {
            measured.current.set(ch.id, { ...ch.dimensions });
            remeasured = true;
          }
        }
        else if (ch.type === 'select' && !ch.id.startsWith('lane:')) {
          nextSelection ??= new Set(st.selection);
          if (ch.selected) nextSelection.add(ch.id);
          else nextSelection.delete(ch.id);
        }
      }
      // React Flow's drag-end change carries its own unsnapped positions, so every change in a drag is snapped.
      if (editable && Object.keys(positions).length && assist.active()) assist.adjustMove(positions);
      if (editable && Object.keys(sizes).length) assist.adjustResize(positions, sizes);
      // The resizer starts its next drag from `measured`, and the DOM never re-measures a snapped size it already renders.
      for (const [id, d] of Object.entries(sizes)) {
        measured.current.set(id, { ...d });
        remeasured = true;
      }
      if (editable && (Object.keys(positions).length || Object.keys(sizes).length)) {
        runSafely(() =>
          st.changeBoard((b) => {
            setPositions(b, withGroupMembers(b, positions));
            for (const [id, d] of Object.entries(sizes)) {
              const n = b.nodes.find((x) => x.id === id);
              if (n) resizeNode(b, id, { x: positions[id]?.x ?? n.x, y: positions[id]?.y ?? n.y, w: d.width, h: d.height });
            }
          }, boardId),
        );
      }
      if (nextSelection && editable) st.select([...nextSelection], st.edgeSelection);
      if (remeasured) setMeasureTick((t) => t + 1);
    },
    [boardId, editable, assist],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdgeType>[]) => {
      if (!editable) return;
      const st = flowStore.getState();
      let next: Set<string> | null = null;
      for (const ch of changes) {
        if (ch.type !== 'select') continue;
        next ??= new Set(st.edgeSelection);
        if (ch.selected) next.add(ch.id);
        else next.delete(ch.id);
      }
      if (next) st.select(st.selection, [...next]);
    },
    [editable],
  );

  const onConnect: OnConnect = useCallback(
    (c) => {
      runSafely(() =>
        flowStore.getState().changeBoard((b) => connect(b, { source: c.source, target: c.target, sourceSide: asSide(c.sourceHandle), targetSide: asSide(c.targetHandle) }), boardId),
      );
    },
    [boardId],
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      setConnecting(false);
      if (state.isValid || !state.fromNode || !editable) return;
      const point = 'changedTouches' in event ? event.changedTouches[0] : event;
      const pos = rf.screenToFlowPosition({ x: point.clientX, y: point.clientY });
      const fromId = state.fromNode.id;
      const fromSide = asSide(state.fromHandle?.id);
      const dropId = document.elementFromPoint(point.clientX, point.clientY)?.closest('.react-flow__node')?.getAttribute('data-id');
      const dropTarget = board?.nodes.find((n) => n.id === dropId && n.kind !== 'group' && n.id !== fromId);
      if (dropTarget) {
        runSafely(() => flowStore.getState().changeBoard((b) => connect(b, { source: fromId, target: dropTarget.id, sourceSide: fromSide }), boardId));
        return;
      }
      const id = runSafely(() =>
        flowStore.getState().changeBoard((b) => {
          const from = b.nodes.find((n) => n.id === fromId);
          const created = addStep(b, { x: pos.x - 90, y: pos.y - 36, actor: from?.actor ?? null });
          connect(b, { source: fromId, target: created, sourceSide: fromSide });
          return created;
        }, boardId),
      );
      if (id) startEditing(id);
    },
    [rf, board, boardId, editable, startEditing],
  );

  const onPaneClick = useCallback(
    (event: ReactMouseEvent) => {
      const st = flowStore.getState();
      if (event.detail === 2 && editable) {
        const pos = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const id = runSafely(() => st.changeBoard((b) => addStep(b, { x: pos.x - 90, y: pos.y - 36 }), boardId));
        if (id) startEditing(id);
        return;
      }
      st.setEditing(null);
    },
    [rf, boardId, editable, startEditing],
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      const raw = event.dataTransfer.getData(SHAPE_MIME);
      const shape = SHAPES.find((s): s is Shape => s === raw);
      if (!shape || !editable) return;
      event.preventDefault();
      const pos = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const size = SHAPE_SIZE[shape];
      const id = runSafely(() => flowStore.getState().changeBoard((b) => addStep(b, { shape, x: pos.x - size.w / 2, y: pos.y - size.h / 2 }), boardId));
      if (id) startEditing(id);
    },
    [rf, boardId, editable, startEditing],
  );

  if (!board) return null;
  const saved = viewports.get(boardId);
  return (
    <ReactFlow<FlowNode, FlowEdgeType>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onConnectStart={() => setConnecting(true)}
      onConnectEnd={onConnectEnd}
      connectionRadius={20}
      elevateNodesOnSelect={false}
      onNodeDragStart={(event, node, dragged) => {
        dragging.current = [node.id];
        flowStore.getState().begin();
        const ids = dragged.map((n) => n.id);
        if (event.shiftKey) keepSelected(rf, ids);
        assist.start(ids);
      }}
      onSelectionDragStart={(_, dragged) => {
        dragging.current = dragged.map((n) => n.id);
      }}
      onNodeDragStop={(event) => {
        // The copy lands before endDrag commits so it shares the drag's undo entry; see ADR 0011.
        const copy = assist.finish(event);
        if (copy) {
          const ids = runSafely(() =>
            flowStore.getState().changeBoard((b) => {
              setPositions(b, copy.start);
              return pasteSubgraph(b, copySubgraph(b, copy.ids), copy.delta.x, copy.delta.y);
            }, boardId),
          );
          if (ids) flowStore.getState().select(ids);
        }
        endDrag(dragging);
      }}
      onNodeDoubleClick={(_, node) => editable && node.type !== 'lane' && startEditing(node.id)}
      onEdgeDoubleClick={(_, edge) => {
        if (!editable) return;
        requestFocus(`label:${edge.id}`);
        flowStore.getState().select([], [edge.id]);
      }}
      onPaneClick={onPaneClick}
      onPaneContextMenu={(e) => e.preventDefault()}
      onPaneMouseMove={(e) => {
        cursor.flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      }}
      onMoveEnd={(_, vp) => viewports.set(boardId, vp)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(SHAPE_MIME)) e.preventDefault();
      }}
      onDrop={onDrop}
      defaultViewport={saved}
      fitView={!saved}
      fitViewOptions={FIT_VIEW}
      connectionMode={ConnectionMode.Loose}
      minZoom={0.05}
      maxZoom={4}
      panOnDrag={[1, 2]}
      selectionOnDrag={editable}
      selectionKeyCode={null}
      selectionMode={SelectionMode.Partial}
      panActivationKeyCode="Space"
      zoomOnDoubleClick={false}
      deleteKeyCode={null}
      multiSelectionKeyCode="Shift"
      nodesDraggable={editable}
      nodesConnectable={editable}
      elementsSelectable={editable}
      onlyRenderVisibleElements={!exporting}
      disableKeyboardA11y
      className={['fs-flow', !editable && 'is-reference', connecting && 'is-connecting'].filter(Boolean).join(' ')}
    >
      {editable && <GuidesOverlay />}
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.3} color={colors.dot} />
      {editable && (
        <MiniMap
          pannable
          zoomable
          nodeStrokeWidth={0}
          maskColor={colors.mask}
          nodeColor={(n) => minimapColor(n.type, n.type === 'lane' ? null : (n.data as { node?: { actor: string | null } }).node?.actor, colors)}
        />
      )}
    </ReactFlow>
  );
}
