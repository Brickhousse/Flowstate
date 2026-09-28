export type RenderCache<T> = Map<string, { deps: unknown[]; value: T }>;

export function cached<T>(cache: RenderCache<T>, id: string, deps: unknown[], make: () => T): T {
  const hit = cache.get(id);
  if (hit && hit.deps.length === deps.length && hit.deps.every((d, i) => d === deps[i])) return hit.value;
  const value = make();
  cache.set(id, { deps, value });
  return value;
}
