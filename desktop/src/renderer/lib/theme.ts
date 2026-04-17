import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "sense1-theme";

export function readStoredTheme(): ThemePreference {
  if (typeof localStorage === "undefined") return "system";
  // localStorage.getItem can throw SecurityError in restricted profiles or
  // sandboxed webviews; fall back to the default theme so startup never aborts.
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // ignore — default to "system"
  }
  return "system";
}

export function applyTheme(theme: ThemePreference): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function persistTheme(theme: ThemePreference): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore — preference won't persist across reloads in restricted contexts
  }
}

export function useTheme(): [ThemePreference, (next: ThemePreference) => void] {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function setTheme(next: ThemePreference) {
    persistTheme(next);
    setThemeState(next);
  }

  return [theme, setTheme];
}
