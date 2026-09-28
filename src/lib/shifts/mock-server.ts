// A pure in-memory ShiftCred state machine with the same semantics as
// supabase/migrations/20260927000000_shiftcred.sql, for the UI and e2e to run
// without a Supabase project. See src/app/api/mock-shifts/route.ts (the HTTP
// wrapper, module-level singleton) and src/lib/shifts/mock-client.ts (the
// browser-side ShiftBackend that talks to that route).
//
// Reuses src/lib/shifts/rules.ts for every duration/rounding/auto-close rule,
// so the mock and the SQL agree on the math by construction, not by copying it.
import { randomBytes } from 'node:crypto'
import { AUTO_CLOSE_HOURS, MAX_CONFIRM_HOURS, autoCloseAt, shiftLogDate } from './rules'
import { ShiftBackendError, type KitchenInfo, type KitchenShift, type Shift, type ShiftStatus } from './types'

// Mock-only seed, per the controller ruling: a fixed kitchen so the UI and e2e
// have something to check in against with no setup step.
const DEFAULT_KITCHEN = {
  name: 'Community Kitchen (test)',
  slug: 'test-kitchen',
  qrCode: 'TESTCODE-0000000000000',
  pin: '123456',
} as const

// A second fixed kitchen, seeded only on request (the `reset` op), for tests
// that need to prove one kitchen doesn't affect another.
const SECOND_KITCHEN = {
  name: 'Community Kitchen 2 (test)',
  slug: 'test-kitchen-2',
  qrCode: 'TESTCODE2-00000000000',
  pin: '654321',
} as const

type MockKitchen = {
  id: string
  name: string
  slug: string
  qrCode: string
  pin: string
  active: boolean
}

type MockShift = {
  id: string
  userId: string
  kitchenId: string
  checkIn: string /* ISO instant */
  checkOut: string | null /* ISO instant */
  status: ShiftStatus
  autoClosed: boolean
  confirmedBy: string | null
  reason: string | null
  decidedAt: string | null /* ISO instant */
}

// The lockout state the SQL keeps in a per-kitchen sequence: the epoch second
// of the last wrong PIN, and how many wrong PINs in a row led up to it.
type PinLock = { lastFailureEpochSec: number; fails: number }

export type MockState = {
  kitchens: MockKitchen[]
  shifts: MockShift[]
  volunteers: Map<string, string> /* userId -> displayName */
  pinLocks: Map<string, PinLock> /* kitchenId -> lock state */
}

let nextId = 0
// A predictable id generator (not crypto-random): mock state is never shared
// across processes or persisted, and predictable ids make test assertions and
// debugging easier. Real uniqueness (crypto-random) is only needed for the
// public-facing QR codes, which a guesser could otherwise enumerate.
function newId(prefix: string): string {
  nextId += 1
  return `${prefix}-${nextId}`
}

function newCode(): string {
  // 16 random bytes, base64url without padding = 22 characters, matching
  // the SQL's _new_code().
  return randomBytes(16).toString('base64url')
}

function seedKitchen(def: { name: string; slug: string; qrCode: string; pin: string }): MockKitchen {
  return { id: newId('kitchen'), name: def.name, slug: def.slug, qrCode: def.qrCode, pin: def.pin, active: true }
}

export type ResetOptions = {
  // Mock-only extra (ruling 6): the `reset` op can seed a second kitchen so
  // e2e can prove one kitchen's lockout/data doesn't leak into another's.
  seedSecondKitchen?: boolean
}

export function createMockState(opts: ResetOptions = {}): MockState {
  const kitchens = [seedKitchen(DEFAULT_KITCHEN)]
  if (opts.seedSecondKitchen) kitchens.push(seedKitchen(SECOND_KITCHEN))
  return { kitchens, shifts: [], volunteers: new Map(), pinLocks: new Map() }
}

// Test-only helper (not reachable through the HTTP route): adds another
// kitchen with caller-chosen slug/pin/active state, for scenarios createMockState's
// fixed seed can't cover (an inactive kitchen, a third kitchen, a chosen pin).
export function addKitchen(
  state: MockState,
  def: { name?: string; slug: string; pin?: string; active?: boolean },
): MockKitchen {
  const kitchen: MockKitchen = {
    id: newId('kitchen'),
    name: def.name ?? `Kitchen ${def.slug}`,
    slug: def.slug,
    qrCode: newCode(),
    pin: def.pin ?? '111111',
    active: def.active ?? true,
  }
  state.kitchens.push(kitchen)
  return kitchen
}

// Test-only helper: inserts a shift row directly (bypassing check_in/check_out's
// own validation and 8h capping), for setting up fixtures the ops can't reach
// on their own — e.g. an already-over-10h pending shift, mirroring the SQL
// test harness's insertShift.
export function insertShift(
  state: MockState,
  def: {
    userId: string
    kitchenId: string
    checkIn: string
    checkOut?: string | null
    status?: ShiftStatus
    autoClosed?: boolean
  },
): Shift {
  const shift: MockShift = {
    id: newId('shift'),
    userId: def.userId,
    kitchenId: def.kitchenId,
    checkIn: def.checkIn,
    checkOut: def.checkOut ?? null,
    status: def.status ?? 'open',
    autoClosed: def.autoClosed ?? false,
    confirmedBy: null,
    reason: null,
    decidedAt: null,
  }
  state.shifts.push(shift)
  return mapShift(state, shift)
}

// Replaces `state`'s contents in place with a fresh seed, so callers holding
// a reference (the route's module-level singleton) see the reset immediately.
export function reset(state: MockState, opts: ResetOptions = {}): MockState {
  const fresh = createMockState(opts)
  state.kitchens = fresh.kitchens
  state.shifts = fresh.shifts
  state.volunteers = fresh.volunteers
  state.pinLocks = fresh.pinLocks
  return state
}

function kitchenNameOf(state: MockState, kitchenId: string): string {
  return state.kitchens.find((k) => k.id === kitchenId)?.name ?? ''
}

function volunteerNameOf(state: MockState, userId: string): string {
  return state.volunteers.get(userId) ?? ''
}

function mapShift(state: MockState, s: MockShift): Shift {
  return {
    id: s.id,
    kitchenId: s.kitchenId,
    kitchenName: kitchenNameOf(state, s.kitchenId),
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    status: s.status,
    confirmedBy: s.confirmedBy,
    reason: s.reason,
    autoClosed: s.autoClosed,
  }
}

function mapKitchenShift(state: MockState, s: MockShift): KitchenShift {
  return { ...mapShift(state, s), volunteerName: volunteerNameOf(state, s.userId) }
}

// Mirrors _auto_close: any open shift strictly older than AUTO_CLOSE_HOURS
// becomes pending, capped at check_in + 8h, and flagged auto_closed. NULL
// filters ("any user"/"any kitchen") are `undefined` here.
function autoCloseShifts(state: MockState, now: Date, filter: { userId?: string; kitchenId?: string }): void {
  const nowMs = now.getTime()
  for (const s of state.shifts) {
    if (s.status !== 'open') continue
    if (filter.userId !== undefined && s.userId !== filter.userId) continue
    if (filter.kitchenId !== undefined && s.kitchenId !== filter.kitchenId) continue
    const closeAt = autoCloseAt(s.checkIn)
    if (nowMs > new Date(closeAt).getTime()) {
      s.status = 'pending'
      s.checkOut = closeAt
      s.autoClosed = true
    }
  }
}

// Mirrors the SQL's name check: btrim, 1-40 chars, no control characters.
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR = /[\x00-\x1f\x7f]/
function validateHumanName(raw: string): string {
  const name = raw.trim()
  if (name.length < 1 || name.length > 40 || CONTROL_CHAR.test(name)) {
    throw new ShiftBackendError('bad_name')
  }
  return name
}

const LOCKOUT_WINDOW_SEC = 15 * 60
const LOCKOUT_THRESHOLD = 5

// Mirrors _check_pin's count-first, sequence-based lockout (Task 2 fix round
// 1, C1): every comparison counts as a failure before it's made, and a
// correct PIN restores exactly the state read at the start of the call. Read-
// only-transaction refusal doesn't apply here: the mock is always reached
// over POST (there is no GET path), so there is no read-only oracle to guard
// against.
function checkPin(state: MockState, slug: string, pin: string, now: Date): string {
  const kitchen = state.kitchens.find((k) => k.slug === slug && k.active)
  if (!kitchen) throw new ShiftBackendError('not_found')

  const nowSec = Math.floor(now.getTime() / 1000)
  const priorLock = state.pinLocks.get(kitchen.id)
  const fails = priorLock && nowSec - priorLock.lastFailureEpochSec < LOCKOUT_WINDOW_SEC ? priorLock.fails : 0
  if (fails >= LOCKOUT_THRESHOLD) throw new ShiftBackendError('locked')

  // Count first: this attempt is recorded as a failure before the PIN is
  // compared, so a crash or throw after this line still counts.
  state.pinLocks.set(kitchen.id, { lastFailureEpochSec: nowSec, fails: fails + 1 })
  if (pin !== kitchen.pin) throw new ShiftBackendError('bad_pin')

  // Correct PIN: undo this call's count by restoring exactly the state read
  // above (not the aged-to-0 value), matching the SQL's setval(v_state).
  if (priorLock) state.pinLocks.set(kitchen.id, priorLock)
  else state.pinLocks.delete(kitchen.id)
  return kitchen.id
}

export type MockArgs = {
  kitchenByCode: { code: string }
  checkIn: { code: string; displayName: string }
  checkOut: { code: string }
  openShift: Record<string, never>
  myShifts: { sinceDate: string }
  kitchenShifts: { slug: string; pin: string; day: string }
  decide: {
    slug: string
    pin: string
    shiftId: string
    decision: 'confirm' | 'reject'
    supervisor: string
    reason?: string
    checkOut?: string
  }
  posterCode: { slug: string; pin: string }
  rotateCode: { slug: string; pin: string }
}

export type MockResult = {
  kitchenByCode: KitchenInfo | null
  checkIn: Shift
  checkOut: Shift
  openShift: Shift | null
  myShifts: Shift[]
  kitchenShifts: KitchenShift[]
  decide: KitchenShift
  posterCode: string
  rotateCode: string
}

export type MockOp = keyof MockArgs

function dispatch(state: MockState, op: MockOp, args: unknown, volunteerId: string | undefined, now: Date): unknown {
  switch (op) {
    case 'kitchenByCode': {
      const { code } = args as MockArgs['kitchenByCode']
      const kitchen = state.kitchens.find((k) => k.qrCode === code && k.active)
      return kitchen ? { id: kitchen.id, name: kitchen.name } : null
    }

    case 'checkIn': {
      const { code, displayName } = args as MockArgs['checkIn']
      if (!volunteerId) throw new ShiftBackendError('not_checked_in')
      const name = validateHumanName(displayName)
      const kitchen = state.kitchens.find((k) => k.qrCode === code && k.active)
      if (!kitchen) throw new ShiftBackendError('not_found')

      autoCloseShifts(state, now, { userId: volunteerId })
      state.volunteers.set(volunteerId, name)

      const open = state.shifts.find((s) => s.userId === volunteerId && s.status === 'open')
      if (open) {
        if (open.kitchenId !== kitchen.id) throw new ShiftBackendError('already_open_elsewhere')
        return mapShift(state, open)
      }
      const shift: MockShift = {
        id: newId('shift'),
        userId: volunteerId,
        kitchenId: kitchen.id,
        checkIn: now.toISOString(),
        checkOut: null,
        status: 'open',
        autoClosed: false,
        confirmedBy: null,
        reason: null,
        decidedAt: null,
      }
      state.shifts.push(shift)
      return mapShift(state, shift)
    }

    case 'checkOut': {
      const { code } = args as MockArgs['checkOut']
      if (!volunteerId) throw new ShiftBackendError('not_checked_in')
      // An inactive kitchen still lets an already-checked-in volunteer check out.
      const kitchen = state.kitchens.find((k) => k.qrCode === code)
      if (!kitchen) throw new ShiftBackendError('not_found')
      const shift = state.shifts.find((s) => s.userId === volunteerId && s.kitchenId === kitchen.id && s.status === 'open')
      if (!shift) throw new ShiftBackendError('not_checked_in')

      const cap = new Date(autoCloseAt(shift.checkIn))
      const closeAt = now.getTime() < cap.getTime() ? now : cap
      shift.checkOut = closeAt.toISOString()
      shift.autoClosed = now.getTime() > cap.getTime()
      shift.status = 'pending'
      return mapShift(state, shift)
    }

    case 'openShift': {
      if (!volunteerId) return null
      autoCloseShifts(state, now, { userId: volunteerId })
      const open = state.shifts.find((s) => s.userId === volunteerId && s.status === 'open')
      return open ? mapShift(state, open) : null
    }

    case 'myShifts': {
      const { sinceDate } = args as MockArgs['myShifts']
      if (!volunteerId) return []
      autoCloseShifts(state, now, { userId: volunteerId })
      return state.shifts
        .filter((s) => s.userId === volunteerId && shiftLogDate(s.checkIn) >= sinceDate)
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.id.localeCompare(b.id))
        .map((s) => mapShift(state, s))
    }

    case 'kitchenShifts': {
      const { slug, pin, day } = args as MockArgs['kitchenShifts']
      if (day == null) throw new ShiftBackendError('not_found')
      const kitchenId = checkPin(state, slug, pin, now)
      autoCloseShifts(state, now, { kitchenId })
      return state.shifts
        .filter((s) => s.kitchenId === kitchenId && shiftLogDate(s.checkIn) === day)
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.id.localeCompare(b.id))
        .map((s) => mapKitchenShift(state, s))
    }

    case 'decide': {
      const { slug, pin, shiftId, decision, supervisor, reason, checkOut } = args as MockArgs['decide']
      const kitchenId = checkPin(state, slug, pin, now)
      const supervisorName = validateHumanName(supervisor)
      if (decision !== 'confirm' && decision !== 'reject') throw new ShiftBackendError('needs_correction')

      autoCloseShifts(state, now, { kitchenId })
      const shift = state.shifts.find(
        (s) => s.id === shiftId && s.kitchenId === kitchenId && (s.status === 'open' || s.status === 'pending'),
      )
      if (!shift) throw new ShiftBackendError('not_found')

      const endIso = checkOut ?? shift.checkOut ?? now.toISOString()
      const endMs = new Date(endIso).getTime()
      const checkInMs = new Date(shift.checkIn).getTime()
      if (endMs < checkInMs || endMs > now.getTime()) throw new ShiftBackendError('needs_correction')

      let trimmedReason: string | null = null
      if (decision === 'confirm') {
        if (endMs - checkInMs > MAX_CONFIRM_HOURS * 60 * 60 * 1000) throw new ShiftBackendError('needs_correction')
      } else {
        trimmedReason = reason?.trim() ?? ''
        if (trimmedReason.length < 1 || trimmedReason.length > 280) throw new ShiftBackendError('needs_correction')
      }

      shift.checkOut = endIso
      shift.status = decision === 'confirm' ? 'confirmed' : 'rejected'
      shift.confirmedBy = supervisorName
      shift.reason = decision === 'reject' ? trimmedReason : null
      shift.decidedAt = now.toISOString()
      return mapKitchenShift(state, shift)
    }

    case 'posterCode': {
      const { slug, pin } = args as MockArgs['posterCode']
      const kitchenId = checkPin(state, slug, pin, now)
      const kitchen = state.kitchens.find((k) => k.id === kitchenId)
      return kitchen?.qrCode ?? ''
    }

    case 'rotateCode': {
      const { slug, pin } = args as MockArgs['rotateCode']
      const kitchenId = checkPin(state, slug, pin, now)
      const kitchen = state.kitchens.find((k) => k.id === kitchenId)
      if (!kitchen) throw new ShiftBackendError('not_found')
      kitchen.qrCode = newCode()
      return kitchen.qrCode
    }

    default: {
      const _exhaustive: never = op
      throw new ShiftBackendError('network', `unknown mock op: ${String(_exhaustive)}`)
    }
  }
}

export function handle<Op extends MockOp>(
  state: MockState,
  op: Op,
  args: MockArgs[Op],
  volunteerId: string | undefined,
  now: Date,
): MockResult[Op] {
  return dispatch(state, op, args, volunteerId, now) as MockResult[Op]
}

// AUTO_CLOSE_HOURS is re-exported so the route/tests can reason about the
// 8-hour boundary without importing rules.ts separately.
export { AUTO_CLOSE_HOURS }
