import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  EntryValidationError,
  demoEntries,
  exitDemo,
  getMode,
  openStore,
  setMode,
  startDemo,
} from '../store'
import { summarizeMonth, validateEntry } from '../summarize'
import type { Entry } from '../types'
import { monthOf } from '@/lib/dates'

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

beforeEach(() => {
  // fake-indexeddb keeps state per-database-name across tests in the same
  // module unless reset; give every test a clean slate.
  indexedDB = new IDBFactory()
  globalThis.sessionStorage = new MemorySessionStorage()
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
    // Includes community-kitchen volunteering and warehouse work.
    expect(entries.some((e) => e.type === 'volunteer' && e.place === 'Community kitchen')).toBe(true)
    expect(entries.some((e) => e.type === 'work' && e.place === 'Warehouse')).toBe(true)

    const summary = summarizeMonth(entries, '2026-10', today)
    expect(summary.status).toBe('behind')

    // Roughly 65% of the prorated target through day 20 (80 * 20/31 ≈ 51.6).
    const proratedTarget = (80 * 20) / 31
    expect(summary.counted).toBeGreaterThan(proratedTarget * 0.5)
    expect(summary.counted).toBeLessThan(proratedTarget * 0.8)
  })

  test('2026-10-02: includes previous-month (September) entries', () => {
    const entries = demoEntries('2026-10-02')
    const septemberEntries = entries.filter((e) => monthOf(e.date) === '2026-09')
    expect(septemberEntries.length).toBeGreaterThan(0)

    const octoberEntries = entries.filter((e) => monthOf(e.date) === '2026-10')
    for (const e of octoberEntries) {
      expect(e.date <= '2026-10-02').toBe(true)
    }

    // Deterministic: calling it again produces the exact same entries.
    expect(demoEntries('2026-10-02')).toEqual(entries)
  })
})
