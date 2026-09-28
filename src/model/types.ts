export const SCHEMA_VERSION = 2;

export const SHAPES = ['process', 'decision', 'terminal', 'data', 'document', 'database', 'preparation', 'connector', 'sticky'] as const;
export const ACTORS = ['person', 'system', 'agent'] as const;
export const STATUSES = ['idea', 'planned', 'active', 'done'] as const;
export const EDGE_TYPES = ['flow', 'dependency', 'handoff'] as const;
export const FLAG_KINDS = ['blocker', 'warning', 'question'] as const;
export const SIDES = ['top', 'right', 'bottom', 'left'] as const;

export type Shape = (typeof SHAPES)[number];
export type Actor = (typeof ACTORS)[number];
export type Status = (typeof STATUSES)[number];
export type EdgeType = (typeof EDGE_TYPES)[number];
export type FlagKind = (typeof FLAG_KINDS)[number];
export type Side = (typeof SIDES)[number];
export type NodeKind = 'step' | 'text' | 'group';
export type Direction = 'LR' | 'TB';

export interface XY {
  x: number;
  y: number;
}

export interface Flag {
  id: string;
  kind: FlagKind;
  text: string;
  resolved: boolean;
}

export interface BoardNode {
  id: string;
  kind: NodeKind;
  shape: Shape;
  actor: Actor | null;
  title: string;
  note: string;
  owner: string;
  durationMin: number | null;
  status: Status | null;
  replaces: string;
  laneId: string | null;
  groupId: string | null;
  flags: Flag[];
  color: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardEdge {
  id: string;
  source: string;
  target: string;
  sourceSide: Side | null;
  targetSide: Side | null;
  type: EdgeType;
  label: string;
  flags: Flag[];
  separate: boolean;
  bends: XY[];
}

export interface Lane {
  id: string;
  name: string;
  order: number;
  height: number;
}

export interface Board {
  id: string;
  name: string;
  direction: Direction;
  nodes: BoardNode[];
  edges: BoardEdge[];
  lanes: Lane[];
  nextId: number;
}

export interface Project {
  id: string;
  name: string;
  schemaVersion: number;
  boards: Board[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}
