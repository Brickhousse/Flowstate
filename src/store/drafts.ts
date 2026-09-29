const held = new Set<() => void>();

export function holdDraft(commit: () => void): () => void {
  held.add(commit);
  return () => {
    held.delete(commit);
  };
}

export function commitDrafts(): void {
  for (const commit of [...held]) commit();
}
