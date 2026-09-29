import { describe, expect, it } from 'vitest';
import { createProject } from '../../model/factory';
import { addStep, deleteSteps } from '../../ops/steps';
import { createFlowStore } from '../../store/store';
import { createNoteSession } from './noteSession';

function setup() {
  const project = createProject('P');
  const board = project.boards[0];
  const a = addStep(board, { title: 'A', note: 'Old' });
  const b = addStep(board, { title: 'B' });
  const flow = createFlowStore(project);
  let lost = 0;
  const session = createNoteSession(flow, board.id, () => lost++);
  const noteOf = (id: string) => flow.getState().project.boards.find((x) => x.id === board.id)?.nodes.find((n) => n.id === id)?.note;
  const history = () => flow.getState().past.length;
  const openId = () => session.state.getState().nodeId;
  return { flow, session, a, b, boardId: board.id, noteOf, history, openId, lostDrafts: () => lost };
}

describe('note session', () => {
  it('saves an edited note as one undo step when it closes', () => {
    const { flow, session, a, noteOf, history, openId } = setup();
    session.open(a);
    session.edit('First\n\nSecond');
    session.edit('First\n\nSecond part ');
    expect(history()).toBe(0);
    session.close();
    expect(noteOf(a)).toBe('First\n\nSecond part');
    expect(history()).toBe(1);
    expect(openId()).toBeNull();
    flow.getState().undo();
    expect(noteOf(a)).toBe('Old');
  });

  it('adds no undo step when closed without an edit or with only whitespace added', () => {
    const { session, a, noteOf, history } = setup();
    session.open(a);
    session.close();
    session.open(a);
    session.edit('Old \n\n');
    session.close();
    expect(history()).toBe(0);
    expect(noteOf(a)).toBe('Old');
  });

  it('adds no undo step when the draft is edited back to the saved note', () => {
    const { session, a, history } = setup();
    session.open(a);
    session.edit('Changed');
    session.edit('Old');
    session.close();
    expect(history()).toBe(0);
  });

  it('clears a note emptied in the draft', () => {
    const { flow, session, a, noteOf, history } = setup();
    session.open(a);
    session.edit('  \n');
    session.close();
    expect(noteOf(a)).toBe('');
    expect(history()).toBe(1);
    flow.getState().undo();
    expect(noteOf(a)).toBe('Old');
  });

  it('saves the open note before opening another', () => {
    const { session, a, b, noteOf, history, openId } = setup();
    session.open(a);
    session.edit('Changed');
    session.open(b);
    expect(noteOf(a)).toBe('Changed');
    expect(history()).toBe(1);
    expect(openId()).toBe(b);
    session.close();
    expect(history()).toBe(1);
  });

  it('undoes a note saved by switching steps without touching the next note', () => {
    const { flow, session, a, b, noteOf } = setup();
    session.open(a);
    session.edit('Changed');
    session.open(b);
    session.edit('New');
    session.close();
    flow.getState().undo();
    expect(noteOf(b)).toBe('');
    expect(noteOf(a)).toBe('Changed');
    flow.getState().undo();
    expect(noteOf(a)).toBe('Old');
  });

  it('keeps the draft when the open note is opened again', () => {
    const { session, a, noteOf } = setup();
    session.open(a);
    session.edit('Kept');
    session.open(a);
    session.close();
    expect(noteOf(a)).toBe('Kept');
  });

  it('ignores edits while no note is open', () => {
    const { session, a, noteOf, history } = setup();
    session.edit('Stray');
    session.open(a);
    session.close();
    expect(history()).toBe(0);
    expect(noteOf(a)).toBe('Old');
  });

  it('drops the draft quietly when the step is gone', () => {
    const { flow, session, a, history, openId } = setup();
    session.open(a);
    session.edit('Lost');
    flow.getState().changeBoard((x) => deleteSteps(x, [a]));
    const before = history();
    session.close();
    expect(history()).toBe(before);
    expect(openId()).toBeNull();
  });

  it('reports a written draft it had to drop because the step is gone', () => {
    const { flow, session, a, lostDrafts } = setup();
    session.open(a);
    session.edit('Lost');
    flow.getState().changeBoard((x) => deleteSteps(x, [a]));
    session.close();
    expect(lostDrafts()).toBe(1);
  });

  it('reports nothing when the step goes with the note unedited or blanked', () => {
    const { flow, session, a, b, lostDrafts } = setup();
    session.open(a);
    flow.getState().changeBoard((x) => deleteSteps(x, [a]));
    session.close();
    session.open(b);
    session.edit('  \n');
    flow.getState().changeBoard((x) => deleteSteps(x, [b]));
    session.close();
    expect(lostDrafts()).toBe(0);
  });

  it('reports nothing when a written draft is saved', () => {
    const { session, a, lostDrafts } = setup();
    session.open(a);
    session.edit('Kept');
    session.close();
    expect(lostDrafts()).toBe(0);
  });

  it('drops the draft quietly when its board is gone', () => {
    const { flow, session, a, boardId, history, openId } = setup();
    flow.getState().addBoard('Other');
    session.open(a);
    session.edit('Lost');
    flow.getState().deleteBoard(boardId);
    const before = history();
    expect(() => session.close()).not.toThrow();
    expect(history()).toBe(before);
    expect(openId()).toBeNull();
  });

  it('saves to its own board after another board becomes active', () => {
    const { flow, session, a, boardId, noteOf } = setup();
    session.open(a);
    session.edit('Pinned');
    flow.getState().addBoard('Other');
    expect(flow.getState().activeBoardId).not.toBe(boardId);
    session.close();
    expect(noteOf(a)).toBe('Pinned');
  });

  it('works when its methods are passed around as bare callbacks', () => {
    const { session, a, noteOf } = setup();
    const { open, edit, close } = session;
    open(a);
    edit('Loose');
    close();
    expect(noteOf(a)).toBe('Loose');
  });

  it('toggles a note shut, saving it, and opens another step in its place', () => {
    const { session, a, b, noteOf, history, openId } = setup();
    const { toggle } = session;
    toggle(a);
    expect(openId()).toBe(a);
    session.edit('Toggled');
    toggle(b);
    expect(openId()).toBe(b);
    expect(noteOf(a)).toBe('Toggled');
    toggle(b);
    expect(openId()).toBeNull();
    expect(history()).toBe(1);
  });
});
