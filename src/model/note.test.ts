import { describe, expect, it } from 'vitest';
import { firstLine, hasMoreLines, noteParagraphs, noteToSave } from './note';

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
