// What this phone remembers about kitchen shifts, so the hour log can show them at once and
// without signal. The server (see supabase.ts) stays the source of truth; this is a copy.
//
// It lives in localStorage, not in the hour log's IndexedDB: shifts are a short list the
// server already keeps, so losing the copy costs nothing, and a new object store would mean
// a database version bump on every phone that already holds saved hours.

import { safeGet, safeSet } from '@/lib/storage/safe'
import type { Shift, ShiftStatus } from './types'

// Set by the check-in page (/k/[code]) the first time this browser checks in anywhere.
export const CHECKIN_ACK_KEY = 'hp.checkin.privacyShown'
const CACHE_KEY = 'hp.shifts.cache.v1'

const STATUSES: readonly ShiftStatus[] = ['open', 'pending', 'confirmed', 'rejected']

// True once this browser has checked in at a kitchen. The hour log only asks the server for
// shifts when this is true: someone who never uses a kitchen never contacts the server from
// the log, which is what "your hours are saved only on this phone" promises.
export function hasCheckedInHere(): boolean {
  return Boolean(safeGet('local', CHECKIN_ACK_KEY))
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isShift(value: unknown): value is Shift {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return (
    typeof s.id === 'string' &&
    typeof s.kitchenId === 'string' &&
    typeof s.kitchenName === 'string' &&
    isInstant(s.checkIn) &&
    (s.checkOut === null || isInstant(s.checkOut)) &&
    STATUSES.includes(s.status as ShiftStatus) &&
    isNullableString(s.confirmedBy) &&
    isNullableString(s.reason) &&
    typeof s.autoClosed === 'boolean'
  )
}

// Stored text is not trusted: anything that isn't a well-formed shift is dropped.
export function parseShifts(text: string | null): Shift[] {
  if (!text) return []
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value) ? value.filter(isShift) : []
  } catch {
    return []
  }
}

export function cachedShifts(): Shift[] {
  return parseShifts(safeGet('local', CACHE_KEY))
}

export function cacheShifts(shifts: readonly Shift[]): void {
  safeSet('local', CACHE_KEY, JSON.stringify(shifts))
}
