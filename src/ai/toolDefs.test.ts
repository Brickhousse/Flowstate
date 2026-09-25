import { describe, expect, it } from 'vitest';
import { TOOL_SCHEMAS } from './schemas';
import { SYSTEM_PROMPT } from './systemPrompt';
import { TOOL_DEFS } from './toolDefs';

describe('tool definitions', () => {
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
});
