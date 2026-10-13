// Client-only IndexedDB store for proof files (photos and PDFs of pay stubs, signed CF 888s,
// program records). Like the hour log, files never leave the device: there is no network
// code path here, so import it only from client components.
//
// Real and demo files live in separate databases, mirroring @/lib/hours/store, so "Try the
// demo" can never mix sample uploads into a person's own proof or delete it.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Mode } from '@/lib/hours/store'
import type { ActivityType } from '@/lib/hours/types'

export type ProofFile = {
  id: string
  month: string /* YYYY-MM */
  type: ActivityType
  name: string
  mime: string
  size: number
  addedAt: string /* ISO */
  // The file's contents. Bytes, not the File: WebKit refuses to store a File or Blob in
  // IndexedDB in a private-style session (the write errors), and accepts an ArrayBuffer.
  bytes: ArrayBuffer
  // Only on files saved before 2026-10-13, which were stored as the File itself.
  blob?: Blob
}

// The file as a Blob, for opening it. Made on demand from the stored bytes.
export function fileBlob(file: ProofFile): Blob {
  return file.blob ?? new Blob([file.bytes], { type: file.mime })
}

interface ProofDB extends DBSchema {
  files: {
    key: string
    value: ProofFile
    indexes: { month: string }
  }
}

const STORE_NAME = 'files'
const MONTH_INDEX = 'month'

export const ACCEPTED_MIME = /^(image\/.+|application\/pdf)$/
// A phone photo is a few MB; this stops a stray video from filling the phone's storage.
export const MAX_FILE_BYTES = 20 * 1024 * 1024

export type AddError = 'bad_type' | 'too_big'

export function checkFile(file: Pick<File, 'type' | 'size'>): AddError | null {
  if (!ACCEPTED_MIME.test(file.type)) return 'bad_type'
  if (file.size > MAX_FILE_BYTES) return 'too_big'
  return null
}

function dbNameFor(mode: Mode): string {
  return mode === 'demo' ? 'hourproof-proof-demo' : 'hourproof-proof'
}

const connections = new Map<string, Promise<IDBPDatabase<ProofDB>>>()

function getDb(mode: Mode): Promise<IDBPDatabase<ProofDB>> {
  const name = dbNameFor(mode)
  const cached = connections.get(name)
  if (cached) return cached
  // Same rules as the hour store: don't keep a failed open cached, and step aside for a
  // future version upgrade from another tab.
  const connection: Promise<IDBPDatabase<ProofDB>> = openDB<ProofDB>(name, 1, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) db.createObjectStore(STORE_NAME, { keyPath: 'id' }).createIndex(MONTH_INDEX, 'month')
    },
    blocking() {
      connections.delete(name)
      void connection.then((db) => db.close())
    },
    terminated() {
      connections.delete(name)
    },
  }).catch((error: unknown) => {
    if (connections.get(name) === connection) connections.delete(name)
    throw error
  })
  connections.set(name, connection)
  return connection
}

export interface ProofStore {
  // Oldest first, so a list doesn't reshuffle as files are added.
  list(month: string): Promise<ProofFile[]>
  add(file: File, month: string, type: ActivityType, now?: Date): Promise<ProofFile>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

export async function openProofStore(mode: Mode): Promise<ProofStore> {
  const db = await getDb(mode)
  return {
    async list(month) {
      const files = await db.getAllFromIndex(STORE_NAME, MONTH_INDEX, month)
      return files.sort((a, b) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0))
    },
    async add(file, month, type, now = new Date()) {
      const error = checkFile(file)
      if (error) throw new ProofFileError(error)
      const record: ProofFile = {
        id: crypto.randomUUID(),
        month,
        type,
        name: file.name,
        mime: file.type,
        size: file.size,
        addedAt: now.toISOString(),
        bytes: await file.arrayBuffer(),
      }
      await db.put(STORE_NAME, record)
      return record
    },
    async remove(id) {
      await db.delete(STORE_NAME, id)
    },
    async clear() {
      await db.clear(STORE_NAME)
    },
  }
}

export class ProofFileError extends Error {
  code: AddError

  constructor(code: AddError) {
    super(`Proof file rejected: ${code}`)
    this.name = 'ProofFileError'
    this.code = code
  }
}

// Test-only, like closeAllStoresForTests in the hour store.
export async function closeProofStoresForTests(): Promise<void> {
  const cached = Array.from(connections.values())
  connections.clear()
  for (const connection of cached) (await connection).close()
}
