"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

type Labels = {
  open: string;
  close: string;
  title: string;
  find: string;
  hours: string;
  kitchen: string;
  kitchenHelp: string;
};

export function VolunteerMenu({
  labels,
  verifiedHours,
  onFind,
  onHours,
  onKitchen,
}: {
  labels: Labels;
  verifiedHours: number;
  onFind: () => void;
  onHours: () => void;
  onKitchen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

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

  const keepFocusInMenu = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") ?? []);
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

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  return <>
    <button
      ref={triggerRef}
      type="button"
      aria-label={labels.open}
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
      className="flex size-11 items-center justify-center rounded-full text-text outline-offset-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-signal"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-2" strokeLinecap="round">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    </button>
    {open && typeof document !== "undefined" ? createPortal(
      <div className="fixed inset-0 z-[90] print:hidden">
        <div aria-hidden="true" onClick={close} className="absolute inset-0 bg-text/40" />
        <aside
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onKeyDown={keepFocusInMenu}
          className="absolute inset-y-0 right-0 flex w-[min(20rem,calc(100vw-1rem))] flex-col overflow-y-auto border-l-2 border-border bg-surface p-4 text-text shadow-xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-3">
            <h2 id={titleId} className="font-display text-xl font-semibold">{labels.title}</h2>
            <button
              ref={closeRef}
              type="button"
              aria-label={labels.close}
              onClick={close}
              className="flex size-11 items-center justify-center rounded-full text-text-muted outline-offset-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-signal"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2.5" strokeLinecap="round">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <nav className="mt-3 flex flex-col" aria-label={labels.title}>
            <MenuItem label={labels.find} onClick={() => choose(onFind)} />
            <MenuItem label={labels.hours} value={verifiedHours > 0 ? `${verifiedHours} hrs` : undefined} onClick={() => choose(onHours)} />
          </nav>
          <div className="mt-auto border-t border-border/40 pt-4">
            <button onClick={() => choose(onKitchen)} className="flex min-h-14 w-full items-center justify-between gap-4 rounded-xl px-2 text-left hover:bg-surface-2">
              <span>
                <span className="block font-semibold">{labels.kitchen}</span>
                <span className="mt-0.5 block text-sm text-text-muted">{labels.kitchenHelp}</span>
              </span>
              <span aria-hidden="true" className="text-xl">→</span>
            </button>
          </div>
        </aside>
      </div>,
      document.body,
    ) : null}
  </>;
}

function MenuItem({ label, value, onClick }: { label: string; value?: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex min-h-14 items-center justify-between gap-4 rounded-xl px-3 text-left font-semibold hover:bg-surface-2">
    <span>{label}</span>
    <span className="flex items-center gap-2">
      {value && <span className="rounded-full bg-proof/10 px-2 py-1 text-sm text-proof">{value}</span>}
      <span aria-hidden="true" className="text-xl text-text-muted">→</span>
    </span>
  </button>;
}
