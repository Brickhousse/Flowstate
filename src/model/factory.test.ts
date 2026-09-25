import { describe, expect, it } from 'vitest';
import { allocId, createBoard, createProject, makeFlag, makeNode, SHAPE_SIZE } from './factory';

describe('factory', () => {
  it('creates a project with one empty board', () => {
    const p = createProject('Claims');
    expect(p.name).toBe('Claims');
    expect(p.schemaVersion).toBe(1);
    expect(p.boards).toHaveLength(1);
    expect(p.boards[0].nodes).toEqual([]);
    expect(p.id).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(p.boards[0].id).toMatch(/^b[A-Za-z0-9_-]{10}$/);
  });

  it('allocates sequential ids with prefixes from one counter', () => {
    const b = createBoard('B');
    expect(allocId(b, 's')).toBe('s1');
    expect(allocId(b, 'e')).toBe('e2');
    expect(b.nextId).toBe(3);
  });

  it('makes steps sized by shape with defaults', () => {
    const b = createBoard('B');
    const n = makeNode(b, 'step', { shape: 'decision', title: 'Approve?' });
    expect(n).toMatchObject({ id: 's1', kind: 'step', shape: 'decision', title: 'Approve?', actor: null, flags: [] });
    expect({ w: n.w, h: n.h }).toEqual(SHAPE_SIZE.decision);
  });

  it('prefixes text and group ids', () => {
    const b = createBoard('B');
    expect(makeNode(b, 'text').id).toBe('t1');
    expect(makeNode(b, 'group').id).toBe('g2');
  });

  it('makes flags', () => {
    const b = createBoard('B');
    expect(makeFlag(b, 'blocker', 'No API')).toEqual({ id: 'f1', kind: 'blocker', text: 'No API', resolved: false });
  });
});
