"use client";

import { Icon } from "./icons";

export function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const next = root.classList.contains("dark") ? "light" : "dark";
    root.classList.toggle("dark", next === "dark");
    root.style.colorScheme = next;
    try {
      window.localStorage.setItem("pichat-theme", next);
    } catch {
      // Storage can be unavailable in private modes; the toggle still works for this session.
    }
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="切换深色或浅色主题"
      title="切换主题"
      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
    >
      <Icon name="moon" className="dark:hidden" />
      <Icon name="sun" className="hidden dark:block" />
    </button>
  );
}
