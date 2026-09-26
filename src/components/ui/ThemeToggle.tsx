"use client";

import { useEffect, useState } from "react";

function readStoredTheme(): "dark" | "light" {
  try {
    return window.localStorage.getItem("theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function writeStoredTheme(mode: "dark" | "light") {
  try {
    window.localStorage.setItem("theme", mode);
  } catch {
    // localStorage may throw in private mode; theme still applies for this session.
  }
}

export function ThemeToggle() {
  const [mode, setMode] = useState<"dark" | "light">("light");

  useEffect(() => {
    setMode(readStoredTheme());
  }, []);

  const toggle = () => {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    if (next === "dark") {
      document.documentElement.dataset.theme = "dark";
    } else {
      delete document.documentElement.dataset.theme;
    }
    writeStoredTheme(next);
  };

  const label = mode === "dark" ? "Dark mode" : "Light mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-surface-2 text-text"
    >
      {mode === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
