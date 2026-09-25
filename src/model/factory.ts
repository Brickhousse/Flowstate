import { nanoid } from 'nanoid';
import { SCHEMA_VERSION, type Board, type BoardNode, type Flag, type FlagKind, type NodeKind, type Project, type Shape } from './types';

export type IdPrefix = 's' | 't' | 'g' | 'e' | 'l' | 'f';

export const SHAPE_SIZE: Record<Shape, { w: number; h: number }> = {
  process: { w: 180, h: 72 },
  decision: { w: 150, h: 110 },
  terminal: { w: 160, h: 56 },
  data: { w: 180, h: 72 },
  document: { w: 180, h: 80 },
  database: { w: 140, h: 90 },
  preparation: { w: 180, h: 72 },
  connector: { w: 48, h: 48 },
  sticky: { w: 180, h: 140 },
};
export const TEXT_SIZE = { w: 220, h: 44 };
export const GROUP_MIN = { w: 240, h: 160 };
export const LANE_SIZE = 240;

const KIND_PREFIX: Record<NodeKind, IdPrefix> = { step: 's', text: 't', group: 'g' };

export function newId(): string {
  return nanoid(10);
}

export function createBoard(name: string): Board {
  return { id: `b${newId()}`, name, direction: 'LR', nodes: [], edges: [], lanes: [], nextId: 1 };
}

export function createProject(name = 'Untitled project'): Project {
  return { id: newId(), name, schemaVersion: SCHEMA_VERSION, boards: [createBoard('Board 1')] };
}

export function allocId(board: Board, prefix: IdPrefix): string {
  return `${prefix}${board.nextId++}`;
}

export function makeNode(board: Board, kind: NodeKind, init: Partial<BoardNode> = {}): BoardNode {
  const shape = init.shape ?? 'process';
  const size = kind === 'text' ? TEXT_SIZE : kind === 'group' ? GROUP_MIN : SHAPE_SIZE[shape];
  return {
    kind,
    shape,
    actor: null,
    title: '',
    note: '',
    owner: '',
    durationMin: null,
    status: null,
    replaces: '',
    laneId: null,
    groupId: null,
    flags: [],
    color: null,
    x: 0,
    y: 0,
    w: size.w,
    h: size.h,
    ...init,
    id: allocId(board, KIND_PREFIX[kind]),
  };
}

export function makeFlag(board: Board, kind: FlagKind, text: string): Flag {
  return { id: allocId(board, 'f'), kind, text, resolved: false };
}
