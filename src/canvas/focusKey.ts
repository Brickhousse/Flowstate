let pending: string | null = null;
const mounted = new Map<string, () => void>();

export function requestFocus(key: string): void {
  const focus = mounted.get(key);
  if (focus) {
    pending = null;
    focus();
  } else pending = key;
}

export function consumeFocus(key: string): boolean {
  if (pending !== key) return false;
  pending = null;
  return true;
}

export function registerFocus(key: string, focus: () => void): () => void {
  mounted.set(key, focus);
  return () => {
    if (mounted.get(key) === focus) mounted.delete(key);
  };
}
