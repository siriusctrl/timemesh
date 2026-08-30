import { useEffect, useLayoutEffect, useState } from "react";
import { beginThemeReveal } from "./themeReveal";

export type Theme = "light" | "dark";
type ThemePreference = Theme | "system";

const THEME_STORAGE_KEY = "timemesh-theme-preference";

function readSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readThemePreference(): ThemePreference {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    window.localStorage.removeItem("timemesh-theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#24252b" : "#f1f1f3");
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference);
  const [systemTheme, setSystemTheme] = useState<Theme>(readSystemTheme);
  const theme = preference === "system" ? systemTheme : preference;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? "dark" : "light");
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useLayoutEffect(() => {
    if (document.documentElement.dataset.themeTransition !== "active") applyTheme(theme);
  }, [theme]);

  const toggleTheme = (trigger: HTMLButtonElement) => {
    if (document.documentElement.dataset.themeTransition === "active") return;
    const nextTheme = theme === "light" ? "dark" : "light";
    beginThemeReveal(trigger, nextTheme);
    setPreference(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The current tab still keeps the selected theme.
    }
  };

  return {
    followsSystem: preference === "system",
    theme,
    toggleTheme,
  };
}
