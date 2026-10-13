// The browser-side ShiftBackend that talks to src/app/api/mock-shifts/route.ts,
// which runs the same in-memory state machine as src/lib/shifts/mock-server.ts's
// contract tests. Used when getShiftBackend() (src/lib/shifts/backend.ts) picks
// 'mock' — no Supabase project needed for the UI or e2e.
import { safeGet, safeSet } from '@/lib/storage/safe'
import type { MockArgs, MockOp, MockResult } from './mock-server'
import {
  ShiftBackendError,
  type BackendErrorCode,
  type KitchenInfo,
  type KitchenShift,
  type Shift,
  type ShiftBackend,
} from './types'

const VOLUNTEER_ID_KEY = 'hp.shifts.mockVolunteerId'
const ENDPOINT = '/api/mock-shifts'

const BACKEND_ERROR_CODES = new Set<BackendErrorCode>([
  'not_found',
  'already_open_elsewhere',
  'not_checked_in',
  'bad_pin',
  'locked',
  'needs_correction',
  'bad_name',
  'unavailable',
  'network',
])

function isBackendErrorCode(v: unknown): v is BackendErrorCode {
  return typeof v === 'string' && BACKEND_ERROR_CODES.has(v as BackendErrorCode)
}

// Per ruling 6: a random id kept in localStorage, standing in for the
// Supabase anonymous-auth uid, sent as x-hp-volunteer. Generated once per
// browser and reused for every mock call so "my shifts" stays consistent.
function volunteerId(): string {
  const existing = safeGet('local', VOLUNTEER_ID_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  safeSet('local', VOLUNTEER_ID_KEY, id)
  return id
}

// Task 4 fix round 1, ruling 3: the mock route keeps one world per namespace. e2e puts a
// per-test value in localStorage (page.addInitScript) so parallel tests stay apart;
// everyone else shares 'default'. The route ignores anything it doesn't recognize.
const NAMESPACE_KEY = 'hp.shifts.mockNs'
function mockNamespace(): string {
  return safeGet('local', NAMESPACE_KEY) || 'default'
}

async function call<Op extends MockOp>(op: Op, args: MockArgs[Op]): Promise<MockResult[Op]> {
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hp-volunteer': volunteerId(),
        'x-hp-mock-ns': mockNamespace(),
      },
      body: JSON.stringify({ op, args }),
    })
  } catch {
    throw new ShiftBackendError('network')
  }

  let body: { result?: MockResult[Op]; error?: string }
  try {
    body = await res.json()
  } catch {
    throw new ShiftBackendError('network')
  }

  if (!res.ok) {
    throw new ShiftBackendError(isBackendErrorCode(body.error) ? body.error : 'network', body.error)
  }
  return body.result as MockResult[Op]
}

// e2e-only: resets the mock server's in-memory state between tests. The
// route 404s unless HOURPROOF_MOCK_SHIFTS=1, so this is a no-op error path
// outside that mode.
export async function resetMockShifts(opts: { seedSecondKitchen?: boolean } = {}): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hp-mock-ns': mockNamespace() },
    body: JSON.stringify({ op: 'reset', args: opts }),
  })
  if (!res.ok) throw new ShiftBackendError('network')
}

export class MockShiftBackend implements ShiftBackend {
  readonly kind = 'mock' as const

  kitchenByCode(code: string): Promise<KitchenInfo | null> {
    return call('kitchenByCode', { code })
  }

  checkIn(code: string, displayName: string): Promise<Shift> {
    return call('checkIn', { code, displayName })
  }

  checkOut(code: string): Promise<Shift> {
    return call('checkOut', { code })
  }

  openShift(): Promise<Shift | null> {
    return call('openShift', {})
  }

  myShifts(sinceDate: string): Promise<Shift[]> {
    return call('myShifts', { sinceDate })
  }

  kitchenShifts(slug: string, pin: string, day: string): Promise<KitchenShift[]> {
    return call('kitchenShifts', { slug, pin, day })
  }

  decide(
    slug: string,
    pin: string,
    shiftId: string,
    d: { decision: 'confirm' | 'reject'; supervisor: string; reason?: string; checkOut?: string },
  ): Promise<KitchenShift> {
    return call('decide', {
      slug,
      pin,
      shiftId,
      decision: d.decision,
      supervisor: d.supervisor,
      reason: d.reason,
      checkOut: d.checkOut,
    })
  }

  posterCode(slug: string, pin: string): Promise<string> {
    return call('posterCode', { slug, pin })
  }

  rotateCode(slug: string, pin: string): Promise<string> {
    return call('rotateCode', { slug, pin })
  }
}
