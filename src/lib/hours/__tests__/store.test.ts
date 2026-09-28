import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  EntryValidationError,
  closeAllStoresForTests,
  demoEntries,
  exitDemo,
  getMode,
  openStore,
  setMode,
  startDemo,
  upgradeSchema,
} from '../store'
import { summarizeMonth, validateEntry } from '../summarize'
import type { Entry } from '../types'
import { addMonths, daysInMonth, monthOf } from '@/lib/dates'
import { DEMO_PREVIOUS_MONTH_TOTAL, demoGoal } from '../demo'

// vitest's default environment is Node, which has no sessionStorage. safe.ts
// reads globalThis.sessionStorage, so give it a minimal in-memory stand-in
// (real browsers provide the real thing; this is just enough for getMode /
// setMode to round-trip in tests).
class MemorySessionStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null
  }
  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}

let n = 0
const entry = (date: string, type: Entry['type'], hours: number, over: Partial<Entry> = {}): Entry => ({
  id: `e${n++}`,
  date,
  type,
  hours,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...over,
})

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

beforeEach(() => {
  // fake-indexeddb keeps state per-database-name across tests in the same
  // module unless reset; give every test a clean slate.
  indexedDB = new IDBFactory()
  globalThis.sessionStorage = new MemorySessionStorage()
})

afterEach(async () => {
  // store.ts now caches one connection per database name across calls, so a
  // stale cached connection (bound to a previous test's IDBFactory
  // instance) must be closed and dropped before the next test's beforeEach
  // swaps in a fresh IndexedDB — otherwise openStore() in the next test
  // would silently hand back a connection to the wrong (old) database.
  await closeAllStoresForTests()
  await deleteDatabase('hourproof')
  await deleteDatabase('hourproof-demo')
})

describe('openStore', () => {
  test('put then list(month) returns only that month, sorted by date desc then createdAt desc', async () => {
    const store = await openStore('real')
    await store.put(entry('2026-10-05', 'work', 4, { id: 'a', createdAt: '2026-10-01T00:00:00.000Z' }))
    await store.put(entry('2026-10-05', 'work', 2, { id: 'b', createdAt: '2026-10-02T00:00:00.000Z' }))
    await store.put(entry('2026-10-03', 'work', 3, { id: 'c' }))
    await store.put(entry('2026-11-01', 'work', 5, { id: 'd' }))

    const october = await store.list('2026-10')
    expect(october.map((e) => e.id)).toEqual(['b', 'a', 'c'])

    const all = await store.list()
    expect(all).toHaveLength(4)
  })

  test('put rejects an invalid entry with EntryValidationError codes, and nothing is written', async () => {
    const store = await openStore('real')
    const bad = entry('2026-10-05', 'work', 30) // over 24h/day on its own

    await expect(store.put(bad)).rejects.toBeInstanceOf(EntryValidationError)
    try {
      await store.put(bad)
    } catch (err) {
      expect(err).toBeInstanceOf(EntryValidationError)
      expect((err as EntryValidationError).codes).toContain('bad_hours')
    }

    expect(await store.get(bad.id)).toBeUndefined()
    expect(await store.list()).toHaveLength(0)
  })

  test('put rejects when the same-day total would exceed 24 hours, reading same-day entries itself', async () => {
    const store = await openStore('real')
    await store.put(entry('2026-10-05', 'work', 20, { id: 'a' }))

    const second = entry('2026-10-05', 'work', 5, { id: 'b' })
    await expect(store.put(second)).rejects.toBeInstanceOf(EntryValidationError)
    try {
      await store.put(second)
    } catch (err) {
      expect((err as EntryValidationError).codes).toContain('too_many_hours_that_day')
    }
    expect(await store.get('b')).toBeUndefined()
  })

  test('an edit (put with the same id) replaces the entry and excludes its own old hours from the same-day check', async () => {
    const store = await openStore('real')
    await store.put(entry('2026-10-05', 'work', 20, { id: 'a' }))

    // Editing 'a' up to 23 hours on the same day should not double-count its
    // own previous 20 hours against the new total.
    await store.put(entry('2026-10-05', 'work', 23, { id: 'a' }))

    const stored = await store.get('a')
    expect(stored?.hours).toBe(23)
    expect(await store.list('2026-10')).toHaveLength(1)
  })

  test('two concurrent same-day puts that together exceed 24h: exactly one succeeds', async () => {
    const store = await openStore('real')
    const a = entry('2026-10-05', 'work', 15, { id: 'a' })
    const b = entry('2026-10-05', 'work', 15, { id: 'b' })

    const results = await Promise.allSettled([store.put(a), store.put(b)])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(EntryValidationError)
    expect(((rejected[0] as PromiseRejectedResult).reason as EntryValidationError).codes).toContain(
      'too_many_hours_that_day',
    )

    // Exactly one of the two entries actually made it into the store.
    const stored = await store.list('2026-10')
    expect(stored).toHaveLength(1)
  })

  test('remove, then get is undefined', async () => {
    const store = await openStore('real')
    await store.put(entry('2026-10-05', 'work', 4, { id: 'a' }))
    expect(await store.get('a')).toBeDefined()

    await store.remove('a')
    expect(await store.get('a')).toBeUndefined()
  })
})

describe('mode + demo isolation', () => {
  test('getMode defaults to real, setMode switches it', () => {
    expect(getMode()).toBe('real')
    setMode('demo')
    expect(getMode()).toBe('demo')
    setMode('real')
    expect(getMode()).toBe('real')
  })

  test('real and demo databases never share data (real started non-empty)', async () => {
    const real = await openStore('real')
    await real.put(entry('2026-10-05', 'work', 4, { id: 'real-1' }))

    await startDemo('2026-10-20')
    expect(getMode()).toBe('demo')

    const demo = await openStore('demo')
    const demoAll = await demo.list()
    expect(demoAll.length).toBeGreaterThan(0)
    expect(demoAll.every((e) => e.id.startsWith('demo-'))).toBe(true)

    // Real data is untouched by starting the demo.
    const realAfter = await openStore('real')
    expect(await realAfter.list()).toHaveLength(1)
    expect(await realAfter.get('real-1')).toBeDefined()

    await exitDemo()
    expect(getMode()).toBe('real')
    const demoAfterExit = await openStore('demo')
    expect(await demoAfterExit.list()).toHaveLength(0)

    // Real data is still untouched after exiting the demo.
    const realAfterExit = await openStore('real')
    expect(await realAfterExit.list()).toHaveLength(1)
  })

  test('isolation also holds when real started empty', async () => {
    const real = await openStore('real')
    expect(await real.list()).toHaveLength(0)

    await startDemo('2026-10-20')
    const demo = await openStore('demo')
    expect((await demo.list()).length).toBeGreaterThan(0)

    await exitDemo()
    expect(await (await openStore('demo')).list()).toHaveLength(0)
    expect(await (await openStore('real')).list()).toHaveLength(0)
  })
})

describe('demoEntries', () => {
  test('2026-10-20: valid, all in October on or before the 20th, and status is behind', () => {
    const today = '2026-10-20'
    const entries = demoEntries(today)
    expect(entries.length).toBeGreaterThan(0)

    for (const e of entries) {
      const others = entries.filter((o) => o.id !== e.id && o.date === e.date)
      expect(validateEntry(e, others)).toEqual([])
      expect(monthOf(e.date)).toBe('2026-10')
      expect(e.date <= today).toBe(true)
    }

    // Includes at least one job-search entry outside a program, so the flag shows.
    expect(entries.some((e) => e.type === 'job_search' && !e.inProgram)).toBe(true)
    // Paid work and volunteering, and no seeded place names (they'd be English-only text on
    // the Spanish screens).
    expect(entries.some((e) => e.type === 'volunteer')).toBe(true)
    expect(entries.some((e) => e.type === 'work')).toBe(true)
    expect(entries.every((e) => e.place === undefined)).toBe(true)

    // Achievable: counted = floor-quarter(clamp(80 - 3.5 * 11 days left, 10, 76)) = 41.5,
    // so about 3.5 hours a day to go (not a hopeless 12-hours-a-day demo).
    const summary = summarizeMonth(entries, '2026-10', today)
    expect(summary.status).toBe('behind')
    expect(summary.counted).toBe(41.5)
    expect(summary.neededPerDay).not.toBeNull()
    expect(summary.neededPerDay!).toBeLessThanOrEqual(4.5)
  })

  test('2026-09-26: behind, with about 3.5 hours a day to go', () => {
    const today = '2026-09-26'
    const summary = summarizeMonth(demoEntries(today), '2026-09', today)
    expect(summary.status).toBe('behind')
    expect(summary.counted).toBe(66)
    expect(summary.neededPerDay).toBeCloseTo(3.5)
  })

  test('every day of several months: valid entries, counted hits the goal, behind, and at most 4.5 hours a day', () => {
    for (const month of ['2026-02', '2026-09', '2026-10', '2028-02']) {
      for (let day = 1; day <= daysInMonth(month); day++) {
        const today = `${month}-${String(day).padStart(2, '0')}`
        const entries = demoEntries(today)
        for (const e of entries) {
          const others = entries.filter((o) => o.id !== e.id && o.date === e.date)
          expect(validateEntry(e, others), `${today} ${e.id}`).toEqual([])
          expect(e.date <= today).toBe(true)
        }
        const summary = summarizeMonth(entries, month, today)
        expect(summary.counted, today).toBe(demoGoal(month, day))
        expect(summary.status, today).toBe('behind')
        if (summary.neededPerDay !== null) expect(summary.neededPerDay, today).toBeLessThanOrEqual(4.5)
        if (day <= 3) {
          const prev = addMonths(month, -1)
          expect(summarizeMonth(entries, prev, today).status, `${today} previous month`).toBe('met')
        }
        expect(summary.flags, today).toContain('job_search_outside_program')
      }
    }
  })

  test('2026-10-02: includes previous-month (September) entries', () => {
    const entries = demoEntries('2026-10-02')
    const septemberEntries = entries.filter((e) => monthOf(e.date) === '2026-09')
    expect(septemberEntries.length).toBeGreaterThan(0)

    const octoberEntries = entries.filter((e) => monthOf(e.date) === '2026-10')
    for (const e of octoberEntries) {
      expect(e.date <= '2026-10-02').toBe(true)
    }

    // The previous month is over and shown as met (82.5 hours), never a failed month.
    const september = summarizeMonth(entries, '2026-09', '2026-10-02')
    expect(september.status).toBe('met')
    expect(september.counted).toBe(DEMO_PREVIOUS_MONTH_TOTAL)
    expect(september.counted).toBeGreaterThanOrEqual(80)
    for (const e of septemberEntries) {
      const others = entries.filter((o) => o.id !== e.id && o.date === e.date)
      expect(validateEntry(e, others)).toEqual([])
    }

    // Deterministic: calling it again produces the exact same entries.
    expect(demoEntries('2026-10-02')).toEqual(entries)
  })

  test('2026-10-01: the job-search-day fallback still lands on a valid, in-range day', () => {
    const today = '2026-10-01'
    const entries = demoEntries(today)

    const octoberEntries = entries.filter((e) => monthOf(e.date) === '2026-10')
    expect(octoberEntries.length).toBeGreaterThan(0)
    for (const e of octoberEntries) {
      expect(e.date).toBe('2026-10-01')
      const others = entries.filter((o) => o.id !== e.id && o.date === e.date)
      expect(validateEntry(e, others)).toEqual([])
    }
    expect(octoberEntries.some((e) => e.type === 'job_search' && !e.inProgram)).toBe(true)

    // day-of-month 1 is within the first three days, so September is seeded too.
    expect(entries.some((e) => monthOf(e.date) === '2026-09')).toBe(true)
  })
})

describe('schema upgrade (M9)', () => {
  function fakeDb() {
    const createIndex = vi.fn()
    const createObjectStore = vi.fn(() => ({ createIndex }))
    return { db: { createObjectStore } as unknown as Parameters<typeof upgradeSchema>[0], createObjectStore, createIndex }
  }

  test('a brand-new database (oldVersion 0) gets the entries store and its date index', () => {
    const { db, createObjectStore, createIndex } = fakeDb()
    upgradeSchema(db, 0)
    expect(createObjectStore).toHaveBeenCalledWith('entries', { keyPath: 'id' })
    expect(createIndex).toHaveBeenCalledWith('date', 'date')
  })

  test('a database already at version 1 is not given the store again (a future v2 upgrade must not throw)', () => {
    const { db, createObjectStore } = fakeDb()
    upgradeSchema(db, 1)
    expect(createObjectStore).not.toHaveBeenCalled()
  })
})

describe('a failed open is not cached (M10)', () => {
  function openRaw(name: string, version: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version)
      req.onsuccess = () => {
        req.result.close()
        resolve()
      }
      req.onerror = () => reject(req.error)
    })
  }

  test('after an open fails, the next openStore() tries again instead of returning the same rejection', async () => {
    // A newer database than this code knows (version 2) makes openDB(name, 1) fail with a VersionError.
    await openRaw('hourproof', 2)
    await expect(openStore('real')).rejects.toThrow()

    // The obstacle goes away (here: the database is deleted); the next call must reopen.
    await deleteDatabase('hourproof')
    const store = await openStore('real')
    await store.put(entry('2026-10-02', 'work', 3))
    expect(await store.list()).toHaveLength(1)
  })
})
