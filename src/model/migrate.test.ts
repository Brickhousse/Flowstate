import { describe, expect, it } from 'vitest';
import { connect } from '../ops/edges';
import { addFlag } from '../ops/flags';
import { setLanes } from '../ops/lanes';
import { addStep } from '../ops/steps';
import { addText } from '../ops/text';
import { groupSteps } from '../ops/groups';
import { createProject } from './factory';
import { migrateProject, ProjectFormatError } from './migrate';
import type { Project } from './types';

function fullProject(): Project {
  const p = createProject('Claims');
  const b = p.boards[0];
  setLanes(b, ['Ops', 'Finance']);
  const a = addStep(b, { title: 'Intake', actor: 'person', durationMin: 30, status: 'active', laneId: b.lanes[0].id });
  const c = addStep(b, { title: 'Review', after: a, shape: 'decision' });
  connect(b, { source: a, target: c, type: 'dependency', label: 'when ready' });
  addFlag(b, a, 'blocker', 'Needs data');
  addFlag(b, b.edges[0].id, 'question', 'Really?');
  addText(b, { text: 'Note', near: a });
  groupSteps(b, [a, c], 'Triage');
  return p;
}

const invalid = (mutate: (p: Project) => void): unknown => {
  const raw = structuredClone(fullProject());
  mutate(raw);
  return raw;
};

describe('migrateProject', () => {
  it('accepts a current project unchanged', () => {
    const p = createProject();
    expect(migrateProject(structuredClone(p))).toEqual(p);
  });

  it('accepts a project with lanes, groups, text, arrows and flags unchanged', () => {
    const p = fullProject();
    expect(migrateProject(structuredClone(p))).toEqual(p);
  });

  it.each([null, 42, 'x', {}, { schemaVersion: 1 }, { schemaVersion: 1, id: 'a', boards: 'no' }])('rejects %j', (raw) => {
    expect(() => migrateProject(raw)).toThrow(ProjectFormatError);
  });

  it('rejects projects from a newer schema', () => {
    const p = { ...createProject(), schemaVersion: 99 };
    expect(() => migrateProject(p)).toThrow(/newer Flowstate/);
  });

  it('rejects a board missing nodes, naming the path', () => {
    const raw = invalid((p) => {
      delete (p.boards[0] as Partial<Project['boards'][0]>).nodes;
    });
    expect(() => migrateProject(raw)).toThrow(ProjectFormatError);
    expect(() => migrateProject(raw)).toThrow(/boards\[0\]\.nodes/);
  });

  it('rejects a node missing flags', () => {
    const raw = invalid((p) => {
      delete (p.boards[0].nodes[0] as Partial<Project['boards'][0]['nodes'][0]>).flags;
    });
    expect(() => migrateProject(raw)).toThrow(/boards\[0\]\.nodes\[0\]\.flags/);
  });

  it.each<[string, (p: Project) => void]>([
    ['node shape', (p) => ((p.boards[0].nodes[0] as { shape: string }).shape = 'blob')],
    ['node actor', (p) => ((p.boards[0].nodes[0] as { actor: string }).actor = 'robot')],
    ['node status', (p) => ((p.boards[0].nodes[0] as { status: string }).status = 'later')],
    ['node kind', (p) => ((p.boards[0].nodes[0] as { kind: string }).kind = 'blob')],
    ['edge type', (p) => ((p.boards[0].edges[0] as { type: string }).type = 'wire')],
    ['edge side', (p) => ((p.boards[0].edges[0] as { sourceSide: string }).sourceSide = 'middle')],
    ['edge colour', (p) => ((p.boards[0].edges[0] as { color: string }).color = 'red')],
    ['edge hex colour', (p) => ((p.boards[0].edges[0] as { color: string }).color = '#12ab3')],
    ['missing edge colour', (p) => delete (p.boards[0].edges[0] as { color?: unknown }).color],
    ['flag kind', (p) => ((p.boards[0].nodes[0].flags[0] as { kind: string }).kind = 'note')],
    ['board direction', (p) => ((p.boards[0] as { direction: string }).direction = 'RL')],
    ['node position', (p) => ((p.boards[0].nodes[0] as { x: unknown }).x = '12')],
    ['nextId', (p) => ((p.boards[0] as { nextId: unknown }).nextId = 'many')],
    ['lane height', (p) => ((p.boards[0].lanes[0] as { height: unknown }).height = null)],
    ['edges', (p) => ((p.boards[0] as { edges: unknown }).edges = {})],
    ['lanes', (p) => ((p.boards[0] as { lanes: unknown }).lanes = undefined)],
    ['node', (p) => ((p.boards[0].nodes as unknown[])[1] = null)],
    ['board', (p) => ((p.boards as unknown[])[0] = 'b1')],
    ['empty boards', (p) => ((p as { boards: unknown }).boards = [])],
  ])('rejects a bad %s', (_label, mutate) => {
    expect(() => migrateProject(invalid(mutate))).toThrow(ProjectFormatError);
  });

  it('upgrades a version 1 file so every arrow shares lines and has no bends', () => {
    const raw = JSON.parse(JSON.stringify(fullProject()));
    raw.schemaVersion = 1;
    for (const e of raw.boards[0].edges) {
      delete e.separate;
      delete e.bends;
    }
    const out = migrateProject(raw);
    expect(out.schemaVersion).toBe(2);
    expect(out.boards[0].edges.map((e) => [e.separate, e.bends])).toEqual([
      [false, []],
      [false, []],
    ]);
  });

  it('upgrades a version 1 file so every arrow has the default colour', () => {
    const raw = JSON.parse(JSON.stringify(fullProject()));
    raw.schemaVersion = 1;
    for (const e of raw.boards[0].edges) {
      delete e.separate;
      delete e.bends;
      delete e.color;
    }
    expect(migrateProject(raw).boards[0].edges.map((e) => e.color)).toEqual([null, null]);
  });

  it('keeps tint and hex arrow colours', () => {
    const raw = JSON.parse(JSON.stringify(fullProject()));
    raw.boards[0].edges[0].color = 'violet';
    raw.boards[0].edges[1].color = '#12AB34';
    expect(migrateProject(raw).boards[0].edges.map((e) => e.color)).toEqual(['violet', '#12AB34']);
  });

  it('refuses a version 1 file with a malformed arrow instead of crashing', () => {
    const raw = JSON.parse(JSON.stringify(fullProject()));
    raw.schemaVersion = 1;
    raw.boards[0].edges[0] = 'e1';
    expect(() => migrateProject(raw)).toThrow(/boards\[0\]\.edges\[0\]/);
  });

  it('rejects a bend that is not a point', () => {
    const raw = JSON.parse(JSON.stringify(fullProject()));
    raw.boards[0].edges[0].bends = [{ x: '1', y: 2 }];
    expect(() => migrateProject(raw)).toThrow(/boards\[0\]\.edges\[0\]\.bends\[0\]\.x/);
  });

  it('describes the first problem readably', () => {
    const raw = invalid((p) => ((p.boards[0].nodes[0] as { shape: string }).shape = 'blob'));
    expect(() => migrateProject(raw)).toThrow(/^Project file is invalid at boards\[0\]\.nodes\[0\]\.shape: /);
  });
});
