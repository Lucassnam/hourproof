import type { ShiftRecord } from "./types";

const STORAGE_KEY = "hp.shiftcred.demo.v1";

export function loadShiftRecords(): ShiftRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as ShiftRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveShiftRecords(records: readonly ShiftRecord[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // The demo remains usable for this page view if storage is blocked.
  }
}

