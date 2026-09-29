import { describe, expect, it } from 'vitest';
import { commitDrafts, holdDraft } from './drafts';

describe('drafts', () => {
  it('commits every held draft until it is released', () => {
    const committed: string[] = [];
    const releaseA = holdDraft(() => committed.push('a'));
    const releaseB = holdDraft(() => committed.push('b'));
    commitDrafts();
    releaseA();
    commitDrafts();
    releaseB();
    commitDrafts();
    expect(committed).toEqual(['a', 'b', 'b']);
  });
});
