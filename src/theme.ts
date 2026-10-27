import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
// Per-device preference, so it lives in localStorage rather than the exported AppData.
// index.html reads the same key before first paint to avoid a flash of the wrong theme.
const KEY = "treatcode-theme";
const dark = () => window.matchMedia("(prefers-color-scheme: dark)");

export function loadTheme(): ThemePref {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}
function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Storage blocked: the choice still applies for this visit.
  }
}
// Returns the stored preference, a setter, and the theme actually on screen.
export function useTheme() {
  const [pref, setPref] = useState(loadTheme);
  const [systemDark, setSystemDark] = useState(() => dark().matches);
  useEffect(() => applyTheme(pref), [pref]);
  useEffect(() => {
    const query = dark();
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const resolved: "light" | "dark" = pref === "system" ? (systemDark ? "dark" : "light") : pref;
  return [pref, setPref, resolved] as const;
}
