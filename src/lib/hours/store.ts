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
import { closeProofStoresForTests, openProofStore } from '@/lib/proof/files'
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

// One connection per database name, cached and reused across openStore()
// calls (opening a fresh connection every call leaked connections and would
// have blocked a later version upgrade, since IndexedDB won't run an
// upgrade transaction while any old connection to the same database is
// still open).
const dbConnections = new Map<string, Promise<IDBPDatabase<HourProofDB>>>()

// Each step runs only for databases older than that step's version, so a later version
// (e.g. 2 adding an index) can add its own `if (oldVersion < 2)` step without re-creating
// the entries store, which would throw on every existing phone. Exported for tests.
export function upgradeSchema(db: Pick<IDBPDatabase<HourProofDB>, 'createObjectStore'>, oldVersion: number): void {
  if (oldVersion < 1) {
    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
    store.createIndex(DATE_INDEX, 'date')
  }
}

function openConnection(name: string): Promise<IDBPDatabase<HourProofDB>> {
  return openDB<HourProofDB>(name, 1, {
    upgrade(db, oldVersion) {
      upgradeSchema(db, oldVersion)
    },
    // Fires on this connection when another tab/connection is waiting to
    // open a newer version. Close this one and drop it from the cache so a
    // future upgrade isn't blocked and the next call reopens fresh.
    blocking() {
      const cached = dbConnections.get(name)
      dbConnections.delete(name)
      void cached?.then((db) => db.close())
    },
    // Fires if the connection is closed unexpectedly (e.g. the browser
    // reclaiming it). Drop the stale entry so the next call reopens.
    terminated() {
      dbConnections.delete(name)
    },
  })
}

function getDb(mode: Mode): Promise<IDBPDatabase<HourProofDB>> {
  const name = dbNameFor(mode)
  const cached = dbConnections.get(name)
  if (cached) return cached
  // A failed open (a blocked or newer database, storage turned off, a private window) must
  // not stay cached, or every later openStore() would get the same old rejection even
  // after the problem is gone. Drop it (only if it's still the cached one) and rethrow.
  const connection: Promise<IDBPDatabase<HourProofDB>> = openConnection(name).catch((error: unknown) => {
    if (dbConnections.get(name) === connection) dbConnections.delete(name)
    throw error
  })
  dbConnections.set(name, connection)
  return connection
}

// Test-only: closes every cached connection and clears the cache, so tests
// that reset IndexedDB between cases (fake-indexeddb) don't hand out a
// connection bound to a database instance from a previous test.
export async function closeAllStoresForTests(): Promise<void> {
  const cached = Array.from(dbConnections.values())
  dbConnections.clear()
  for (const connection of cached) {
    const db = await connection
    db.close()
  }
  await closeProofStoresForTests()
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
      // Read the same-day entries, validate, and write in one readwrite
      // transaction so two concurrent put()s for the same day can't each
      // read a total that's fine on its own but exceeds 24h together:
      // IndexedDB serializes readwrite transactions on the same store, so
      // the second call's read only starts once the first call's write (if
      // any) has already committed.
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const sameDay = await tx.store.index(DATE_INDEX).getAll(entry.date)
      const sameDayOthers = sameDay.filter((other) => other.id !== entry.id)
      const errors = validateEntry(entry, sameDayOthers)
      if (errors.length > 0) {
        tx.abort()
        try {
          await tx.done
        } catch {
          // tx.done rejects when the transaction is aborted; that's expected here.
        }
        throw new EntryValidationError(errors)
      }
      await tx.store.put(entry)
      await tx.done
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
  await (await openProofStore('demo')).clear()
  for (const entry of demoEntries(today)) {
    await store.put(entry)
  }
  setMode('demo')
}

export async function exitDemo(): Promise<void> {
  const store = await openStore('demo')
  await store.clear()
  // The demo's sample uploads go with it (only the demo database, never real proof). A
  // failure here must not keep the person stuck in demo mode; startDemo clears them anyway.
  try {
    await (await openProofStore('demo')).clear()
  } catch {
    // Left for the next startDemo to clear.
  }
  setMode('real')
}
