"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A compact, tap-friendly disclosure for secondary explanations. The opened content is
// portalled into a viewport-sized layer instead of being anchored to the icon. That keeps
// every panel readable even when the icon is beside a screen edge or near the bottom.
export function InfoTip({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  const keepFocusInPanel = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <span className="shrink-0 print:hidden" data-testid={testId}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? dialogId : undefined}
        onClick={() => setOpen(true)}
        className="flex size-10 items-center justify-center rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-signal"
      >
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-full border-2 border-border bg-surface font-display text-sm font-bold leading-none text-text-muted"
        >
          i
        </span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 print:hidden">
              <div
                aria-hidden="true"
                onClick={close}
                className="absolute inset-0 bg-text/40"
              />
              <div
                id={dialogId}
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onKeyDown={keepFocusInPanel}
                className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border-2 border-border bg-surface text-left text-text shadow-xl"
              >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/40 px-4 py-3">
                  <h2 id={titleId} className="min-w-0 font-display text-lg font-semibold leading-snug">
                    {label}
                  </h2>
                  <button
                    ref={closeRef}
                    type="button"
                    aria-label="Close information"
                    onClick={close}
                    className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-text-muted outline-offset-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-signal"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                <div className="min-h-0 overflow-y-auto p-4 text-base leading-snug">{children}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
