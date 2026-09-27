// Client-only IndexedDB entry store. Hours never leave the device: this
// module talks to IndexedDB directly and has no server/network code path, so
// it must only ever be imported from client components ('use client').
//
// Two completely separate databases back the two modes: 'hourproof' for a
// person's real hours, and 'hourproof-demo' for "Try the demo". They share
// this module's code but never share data — startDemo/exitDemo only ever
// touch the demo database, and switching modes is just a flag in
// sessionStorage (see getMode/setMode), never a data migration.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { monthOf } from '@/lib/dates'
import { safeGet, safeSet } from '@/lib/storage/safe'
import { demoEntries } from './demo'
import { validateEntry } from './summarize'
import type { Entry, EntryError } from './types'

export type Mode = 'real' | 'demo'

export class EntryValidationError extends Error {
  codes: EntryError[]

  constructor(codes: EntryError[]) {
    super(`Invalid entry: ${codes.join(', ')}`)
    this.name = 'EntryValidationError'
    this.codes = codes
  }
}

export interface EntryStore {
  // Sorted by date desc, then createdAt desc.
  list(month?: string): Promise<Entry[]>
  get(id: string): Promise<Entry | undefined>
  // Validates with validateEntry against that day's other entries (excluding
  // this entry's own previous version, if any). Throws EntryValidationError
  // and writes nothing if invalid.
  put(entry: Entry): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

interface HourProofDB extends DBSchema {
  entries: {
    key: string
    value: Entry
    indexes: { date: string }
  }
}

const STORE_NAME = 'entries'
const DATE_INDEX = 'date'

function dbNameFor(mode: Mode): string {
  return mode === 'demo' ? 'hourproof-demo' : 'hourproof'
}

// A fresh connection per openStore() call, rather than a cached singleton:
// idb/IndexedDB connections are cheap and this keeps mode-switching (and
// tests that reset IndexedDB between cases) simple and correct, with no
// stale-connection cache to invalidate.
function getDb(mode: Mode): Promise<IDBPDatabase<HourProofDB>> {
  const name = dbNameFor(mode)
  return openDB<HourProofDB>(name, 1, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      store.createIndex(DATE_INDEX, 'date')
    },
  })
}

function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return a.createdAt < b.createdAt ? 1 : -1
  })
}

export async function openStore(mode: Mode): Promise<EntryStore> {
  const db = await getDb(mode)

  return {
    async list(month) {
      const all = await db.getAll(STORE_NAME)
      const filtered = month ? all.filter((entry) => monthOf(entry.date) === month) : all
      return sortEntries(filtered)
    },

    async get(id) {
      return db.get(STORE_NAME, id)
    },

    async put(entry) {
      const sameDay = await db.getAllFromIndex(STORE_NAME, DATE_INDEX, entry.date)
      const sameDayOthers = sameDay.filter((other) => other.id !== entry.id)
      const errors = validateEntry(entry, sameDayOthers)
      if (errors.length > 0) {
        throw new EntryValidationError(errors)
      }
      await db.put(STORE_NAME, entry)
    },

    async remove(id) {
      await db.delete(STORE_NAME, id)
    },

    async clear() {
      await db.clear(STORE_NAME)
    },
  }
}

const MODE_KEY = 'hp.mode'

export function getMode(): Mode {
  return safeGet('session', MODE_KEY) === 'demo' ? 'demo' : 'real'
}

export function setMode(mode: Mode): void {
  safeSet('session', MODE_KEY, mode)
}

export { demoEntries }

export async function startDemo(today: string): Promise<void> {
  const store = await openStore('demo')
  await store.clear()
  for (const entry of demoEntries(today)) {
    await store.put(entry)
  }
  setMode('demo')
}

export async function exitDemo(): Promise<void> {
  const store = await openStore('demo')
  await store.clear()
  setMode('real')
}
