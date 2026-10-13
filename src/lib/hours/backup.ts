// A copy of the hour log as a file, and putting one back. Hours live only in IndexedDB on
// the phone (store.ts), so a lost phone or cleared browser storage loses them; Safari can
// also clear a website's storage on its own after a week without a visit. The copy is a
// plain JSON file the person keeps wherever they like. Nothing here touches the network.
//
// Only self-logged entries are in a copy. Kitchen shifts are the kitchen's record and come
// back from the server; proof photos are not included (they would make the file huge).
//
// A copy is treated as untrusted text when read back: every entry is rebuilt field by field,
// so a hand-edited file can't smuggle in a "verified by a kitchen" entry or an unknown type.

import { EntryValidationError, type EntryStore } from './store'
import { ACTIVITY_TYPES, type ActivityType, type Entry } from './types'

const FORMAT = 'hourproof-hours'
const VERSION = 1
const MAX_TEXT = 500

export type Backup = { format: typeof FORMAT; version: typeof VERSION; exportedAt: string; entries: Entry[] }

function isSelfLogged(entry: Entry): boolean {
  return (entry.source ?? 'self') === 'self'
}

export function makeBackup(entries: readonly Entry[], now: Date): Backup {
  return { format: FORMAT, version: VERSION, exportedAt: now.toISOString(), entries: entries.filter(isSelfLogged) }
}

// "hourproof-hours-2026-10-13.json"
export function backupFileName(today: string): string {
  return `${FORMAT}-${today}.json`
}

// Rebuilds one entry from unknown data, keeping only the fields a self-logged entry has.
// Returns null for anything that isn't one. Whether the hours are sensible (quarter hours,
// at most 24 in a day) is the store's job when the entry is put back.
function readEntry(value: unknown): Entry | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || v.id.length === 0 || v.id.length > 100) return null
  if (typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return null
  if (!ACTIVITY_TYPES.includes(v.type as ActivityType)) return null
  if (typeof v.hours !== 'number' || !Number.isFinite(v.hours)) return null
  if (typeof v.createdAt !== 'string' || Number.isNaN(Date.parse(v.createdAt))) return null
  const entry: Entry = { id: v.id, date: v.date, type: v.type as ActivityType, hours: v.hours, createdAt: v.createdAt }
  if (v.inProgram === true) entry.inProgram = true
  if (typeof v.place === 'string' && v.place) entry.place = v.place.slice(0, MAX_TEXT)
  if (typeof v.note === 'string' && v.note) entry.note = v.note.slice(0, MAX_TEXT)
  return entry
}

export type ParsedBackup =
  | { ok: true; entries: Entry[]; skipped: number }
  | { ok: false; error: 'not_a_backup' | 'newer_version' }

export function parseBackup(text: string): ParsedBackup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'not_a_backup' }
  }
  if (typeof data !== 'object' || data === null) return { ok: false, error: 'not_a_backup' }
  const d = data as Record<string, unknown>
  if (d.format !== FORMAT || typeof d.version !== 'number' || !Array.isArray(d.entries)) return { ok: false, error: 'not_a_backup' }
  if (d.version > VERSION) return { ok: false, error: 'newer_version' }
  const entries: Entry[] = []
  for (const raw of d.entries) {
    const entry = readEntry(raw)
    if (entry) entries.push(entry)
  }
  return { ok: true, entries, skipped: d.entries.length - entries.length }
}

export type RestoreResult = { added: number; alreadyHere: number; failed: number }

// Adds the entries this phone doesn't have. An entry that is already here is left as it is:
// it may have been edited since the copy was made, and the copy must never undo that.
export async function restoreBackup(store: EntryStore, entries: readonly Entry[]): Promise<RestoreResult> {
  const result: RestoreResult = { added: 0, alreadyHere: 0, failed: 0 }
  for (const entry of entries) {
    if (await store.get(entry.id)) {
      result.alreadyHere += 1
      continue
    }
    try {
      await store.put(entry)
      result.added += 1
    } catch (error) {
      if (!(error instanceof EntryValidationError)) throw error
      result.failed += 1
    }
  }
  return result
}
