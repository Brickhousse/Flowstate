import { describe, expect, it } from 'vitest';
import { firstLine, hasMoreLines, noteExcerpt, noteParagraphs, noteToSave } from './note';

describe('note rules', () => {
  it('takes the text before the first line break as the first line', () => {
    expect(firstLine('One\nTwo')).toBe('One');
    expect(firstLine('Only')).toBe('Only');
    expect(firstLine('')).toBe('');
  });

  it('has more to read only when a line break follows the first line', () => {
    expect(hasMoreLines('One\n\nTwo')).toBe(true);
    expect(hasMoreLines('Only')).toBe(false);
    expect(hasMoreLines('Only\n')).toBe(false);
  });

  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    expect(noteParagraphs('A\nstill A\n\nB\n\n\nC')).toEqual(['A\nstill A', 'B', 'C']);
    expect(noteParagraphs('')).toEqual([]);
  });

  it('saves the trimmed draft only when it differs from the note', () => {
    expect(noteToSave('Old', ' New \n')).toBe('New');
    expect(noteToSave('Old', 'Old  \n\n')).toBeNull();
    expect(noteToSave('', '   ')).toBeNull();
    expect(noteToSave('Old', '')).toBe('');
  });
});

describe('noteExcerpt', () => {
  it('keeps a note of 300 characters whole', () => {
    const note = 'x'.repeat(300);
    expect(noteExcerpt(note)).toEqual({ text: note, truncated: false });
  });

  it('cuts a longer note to 300 characters and an ellipsis', () => {
    expect(noteExcerpt(`${'x'.repeat(300)}yz`)).toEqual({ text: `${'x'.repeat(300)}…`, truncated: true });
  });

  it('never splits a character made of two code units', () => {
    expect(noteExcerpt(`${'a'.repeat(299)}😀😀`)).toEqual({ text: `${'a'.repeat(299)}😀…`, truncated: true });
  });
});
