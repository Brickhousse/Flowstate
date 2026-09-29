export function firstLine(note: string): string {
  return note.trim().split('\n', 1)[0];
}

export function hasMoreLines(note: string): boolean {
  return note.trim().includes('\n');
}

export function noteParagraphs(note: string): string[] {
  return note
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.length > 0);
}

export function noteToSave(current: string, draft: string): string | null {
  const next = draft.trim();
  return next === current.trim() ? null : next;
}
