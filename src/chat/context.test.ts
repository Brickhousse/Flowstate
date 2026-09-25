import { describe, expect, it } from 'vitest';
import { createProject } from '../model/factory';
import { addStep } from '../ops/steps';
import { buildUserContent, expandMentions } from './context';

describe('chat context', () => {
  it('wraps the board summary, selection and request', () => {
    const p = createProject();
    const b = p.boards[0];
    const id = addStep(b, { title: 'Intake' });
    const text = buildUserContent(p, b.id, [id], 'Add a review after this');
    expect(text.startsWith('<board>\nBoard "Board 1"')).toBe(true);
    expect(text).toContain('</board>\nSelected: s1 "Intake"\n\nAdd a review after this');
    expect(buildUserContent(p, b.id, [], 'x')).toContain('Selected: nothing');
  });

  it('expands mentions, longest label first', () => {
    const out = expandMentions('Move @Review claim after @Review', [
      { label: 'Review', id: 's2' },
      { label: 'Review claim', id: 's5' },
    ]);
    expect(out).toBe('Move "Review claim" (s5) after "Review" (s2)');
  });
});
