export type StatKey =
  | 'boardsCreated'
  | 'stepsAdded'
  | 'stepsUpdated'
  | 'stepsDeleted'
  | 'moved'
  | 'arrowsAdded'
  | 'arrowsRemoved'
  | 'flagsAdded'
  | 'flagsResolved'
  | 'flagsReopened'
  | 'grouped'
  | 'lanesSet'
  | 'textAdded'
  | 'tidied'
  | 'arranged';

export type Stats = Partial<Record<StatKey, number>>;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const PHRASES: Array<[StatKey, (n: number) => string]> = [
  ['boardsCreated', (n) => (n === 1 ? 'new board' : `${n} new boards`)],
  ['stepsAdded', (n) => `${plural(n, 'step', 'steps')} added`],
  ['stepsUpdated', (n) => `${n} updated`],
  ['stepsDeleted', (n) => `${n} deleted`],
  ['moved', (n) => `${n} moved`],
  ['arranged', (n) => `${n} arranged`],
  ['arrowsAdded', (n) => `${plural(n, 'arrow', 'arrows')} added`],
  ['arrowsRemoved', (n) => `${plural(n, 'arrow', 'arrows')} removed`],
  ['flagsAdded', (n) => plural(n, 'flag', 'flags')],
  ['flagsResolved', (n) => `${n} resolved`],
  ['flagsReopened', (n) => `${n} reopened`],
  ['grouped', (n) => plural(n, 'group', 'groups')],
  ['lanesSet', () => 'lanes updated'],
  ['textAdded', (n) => plural(n, 'note', 'notes')],
  ['tidied', () => 'tidied'],
];

export function mergeStats(a: Stats, b: Stats): Stats {
  const out: Stats = { ...a };
  for (const [key, value] of Object.entries(b) as Array<[StatKey, number]>) out[key] = (out[key] ?? 0) + value;
  return out;
}

export function describeStats(stats: Stats): string {
  const parts = PHRASES.filter(([key]) => (stats[key] ?? 0) > 0).map(([key, phrase]) => phrase(stats[key]!));
  if (parts.length === 0) return '';
  const text = parts.join(', ');
  return text[0].toUpperCase() + text.slice(1);
}
