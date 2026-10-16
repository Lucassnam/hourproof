"use client";

import { useEffect, useRef, useState } from "react";
import { loadBackend, withTimeout } from "./client-backend";
import { cacheShifts, cachedShifts, hasCheckedInHere } from "./local";
import type { Shift } from "./types";

// How often an open page asks again while a shift is still waiting on something (the
// volunteer to check out, or the kitchen to confirm). The kitchen dashboard uses the same
// 30 seconds.
const WAITING_POLL_MS = 30_000;

function isWaiting(shift: Shift): boolean {
  return shift.status === "open" || shift.status === "pending";
}

// This person's kitchen shifts, for the hour log and the proof page.
//
// The copy kept on the phone shows first, so the page works without signal. Then, only if
// this browser has checked in at a kitchen before, the server is asked for the current list.
// A person who never used a kitchen never contacts the server from these pages, and the
// backend code (and supabase-js behind it) is never downloaded for them.
//
// The list is asked for again when the phone comes back to the page (woken up, or the tab
// brought forward), and every 30 seconds while the page is in front and a shift is still
// waiting. Without that, a log left open would say "Waiting for the kitchen" long after the
// supervisor confirmed (seen against the hosted project, 2026-10-13). Once nothing is
// waiting, an open page makes no more requests on its own.
//
// `enabled` is false until the page knows it is not in the demo, which has no kitchen and
// must not touch the network. Changing `resyncKey` starts over (the log bumps it after this
// browser is linked to another one, which also makes hasCheckedInHere() true).
export function useKitchenShifts(
  enabled: boolean,
  sinceDate: string,
  resyncKey = 0,
): { shifts: Shift[]; syncFailed: boolean } {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [syncFailed, setSyncFailed] = useState(false);
  const waiting = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let inFlight = false;

    const show = (list: Shift[]) => {
      waiting.current = list.some(isWaiting);
      setShifts(list);
    };

    const sync = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const backend = await loadBackend();
        if (backend.kind === "unavailable") return;
        const fresh = await withTimeout(backend.myShifts(sinceDate));
        if (cancelled) return;
        cacheShifts(fresh);
        show(fresh);
        setSyncFailed(false);
      } catch {
        if (!cancelled) setSyncFailed(true);
      } finally {
        inFlight = false;
      }
    };

    show(cachedShifts());
    setSyncFailed(false);
    if (!hasCheckedInHere()) return;
    void sync();

    const onReturn = () => {
      if (document.visibilityState !== "hidden") void sync();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    const poll = window.setInterval(() => {
      if (waiting.current && document.visibilityState !== "hidden") void sync();
    }, WAITING_POLL_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
      window.clearInterval(poll);
    };
  }, [enabled, sinceDate, resyncKey]);

  return { shifts, syncFailed };
}
