export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'flowstate-theme';

export function storedTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice): void {
  if (choice === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Storage can be unavailable in private windows; the theme still applies for this session.
  }
}

export function applyStoredTheme(): void {
  applyTheme(storedTheme());
}
