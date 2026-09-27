"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { safeGet, safeSet } from "@/lib/storage/safe";
import { tokens } from "@/lib/theme/tokens";

function readStoredTheme(): "dark" | "light" {
  return safeGet("local", "theme") === "dark" ? "dark" : "light";
}

function writeStoredTheme(mode: "dark" | "light") {
  safeSet("local", "theme", mode);
}

// Keeps the single <meta name="theme-color"> (set by the `viewport` export to the light
// background) in sync when the theme flips. Guarded: the tag may be absent in tests/SSR.
function setThemeColorMeta(mode: "dark" | "light") {
  try {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", mode === "dark" ? tokens.dark.bg : tokens.light.bg);
  } catch {
    // Nothing to do if the DOM isn't available.
  }
}

export function ThemeToggle() {
  const t = useTranslations("theme");
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
    setThemeColorMeta(next);
    writeStoredTheme(next);
  };

  const label = mode === "dark" ? t("toLight") : t("toDark");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border-2 border-border bg-surface-2 text-text"
    >
      {mode === "dark" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}
