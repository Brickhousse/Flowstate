import { produce } from 'immer';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { createBoard, createProject } from '../model/factory';
import type { Board, Project } from '../model/types';
import type { Clip } from '../ops/clipboard';
import { OpError } from '../ops/errors';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface HistoryEntry {
  id: number;
  project: Project;
}

export interface FlowState {
  project: Project;
  activeBoardId: string;
  splitBoardId: string | null;
  selection: string[];
  edgeSelection: string[];
  past: HistoryEntry[];
  future: HistoryEntry[];
  tx: { base: Project; depth: number } | null;
  criticalPath: boolean;
  glow: Record<string, number>;
  saveStatus: SaveStatus;
  clipboard: Clip | null;
  chatOpen: boolean;
  editingId: string | null;
  editSeed: string | null;
  exporting: boolean;
}

export interface FlowActions {
  loadProject(project: Project): void;
  change<R>(fn: (draft: Project) => R): R;
  changeBoard<R>(fn: (board: Board) => R, boardId?: string): R;
  begin(): void;
  commit(): number | null;
  undo(): void;
  redo(): void;
  undoEntry(id: number): boolean;
  select(nodeIds: string[], edgeIds?: string[]): void;
  setActiveBoard(id: string): void;
  setSplitBoard(id: string | null): void;
  addBoard(name: string, activate?: boolean): string;
  deleteBoard(id: string): void;
  toggleCriticalPath(): void;
  markGlow(ids: string[]): void;
  setSaveStatus(status: SaveStatus): void;
  setClipboard(clip: Clip | null): void;
  setChatOpen(open: boolean): void;
  setEditing(id: string | null, seed?: string): void;
  setExporting(value: boolean): void;
}

export type FlowStore = FlowState & FlowActions;

const HISTORY_CAP = 200;
const GLOW_MS = 2000;
let entrySeq = 0;

function pushCapped(list: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const next = [...list, entry];
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
}

function uniqueName(project: Project, name: string): string {
  const taken = new Set(project.boards.map((b) => b.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
}

function repaired(state: FlowState, project: Project): Partial<FlowState> {
  const boards = new Set(project.boards.map((b) => b.id));
  const activeBoardId = boards.has(state.activeBoardId) ? state.activeBoardId : project.boards[0].id;
  const splitBoardId = state.splitBoardId && boards.has(state.splitBoardId) && state.splitBoardId !== activeBoardId ? state.splitBoardId : null;
  const board = project.boards.find((b) => b.id === activeBoardId)!;
  const nodeIds = new Set(board.nodes.map((n) => n.id));
  const edgeIds = new Set(board.edges.map((e) => e.id));
  const selection = state.selection.filter((id) => nodeIds.has(id));
  const edgeSelection = state.edgeSelection.filter((id) => edgeIds.has(id));
  return {
    project,
    activeBoardId,
    splitBoardId,
    selection: selection.length === state.selection.length ? state.selection : selection,
    edgeSelection: edgeSelection.length === state.edgeSelection.length ? state.edgeSelection : edgeSelection,
  };
}

export function createFlowStore(initial: Project = createProject()): StoreApi<FlowStore> {
  return createStore<FlowStore>()((set, get) => ({
    project: initial,
    activeBoardId: initial.boards[0].id,
    splitBoardId: null,
    selection: [],
    edgeSelection: [],
    past: [],
    future: [],
    tx: null,
    criticalPath: false,
    glow: {},
    saveStatus: 'idle',
    clipboard: null,
    chatOpen: true,
    editingId: null,
    editSeed: null,
    exporting: false,

    loadProject(project) {
      set({
        project,
        activeBoardId: project.boards[0].id,
        splitBoardId: null,
        selection: [],
        edgeSelection: [],
        past: [],
        future: [],
        tx: null,
        glow: {},
        editingId: null,
        saveStatus: 'saved',
      });
    },

    change<R>(fn: (draft: Project) => R): R {
      const state = get();
      let result!: R;
      const next = produce(state.project, (draft) => {
        result = fn(draft as Project);
      });
      if (next !== state.project) {
        set({
          ...repaired(state, next),
          ...(state.tx ? {} : { past: pushCapped(state.past, { id: ++entrySeq, project: state.project }), future: [] }),
        });
      }
      return result;
    },

    changeBoard<R>(fn: (board: Board) => R, boardId?: string): R {
      const id = boardId ?? get().activeBoardId;
      return get().change((p) => {
        const board = p.boards.find((b) => b.id === id);
        if (!board) throw new OpError(`Unknown board "${id}".`);
        return fn(board);
      });
    },

    begin() {
      const { tx, project } = get();
      set({ tx: tx ? { ...tx, depth: tx.depth + 1 } : { base: project, depth: 1 } });
    },

    commit() {
      const { tx, project, past } = get();
      if (!tx) return null;
      if (tx.depth > 1) {
        set({ tx: { ...tx, depth: tx.depth - 1 } });
        return null;
      }
      if (project === tx.base) {
        set({ tx: null });
        return null;
      }
      const id = ++entrySeq;
      set({ tx: null, past: pushCapped(past, { id, project: tx.base }), future: [] });
      return id;
    },

    undo() {
      while (get().tx) get().commit();
      const state = get();
      const entry = state.past[state.past.length - 1];
      if (!entry) return;
      set({
        ...repaired(state, entry.project),
        past: state.past.slice(0, -1),
        future: [...state.future, { id: entry.id, project: state.project }],
        editingId: null,
      });
    },

    redo() {
      const state = get();
      const entry = state.future[state.future.length - 1];
      if (!entry) return;
      set({
        ...repaired(state, entry.project),
        future: state.future.slice(0, -1),
        past: pushCapped(state.past, { id: entry.id, project: state.project }),
        editingId: null,
      });
    },

    undoEntry(id) {
      const { past, tx } = get();
      if (tx || past[past.length - 1]?.id !== id) return false;
      get().undo();
      return true;
    },

    select(nodeIds, edgeIds = []) {
      set({ selection: nodeIds, edgeSelection: edgeIds });
    },

    setActiveBoard(id) {
      const state = get();
      if (!state.project.boards.some((b) => b.id === id)) return;
      set({ activeBoardId: id, selection: [], edgeSelection: [], editingId: null, splitBoardId: state.splitBoardId === id ? null : state.splitBoardId });
    },

    setSplitBoard(id) {
      set({ splitBoardId: id === get().activeBoardId ? null : id });
    },

    addBoard(name, activate = true) {
      const board = createBoard(uniqueName(get().project, name.trim() || 'Board'));
      get().change((p) => {
        p.boards.push(board);
      });
      if (activate) get().setActiveBoard(board.id);
      return board.id;
    },

    deleteBoard(id) {
      if (get().project.boards.length <= 1) throw new OpError('A project needs at least one board.');
      get().change((p) => {
        p.boards = p.boards.filter((b) => b.id !== id);
      });
    },

    toggleCriticalPath() {
      set({ criticalPath: !get().criticalPath });
    },

    markGlow(ids) {
      if (ids.length === 0) return;
      const stamp = Date.now();
      set({ glow: { ...get().glow, ...Object.fromEntries(ids.map((id) => [id, stamp])) } });
      setTimeout(() => {
        const glow = { ...get().glow };
        for (const id of ids) if (glow[id] === stamp) delete glow[id];
        set({ glow });
      }, GLOW_MS);
    },

    setSaveStatus(saveStatus) {
      set({ saveStatus });
    },
    setClipboard(clipboard) {
      set({ clipboard });
    },
    setChatOpen(chatOpen) {
      set({ chatOpen });
    },
    setEditing(editingId, seed) {
      set({ editingId, editSeed: seed ?? null });
    },
    setExporting(exporting) {
      set({ exporting });
    },
  }));
}

export const flowStore = createFlowStore();

export function useFlow<T>(selector: (s: FlowStore) => T): T {
  return useStore(flowStore, selector);
}

export function selectActiveBoard(s: FlowStore): Board {
  return s.project.boards.find((b) => b.id === s.activeBoardId) ?? s.project.boards[0];
}
