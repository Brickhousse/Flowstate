type Revealer = (ids: string[]) => void;

let current: Revealer | null = null;

export function setRevealer(fn: Revealer): () => void {
  current = fn;
  return () => {
    if (current === fn) current = null;
  };
}

export function reveal(ids: string[]): void {
  current?.(ids);
}
