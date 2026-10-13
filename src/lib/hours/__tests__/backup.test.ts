// A copy of the hour log the person can keep somewhere else and put back. The hours exist
// only on the phone, so this is the only protection against a lost phone or cleared storage.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import { backupFileName, makeBackup, parseBackup, restoreBackup } from '../backup'
import { closeAllStoresForTests, openStore } from '../store'
import type { Entry } from '../types'

beforeEach(async () => {
  await closeAllStoresForTests()
  globalThis.indexedDB = new IDBFactory()
})

const entry = (id: string, over: Partial<Entry> = {}): Entry => ({
  id,
  date: '2026-10-05',
  type: 'work',
  hours: 4,
  createdAt: '2026-10-05T18:00:00.000Z',
  ...over,
})
const now = new Date('2026-10-13T19:00:00.000Z')

describe('makeBackup', () => {
  test('holds the self-logged entries and says what it is', () => {
    const backup = makeBackup([entry('a'), entry('b', { type: 'volunteer', place: 'Food Bank', note: 'Tuesdays' })], now)
    expect(backup).toEqual({
      format: 'hourproof-hours',
      version: 1,
      exportedAt: '2026-10-13T19:00:00.000Z',
      entries: [entry('a'), entry('b', { type: 'volunteer', place: 'Food Bank', note: 'Tuesdays' })],
    })
  })

  test('leaves kitchen shifts out: they are the kitchen’s record, not the person’s to restore', () => {
    const shift = entry('shift-s1', { type: 'volunteer', source: 'shift', verification: 'confirmed', shiftId: 's1', confirmedBy: 'Sam' })
    expect(makeBackup([entry('a'), shift], now).entries).toEqual([entry('a')])
  })

  test('names the file by date', () => {
    expect(backupFileName('2026-10-13')).toBe('hourproof-hours-2026-10-13.json')
  })
})

describe('parseBackup', () => {
  test('reads back what makeBackup wrote', () => {
    const entries = [entry('a'), entry('b', { type: 'job_search', inProgram: true, hours: 1.5 })]
    expect(parseBackup(JSON.stringify(makeBackup(entries, now)))).toEqual({ ok: true, entries, skipped: 0 })
  })

  test('refuses anything that is not a copy of HourProof hours', () => {
    for (const text of ['', 'hello', '[]', '{"entries":[]}', '{"format":"something-else","version":1,"entries":[]}']) {
      expect(parseBackup(text)).toEqual({ ok: false, error: 'not_a_backup' })
    }
  })

  test('refuses a copy from a newer version instead of guessing at it', () => {
    expect(parseBackup(JSON.stringify({ format: 'hourproof-hours', version: 2, entries: [] }))).toEqual({ ok: false, error: 'newer_version' })
  })

  test('skips entries that are malformed, and never lets one claim to be a verified kitchen shift', () => {
    const forged = { ...entry('x'), source: 'shift', verification: 'confirmed', confirmedBy: 'Sam' }
    const text = JSON.stringify({
      format: 'hourproof-hours',
      version: 1,
      exportedAt: now.toISOString(),
      entries: [entry('a'), { id: 'b' }, { ...entry('c'), type: 'napping' }, { ...entry('d'), hours: '4' }, null, forged, { ...entry('e'), date: '10/05/2026' }],
    })
    const parsed = parseBackup(text)
    expect(parsed).toEqual({ ok: true, entries: [entry('a'), entry('x')], skipped: 5 })
  })
})

describe('restoreBackup', () => {
  test('adds the entries that are missing and leaves the ones already here untouched', async () => {
    const store = await openStore('real')
    await store.put(entry('a', { hours: 6 })) // edited on this phone since the copy was made
    const result = await restoreBackup(store, [entry('a', { hours: 4 }), entry('b', { date: '2026-10-06' })])
    expect(result).toEqual({ added: 1, alreadyHere: 1, failed: 0 })
    expect((await store.get('a'))?.hours).toBe(6)
    expect((await store.get('b'))?.date).toBe('2026-10-06')
  })

  test('an entry the log would not accept is counted as failed, and the rest still go in', async () => {
    const store = await openStore('real')
    await store.put(entry('full', { hours: 22 }))
    const result = await restoreBackup(store, [entry('too-much', { hours: 4 }), entry('fine', { date: '2026-10-07' })])
    expect(result).toEqual({ added: 1, alreadyHere: 0, failed: 1 })
    expect(await store.get('too-much')).toBeUndefined()
  })
})
