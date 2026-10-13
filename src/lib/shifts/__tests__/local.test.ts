// The phone's own memory of kitchen shifts: whether this browser has ever checked in, and
// a cache of the person's shifts so the hour log can show them before (or without) signal.
import { beforeEach, describe, expect, it } from 'vitest'
import { cacheShifts, cachedShifts, hasCheckedInHere, parseShifts } from '../local'
import type { Shift } from '../types'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size
    },
  }
}

const shift: Shift = {
  id: 's1',
  kitchenId: 'k1',
  kitchenName: 'Community Kitchen',
  checkIn: '2026-10-05T16:00:00.000Z',
  checkOut: '2026-10-05T19:00:00.000Z',
  status: 'confirmed',
  confirmedBy: 'Sam',
  reason: null,
  autoClosed: false,
}

beforeEach(() => {
  globalThis.localStorage = memoryStorage()
})

describe('hasCheckedInHere', () => {
  it('is false until the check-in page has recorded the privacy acknowledgement', () => {
    expect(hasCheckedInHere()).toBe(false)
    localStorage.setItem('hp.checkin.privacyShown', '2026-10-05T16:00:00.000Z')
    expect(hasCheckedInHere()).toBe(true)
  })
})

describe('shift cache', () => {
  it('round-trips shifts', () => {
    cacheShifts([shift])
    expect(cachedShifts()).toEqual([shift])
  })

  it('is empty when nothing was cached', () => {
    expect(cachedShifts()).toEqual([])
  })

  it('drops anything that is not a well-formed shift instead of trusting stored text', () => {
    expect(parseShifts('not json')).toEqual([])
    expect(parseShifts('{"a":1}')).toEqual([])
    expect(parseShifts(JSON.stringify([shift, { id: 's2' }, null, { ...shift, id: 's3', status: 'made-up' }]))).toEqual([shift])
    expect(parseShifts(JSON.stringify([{ ...shift, checkIn: 'yesterday' }]))).toEqual([])
    expect(parseShifts(JSON.stringify([{ ...shift, checkOut: 'later' }]))).toEqual([])
  })

  it('keeps an open shift, whose check-out is null', () => {
    const open: Shift = { ...shift, id: 's4', status: 'open', checkOut: null, confirmedBy: null }
    cacheShifts([open])
    expect(cachedShifts()).toEqual([open])
  })
})
