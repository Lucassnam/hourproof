"use client";

import { useEffect, type RefObject } from "react";

// A page with a sticky bottom bar (the checklist's actions, the hour form's Save/Cancel)
// marks the bar with `data-sticky-bar`; globals.css then gives <html> a scroll-padding-bottom
// of the bar's height, so Tab, focus() and find-in-page never park an element under it
// (WCAG 2.4.11). The bar's height changes with the language, the font size and how many
// buttons it shows, so this measures it and hands it to the CSS as --sticky-bar-h.
export function useStickyBarHeight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--sticky-bar-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--sticky-bar-h");
    };
  }, [ref]);
}
