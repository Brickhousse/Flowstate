import { z } from 'zod';
import { ACTORS, EDGE_TYPES, FLAG_KINDS, SCHEMA_VERSION, SHAPES, SIDES, STATUSES, type Project } from './types';

export class ProjectFormatError extends Error {}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Record<number, Migration> = {};

const Flag = z.object({ id: z.string(), kind: z.enum(FLAG_KINDS), text: z.string(), resolved: z.boolean() });

const Node = z.object({
  id: z.string(),
  kind: z.enum(['step', 'text', 'group']),
  shape: z.enum(SHAPES),
  actor: z.enum(ACTORS).nullable(),
  title: z.string(),
  note: z.string(),
  owner: z.string(),
  durationMin: z.number().nullable(),
  status: z.enum(STATUSES).nullable(),
  replaces: z.string(),
  laneId: z.string().nullable(),
  groupId: z.string().nullable(),
  flags: z.array(Flag),
  color: z.string().nullable(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const Edge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceSide: z.enum(SIDES).nullable(),
  targetSide: z.enum(SIDES).nullable(),
  type: z.enum(EDGE_TYPES),
  label: z.string(),
  flags: z.array(Flag),
});

const Lane = z.object({ id: z.string(), name: z.string(), order: z.number(), height: z.number() });

const Board = z.object({
  id: z.string(),
  name: z.string(),
  direction: z.enum(['LR', 'TB']),
  nodes: z.array(Node),
  edges: z.array(Edge),
  lanes: z.array(Lane),
  nextId: z.int().nonnegative(),
});

const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  boards: z.array(Board).min(1),
});

function formatIssues(error: z.ZodError): string {
  const [first, ...rest] = error.issues;
  const path = first.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('').replace(/^\./, '');
  const more = rest.length ? ` (and ${rest.length} more)` : '';
  return path ? `Project file is invalid at ${path}: ${first.message}${more}` : `Project file is invalid: ${first.message}${more}`;
}

export function migrateProject(raw: unknown): Project {
  if (!raw || typeof raw !== 'object') throw new ProjectFormatError('Not a Flowstate project file.');
  let data = raw as Record<string, unknown>;
  if (typeof data.schemaVersion !== 'number') throw new ProjectFormatError('Not a Flowstate project file.');
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new ProjectFormatError(`This project was saved by a newer Flowstate (schema ${data.schemaVersion}).`);
  }
  while ((data.schemaVersion as number) < SCHEMA_VERSION) {
    const version = data.schemaVersion as number;
    const step = MIGRATIONS[version];
    if (!step) throw new ProjectFormatError(`No migration from schema ${version}.`);
    data = { ...step(data), schemaVersion: version + 1 };
  }
  const parsed = ProjectSchema.safeParse(data);
  if (!parsed.success) throw new ProjectFormatError(formatIssues(parsed.error));
  return parsed.data;
}
