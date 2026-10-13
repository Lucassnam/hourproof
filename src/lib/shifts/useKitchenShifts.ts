"use client";

import { useEffect, useState } from "react";
import { loadBackend, withTimeout } from "./client-backend";
import { cacheShifts, cachedShifts, hasCheckedInHere } from "./local";
import type { Shift } from "./types";

// This person's kitchen shifts, for the hour log and the proof page.
//
// The copy kept on the phone shows first, so the page works without signal. Then, only if
// this browser has checked in at a kitchen before, the server is asked for the current list.
// A person who never used a kitchen never contacts the server from these pages, and the
// backend code (and supabase-js behind it) is never downloaded for them.
//
// `enabled` is false until the page knows it is not in the demo, which has no kitchen and
// must not touch the network.
export function useKitchenShifts(enabled: boolean, sinceDate: string): { shifts: Shift[]; syncFailed: boolean } {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [syncFailed, setSyncFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setShifts(cachedShifts());
    setSyncFailed(false);
    if (!hasCheckedInHere()) return;
    (async () => {
      try {
        const backend = await loadBackend();
        if (backend.kind === "unavailable") return;
        const fresh = await withTimeout(backend.myShifts(sinceDate));
        if (cancelled) return;
        cacheShifts(fresh);
        setShifts(fresh);
      } catch {
        if (!cancelled) setSyncFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, sinceDate]);

  return { shifts, syncFailed };
}
