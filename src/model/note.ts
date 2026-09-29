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

export const NOTE_EXCERPT_CHARS = 300;

export function noteExcerpt(note: string): { text: string; truncated: boolean } {
  if (note.length <= NOTE_EXCERPT_CHARS) return { text: note, truncated: false };
  const chars = Array.from(note);
  if (chars.length <= NOTE_EXCERPT_CHARS) return { text: note, truncated: false };
  return { text: `${chars.slice(0, NOTE_EXCERPT_CHARS).join('')}…`, truncated: true };
}
