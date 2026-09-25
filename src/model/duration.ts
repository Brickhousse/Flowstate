export class DurationError extends Error {}

const UNIT_MINUTES: Record<string, number> = { m: 1, h: 60, d: 480, w: 2400 };
const TOKEN = /(\d+(?:\.\d+)?)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?|w|wks?|weeks?)\b/gy;

export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  let total = 0;
  let index = 0;
  TOKEN.lastIndex = 0;
  while (index < text.length) {
    TOKEN.lastIndex = index;
    const match = TOKEN.exec(text);
    if (!match) throw invalid(input);
    total += Number(match[1]) * UNIT_MINUTES[match[2][0]];
    index = TOKEN.lastIndex;
    while (text[index] === ' ' || text[index] === ',') index++;
  }
  return Math.round(total);
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m';
  const parts: string[] = [];
  let rest = Math.round(minutes);
  for (const [unit, size] of [['w', 2400], ['d', 480], ['h', 60], ['m', 1]] as const) {
    if (rest >= size && parts.length < 2) {
      parts.push(`${Math.floor(rest / size)}${unit}`);
      rest %= size;
    }
  }
  return parts.join(' ');
}

function invalid(input: string): DurationError {
  return new DurationError(`Cannot read duration "${input}". Use forms like 30m, 2h, 1.5d, 1w.`);
}
