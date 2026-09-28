import type { ActivityEntry } from "./types";

const STORAGE_KEY = "hp.activities.v1";
const EVENT_NAME = "hourproof-activities-changed";

export function loadActivities(): ActivityEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as ActivityEntry[] : [];
  } catch {
    return [];
  }
}

export function saveActivities(entries: readonly ActivityEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // The current page still works if private browsing blocks storage.
  }
}

export function onActivitiesChanged(listener: () => void) {
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener("storage", listener);
  };
}

