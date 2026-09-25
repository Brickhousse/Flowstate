import { summarizeBoard } from '../analysis/summary';
import type { Project } from '../model/types';

export interface Mention {
  label: string;
  id: string;
}

export function buildUserContent(project: Project, boardId: string, selection: string[], text: string): string {
  const board = project.boards.find((b) => b.id === boardId);
  const selected = selection.length
    ? selection
        .map((id) => {
          const n = board?.nodes.find((x) => x.id === id);
          return n ? `${id} ${JSON.stringify(n.title || '(untitled)')}` : id;
        })
        .join(', ')
    : 'nothing';
  return `<board>\n${summarizeBoard(project, boardId)}\n</board>\nSelected: ${selected}\n\n${text}`;
}

export function expandMentions(text: string, mentions: Mention[]): string {
  let out = text;
  for (const m of [...mentions].sort((a, b) => b.label.length - a.label.length)) {
    out = out.split(`@${m.label}`).join(`"${m.label}" (${m.id})`);
  }
  return out;
}
