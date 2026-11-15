"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

const subscribe = () => () => {};

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <label className="theme-select">
      <Sun size={16} strokeWidth={1.5} aria-hidden="true" className="dark:hidden" />
      <Moon size={16} strokeWidth={1.5} aria-hidden="true" className="hidden dark:block" />
      <span className="sr-only">Appearance</span>
      <select aria-label="Appearance" value={mounted ? theme : "system"} disabled={!mounted} onChange={event => setTheme(event.target.value)}>
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
      </select>
    </label>
  );
}
