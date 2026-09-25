import { describe, expect, it } from 'vitest';
import { addStep, deleteSteps } from '../ops/steps';
import { createFlowStore } from './store';

function setup() {
  const store = createFlowStore();
  const s = () => store.getState();
  return { store, s };
}

describe('flow store history', () => {
  it('records each change and undoes and redoes it', () => {
    const { s } = setup();
    const id = s().changeBoard((b) => addStep(b, { title: 'A' }));
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(s().project.boards[0].nodes).toHaveLength(0);
    s().redo();
    expect(s().project.boards[0].nodes[0].id).toBe(id);
  });

  it('groups a transaction into one entry, including nested ones', () => {
    const { s } = setup();
    s().begin();
    s().changeBoard((b) => addStep(b, { title: 'A' }));
    s().begin();
    s().changeBoard((b) => addStep(b, { title: 'B' }));
    expect(s().commit()).toBeNull();
    const entry = s().commit();
    expect(entry).toBeTypeOf('number');
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(s().project.boards[0].nodes).toHaveLength(0);
  });

  it('records nothing for an empty transaction', () => {
    const { s } = setup();
    s().begin();
    expect(s().commit()).toBeNull();
    expect(s().past).toHaveLength(0);
  });

  it('undoes a specific entry only while it is the latest', () => {
    const { s } = setup();
    s().begin();
    s().changeBoard((b) => addStep(b, { title: 'AI' }));
    const entry = s().commit()!;
    s().changeBoard((b) => addStep(b, { title: 'Me' }));
    expect(s().undoEntry(entry)).toBe(false);
    s().undo();
    expect(s().undoEntry(entry)).toBe(true);
    expect(s().project.boards[0].nodes).toHaveLength(0);
  });

  it('caps history at 200 entries', () => {
    const { s } = setup();
    for (let i = 0; i < 205; i++) s().changeBoard((b) => addStep(b, { title: `S${i}` }));
    expect(s().past).toHaveLength(200);
  });

  it('leaves state untouched when an op throws', () => {
    const { s } = setup();
    const before = s().project;
    expect(() => s().changeBoard((b) => addStep(b, { after: 's99' }))).toThrow('Unknown step');
    expect(s().project).toBe(before);
    expect(s().past).toHaveLength(0);
  });

  it('drops selection of nodes that no longer exist', () => {
    const { s } = setup();
    const id = s().changeBoard((b) => addStep(b, { title: 'A' }));
    s().select([id]);
    s().changeBoard((b) => deleteSteps(b, [id]));
    expect(s().selection).toEqual([]);
  });
});

describe('flow store boards', () => {
  it('adds boards with unique names and activates them', () => {
    const { s } = setup();
    const a = s().addBoard('Future');
    const b = s().addBoard('Future');
    expect(s().activeBoardId).toBe(b);
    expect(s().project.boards.map((x) => x.name)).toEqual(['Board 1', 'Future', 'Future 2']);
    expect(a).not.toBe(b);
  });

  it('refuses to delete the last board and repairs the active board on delete and undo', () => {
    const { s } = setup();
    expect(() => s().deleteBoard(s().activeBoardId)).toThrow(/at least one board/);
    const added = s().addBoard('Temp');
    s().deleteBoard(added);
    expect(s().activeBoardId).toBe(s().project.boards[0].id);
    s().undo();
    s().setActiveBoard(added);
    s().undo();
    expect(s().project.boards).toHaveLength(1);
    expect(s().activeBoardId).toBe(s().project.boards[0].id);
  });

  it('throws for deleteBoard with an unknown id and records no history', () => {
    const { s } = setup();
    s().addBoard('Temp');
    const before = s().past.length;
    expect(() => s().deleteBoard('nope')).toThrow(/Unknown board/);
    expect(s().past).toHaveLength(before);
  });
});

describe('flow store transactions and undo/redo', () => {
  it('ignores undo and redo while a transaction is open, and the transaction still commits as one entry', () => {
    const { s } = setup();
    s().begin();
    s().changeBoard((b) => addStep(b, { title: 'A' }));
    s().undo();
    expect(s().project.boards[0].nodes).toHaveLength(1);
    s().redo();
    expect(s().project.boards[0].nodes).toHaveLength(1);
    const entry = s().commit();
    expect(entry).toBeTypeOf('number');
    expect(s().past).toHaveLength(1);
  });

  it('clears the redo stack for a change made inside a transaction', () => {
    const { s } = setup();
    s().changeBoard((b) => addStep(b, { title: 'A' }));
    s().undo();
    expect(s().future).toHaveLength(1);
    s().begin();
    s().changeBoard((b) => addStep(b, { title: 'B' }));
    expect(s().future).toHaveLength(0);
    s().commit();
  });

  it('clears selection and editingId when undo falls back to a different board, even if the node id collides', () => {
    const { s } = setup();
    const originalBoardId = s().activeBoardId;
    const b0Step = s().changeBoard((b) => addStep(b, { title: 'Orig' }));
    s().begin();
    s().addBoard('Temp');
    const b1Step = s().changeBoard((b) => addStep(b, { title: 'New' }));
    s().commit();
    expect(b1Step).toBe(b0Step);
    s().select([b1Step]);
    s().setEditing(b1Step);
    s().undo();
    expect(s().activeBoardId).toBe(originalBoardId);
    expect(s().selection).toEqual([]);
    expect(s().editingId).toBeNull();
  });

  it('nulls editingId when its node is deleted', () => {
    const { s } = setup();
    const id = s().changeBoard((b) => addStep(b, { title: 'A' }));
    s().setEditing(id);
    s().changeBoard((b) => deleteSteps(b, [id]));
    expect(s().editingId).toBeNull();
  });

  it('ignores setSplitBoard for an id not in the project', () => {
    const { s } = setup();
    s().setSplitBoard('nope');
    expect(s().splitBoardId).toBeNull();
  });
});
