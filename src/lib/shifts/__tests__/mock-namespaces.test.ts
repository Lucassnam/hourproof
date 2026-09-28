// Mock-only per-test namespaces (Task 4 fix round 1, ruling 3): the mock route keeps one
// in-memory state per `x-hp-mock-ns`, so e2e tests running in parallel can each reset and
// seed their own world without touching anyone else's.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_NAMESPACE,
  MAX_NAMESPACES,
  createMockRegistry,
  handle,
  normalizeNamespace,
  reset,
  stateFor,
} from '../mock-server'
import { ShiftBackendError } from '../types'
import { POST } from '../../../app/api/mock-shifts/route'

const CODE = 'TESTCODE-0000000000000'
const NOW = new Date('2026-09-27T17:00:00Z')

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (err) {
    if (err instanceof ShiftBackendError) return err.code
    throw err
  }
  return 'no error'
}

describe('mock namespaces (state level)', () => {
  it('two namespaces never see each other\'s shifts', () => {
    const registry = createMockRegistry()
    const a = stateFor(registry, 'a')
    const b = stateFor(registry, 'b')
    handle(a, 'checkIn', { code: CODE, displayName: 'Ana' }, 'vol-1', NOW)
    expect(handle(a, 'openShift', {}, 'vol-1', NOW)).not.toBeNull()
    expect(handle(b, 'openShift', {}, 'vol-1', NOW)).toBeNull()
    expect(handle(b, 'myShifts', { sinceDate: '2000-01-01' }, 'vol-1', NOW)).toEqual([])
    // The same volunteer id can check in separately in b: no "already open" leak.
    expect(handle(b, 'checkIn', { code: CODE, displayName: 'Ana' }, 'vol-1', NOW).status).toBe('open')
  })

  it('a PIN lockout in one namespace does not lock the other', () => {
    const registry = createMockRegistry()
    const a = stateFor(registry, 'a')
    const b = stateFor(registry, 'b')
    for (let i = 0; i < 5; i++) {
      expect(codeOf(() => handle(a, 'kitchenShifts', { slug: 'test-kitchen', pin: '000000', day: '2026-09-27' }, undefined, NOW))).toBe('bad_pin')
    }
    expect(codeOf(() => handle(a, 'kitchenShifts', { slug: 'test-kitchen', pin: '123456', day: '2026-09-27' }, undefined, NOW))).toBe('locked')
    expect(handle(b, 'kitchenShifts', { slug: 'test-kitchen', pin: '123456', day: '2026-09-27' }, undefined, NOW)).toEqual([])
  })

  it('reset only clears its own namespace', () => {
    const registry = createMockRegistry()
    handle(stateFor(registry, 'a'), 'checkIn', { code: CODE, displayName: 'Ana' }, 'vol-1', NOW)
    handle(stateFor(registry, 'b'), 'checkIn', { code: CODE, displayName: 'Bo' }, 'vol-2', NOW)
    reset(stateFor(registry, 'a'))
    expect(stateFor(registry, 'a').shifts).toHaveLength(0)
    expect(stateFor(registry, 'b').shifts).toHaveLength(1)
  })

  it('a missing or odd namespace falls back to the default one', () => {
    expect(normalizeNamespace(null)).toBe(DEFAULT_NAMESPACE)
    expect(normalizeNamespace('')).toBe(DEFAULT_NAMESPACE)
    expect(normalizeNamespace('../etc')).toBe(DEFAULT_NAMESPACE)
    expect(normalizeNamespace('x'.repeat(81))).toBe(DEFAULT_NAMESPACE)
    expect(normalizeNamespace('t-abc_123.4')).toBe('t-abc_123.4')
  })

  it('keeps at most MAX_NAMESPACES, dropping the oldest but never the default', () => {
    const registry = createMockRegistry()
    const def = stateFor(registry, DEFAULT_NAMESPACE)
    for (let i = 0; i < MAX_NAMESPACES + 5; i++) stateFor(registry, `n${i}`)
    expect(registry.size).toBeLessThanOrEqual(MAX_NAMESPACES)
    expect(registry.get(DEFAULT_NAMESPACE)).toBe(def)
    expect(registry.has('n0')).toBe(false)
    expect(registry.has(`n${MAX_NAMESPACES + 4}`)).toBe(true)
  })
})

describe('mock namespaces (HTTP route)', () => {
  const saved = process.env.HOURPROOF_MOCK_SHIFTS
  beforeEach(() => {
    process.env.HOURPROOF_MOCK_SHIFTS = '1'
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.HOURPROOF_MOCK_SHIFTS
    else process.env.HOURPROOF_MOCK_SHIFTS = saved
  })

  async function call(ns: string | null, op: string, args: unknown, volunteer = 'vol-http') {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-hp-volunteer': volunteer }
    if (ns) headers['x-hp-mock-ns'] = ns
    const res = await POST(new Request('http://localhost/api/mock-shifts', { method: 'POST', headers, body: JSON.stringify({ op, args }) }))
    return (await res.json()) as { result?: unknown; error?: string; ok?: boolean }
  }

  it('routes each x-hp-mock-ns to its own state, and reset stays inside it', async () => {
    const nsA = `route-a-${Math.random()}`.replace('0.', '')
    const nsB = `route-b-${Math.random()}`.replace('0.', '')
    await call(nsA, 'reset', { seedSecondKitchen: true })
    await call(nsB, 'reset', {})
    expect((await call(nsA, 'checkIn', { code: CODE, displayName: 'Ana' })).result).toMatchObject({ status: 'open' })
    expect((await call(nsB, 'openShift', {})).result).toBeNull()
    // The second kitchen was seeded only in A.
    expect((await call(nsA, 'kitchenByCode', { code: 'TESTCODE2-00000000000' })).result).not.toBeNull()
    expect((await call(nsB, 'kitchenByCode', { code: 'TESTCODE2-00000000000' })).result).toBeNull()
    // Resetting B leaves A's open shift alone.
    await call(nsB, 'reset', {})
    expect((await call(nsA, 'openShift', {})).result).toMatchObject({ status: 'open' })
  })
})
