import { describe, expect, it } from 'vitest';
import { TOOL_SCHEMAS } from './schemas';
import { SYSTEM_PROMPT } from './systemPrompt';
import { TOOL_DEFS } from './toolDefs';

describe('tool definitions', () => {
  it('tells the assistant that Tidy resets hand-shaped arrows', () => {
    expect(SYSTEM_PROMPT).toContain('Tidy resets hand-shaped arrows');
  });

  it('defines one object schema per tool with a description', () => {
    expect(TOOL_DEFS.map((t) => t.name).sort()).toEqual(Object.keys(TOOL_SCHEMAS).sort());
    for (const tool of TOOL_DEFS) {
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema).not.toHaveProperty('$schema');
      expect(tool.description!.length).toBeGreaterThan(20);
    }
  });

  it('keeps the prompt free of em dashes', () => {
    const text = SYSTEM_PROMPT + TOOL_DEFS.map((t) => t.description).join('');
    expect(text).not.toContain('\u2014');
  });

  it('describes notes, read_notes and where explanations go', () => {
    const def = (name: string) => JSON.stringify(TOOL_DEFS.find((t) => t.name === name));
    const noteText = 'Longer explanation of the step, such as what a presenter would say about it. Separate paragraphs with a blank line. update_steps replaces the whole note.';
    expect(def('add_steps')).toContain(noteText);
    expect(def('update_steps')).toContain(noteText);
    expect(def('update_steps')).toContain('note-truncated');
    expect(def('update_steps')).toContain('read_notes');
    expect(def('read_notes')).toContain('note-truncated');
    expect(SYSTEM_PROMPT).toContain('about a step in its note');
  });
});
