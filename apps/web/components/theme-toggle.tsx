"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "./icons";

type ThemeName = "light" | "dark" | "pi";

const order: ThemeName[] = ["light", "dark", "pi"];
const icons: Record<ThemeName, IconName> = { light: "sun", dark: "moon", pi: "grid" };
const labels: Record<ThemeName, string> = { light: "浅色", dark: "深色", pi: "Pi 羊皮纸" };

function currentTheme(): ThemeName {
  const root = document.documentElement;
  if (root.classList.contains("pi")) return "pi";
  return root.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeName>("light");

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function toggleTheme() {
    const next = order[(order.indexOf(theme) + 1) % order.length] ?? "light";
    const root = document.documentElement;
    root.classList.toggle("dark", next === "dark");
    root.classList.toggle("pi", next === "pi");
    root.style.colorScheme = next === "dark" ? "dark" : "light";
    setTheme(next);
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
      aria-label={`切换主题，当前：${labels[theme]}`}
      title={`主题：${labels[theme]}`}
      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
    >
      <Icon name={icons[theme]} />
    </button>
  );
}
