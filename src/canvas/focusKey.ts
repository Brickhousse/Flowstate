let pending: string | null = null;

export function requestFocus(key: string): void {
  pending = key;
}

export function consumeFocus(key: string): boolean {
  if (pending !== key) return false;
  pending = null;
  return true;
}
