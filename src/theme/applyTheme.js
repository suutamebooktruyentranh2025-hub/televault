const STORAGE_KEY = 'televault_theme';

export function applyTheme(theme) {
  const value = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // ignore quota / private mode
  }
}

export function readCachedTheme() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    return cached === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
