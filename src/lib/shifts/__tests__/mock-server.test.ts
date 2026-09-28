// Contract tests for mock-server.ts, covering the same behavior list as Task
// 2's SQL tests (test/sql/shiftcred.test.ts, items 2-8 and 11) — adapted
// where the mock has no RLS/grants to test (there's no separate anon/
// authenticated distinction; "no volunteerId" stands in for "no session").
// Admin-only SQL functions (create_kitchen, unlock_kitchen, reset_kitchen_pin)
// are not part of the client, so item 2's create_kitchen coverage is limited
// to what a client can observe: kitchen_by_code.
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SHIFT_CASES } from '../cases'
import { shiftHours } from '../rules'
import { addKitchen, createMockState, handle, insertShift, type MockState } from '../mock-server'
import { ShiftBackendError, type Shift } from '../types'

const HOUR = 60 * 60 * 1000
const MIN = 60 * 1000

function errorCodeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (err) {
    if (err instanceof ShiftBackendError) return err.code
    throw err
  }
  throw new Error('expected a ShiftBackendError, got none')
}

/** Directly rewrites a shift's checkIn (the mock's stand-in for backdating a row in SQL). */
function backdate(state: MockState, shiftId: string, checkIn: Date): void {
  const shift = state.shifts.find((s) => s.id === shiftId)
  if (!shift) throw new Error(`no shift ${shiftId}`)
  shift.checkIn = checkIn.toISOString()
}

function findShift(state: MockState, id: string) {
  const s = state.shifts.find((s) => s.id === id)
  if (!s) throw new Error(`no shift ${id}`)
  return s
}

const DEFAULT_CODE = 'TESTCODE-0000000000000'
const DEFAULT_SLUG = 'test-kitchen'
const DEFAULT_PIN = '123456'

describe('mock-server (contract tests mirroring the SQL test list)', () => {
  it('2. kitchen_by_code: finds the seeded kitchen by its 22-char code (id, name only); unknown or inactive codes return null', () => {
    const state = createMockState()
    expect(DEFAULT_CODE).toHaveLength(22)
    const found = handle(state, 'kitchenByCode', { code: DEFAULT_CODE }, undefined, new Date())
    expect(found).toMatchObject({ name: 'Community Kitchen (test)' })
    expect(found).not.toHaveProperty('slug')

    expect(handle(state, 'kitchenByCode', { code: 'no-such-code' }, undefined, new Date())).toBeNull()

    const inactive = addKitchen(state, { slug: 'inactive-kitchen', active: false })
    expect(handle(state, 'kitchenByCode', { code: inactive.qrCode }, undefined, new Date())).toBeNull()
  })

  it('3. check_in: opens a shift; again at the same kitchen returns the same id; another kitchen raises already_open_elsewhere; only one open row; the name is trimmed', () => {
    const state = createMockState()
    const b = addKitchen(state, { slug: 'kitchen-b' })
    const uid = randomUUID()

    const opened = handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: '  Ana  ' }, uid, new Date()) as Shift
    expect(opened.status).toBe('open')
    expect(state.volunteers.get(uid)).toBe('Ana')

    const again = handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Ana' }, uid, new Date()) as Shift
    expect(again.id).toBe(opened.id)
    expect(state.shifts.filter((s) => s.userId === uid && s.status === 'open')).toHaveLength(1)

    expect(errorCodeOf(() => handle(state, 'checkIn', { code: b.qrCode, displayName: 'Ana' }, uid, new Date()))).toBe(
      'already_open_elsewhere',
    )
    expect(state.shifts.filter((s) => s.userId === uid && s.status === 'open')).toHaveLength(1)
  })

  it('3b. check_in validates the name and the code, and needs a volunteer id', () => {
    const state = createMockState()
    const uid = randomUUID()
    const inactive = addKitchen(state, { slug: 'inactive', active: false })

    expect(errorCodeOf(() => handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: '' }, uid, new Date()))).toBe(
      'bad_name',
    )
    expect(
      errorCodeOf(() => handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'x'.repeat(41) }, uid, new Date())),
    ).toBe('bad_name')
    expect(
      errorCodeOf(() => handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Ana\nBad' }, uid, new Date())),
    ).toBe('bad_name')

    expect(errorCodeOf(() => handle(state, 'checkIn', { code: 'unknown', displayName: 'Ana' }, uid, new Date()))).toBe(
      'not_found',
    )
    expect(
      errorCodeOf(() => handle(state, 'checkIn', { code: inactive.qrCode, displayName: 'Ana' }, uid, new Date())),
    ).toBe('not_found')

    expect(
      errorCodeOf(() => handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Ana' }, undefined, new Date())),
    ).toBe('not_checked_in')
  })

  it('4. check_out: not_checked_in before check-in and at another kitchen; check-out gives pending with check_out set; a second check-out raises not_checked_in', () => {
    const state = createMockState()
    const b = addKitchen(state, { slug: 'kitchen-b' })
    const uid = randomUUID()

    expect(errorCodeOf(() => handle(state, 'checkOut', { code: DEFAULT_CODE }, uid, new Date()))).toBe('not_checked_in')

    handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Ana' }, uid, new Date())
    expect(errorCodeOf(() => handle(state, 'checkOut', { code: b.qrCode }, uid, new Date()))).toBe('not_checked_in')

    const closed = handle(state, 'checkOut', { code: DEFAULT_CODE }, uid, new Date()) as Shift
    expect(closed.status).toBe('pending')
    expect(closed.checkOut).not.toBeNull()
    expect(closed.autoClosed).toBe(false)

    expect(errorCodeOf(() => handle(state, 'checkOut', { code: DEFAULT_CODE }, uid, new Date()))).toBe('not_checked_in')
  })

  it('4b. checking out 9 hours after check-in caps the shift at 8 hours and marks it auto-closed', () => {
    const state = createMockState()
    const uid = randomUUID()
    const now = new Date('2026-10-05T20:00:00Z')
    const opened = handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Ana' }, uid, now) as Shift
    backdate(state, opened.id, new Date(now.getTime() - 9 * HOUR))

    const closed = handle(state, 'checkOut', { code: DEFAULT_CODE }, uid, now) as Shift
    expect(closed.status).toBe('pending')
    expect(closed.autoClosed).toBe(true)
    expect(shiftHours(closed.checkIn, closed.checkOut as string)).toBe(8)
  })

  it('5. auto-close: an open shift 9h old becomes pending/auto_closed/+8h through myShifts, kitchenShifts and check_in; 7h59 stays open', () => {
    const state = createMockState()
    const b = addKitchen(state, { slug: 'kitchen-b' })
    const now = new Date('2026-10-05T20:00:00Z')

    // Through myShifts.
    const uid1 = randomUUID()
    const s1 = handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Ana' }, uid1, now) as Shift
    backdate(state, s1.id, new Date(now.getTime() - 9 * HOUR))
    const my = handle(state, 'myShifts', { sinceDate: '2020-01-01' }, uid1, now) as Shift[]
    expect(my[0]).toMatchObject({ status: 'pending', autoClosed: true, kitchenName: 'Community Kitchen (test)' })
    // check_out must be exactly checkIn + 8h (the *backdated* checkIn, not s1's pre-backdate snapshot).
    expect(my[0].checkOut).toBe(new Date(new Date(my[0].checkIn).getTime() + 8 * HOUR).toISOString())

    // Through kitchenShifts (flagged, with volunteerName).
    const uid2 = randomUUID()
    const s2 = handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Ben' }, uid2, now) as Shift
    backdate(state, s2.id, new Date(now.getTime() - 9 * HOUR))
    const today = '2026-10-05'
    const kShifts = handle(state, 'kitchenShifts', { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, day: today }, undefined, now)
    const row = (kShifts as Array<Shift & { volunteerName: string }>).find((s) => s.id === s2.id)
    expect(row).toMatchObject({ status: 'pending', autoClosed: true, volunteerName: 'Ben' })

    // Through check_in: a stale open shift at kitchen A doesn't block a check-in at B.
    const uid3 = randomUUID()
    const s3 = handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Cy' }, uid3, now) as Shift
    backdate(state, s3.id, new Date(now.getTime() - 9 * HOUR))
    const atB = handle(state, 'checkIn', { code: b.qrCode, displayName: 'Cy' }, uid3, now) as Shift
    expect(atB.status).toBe('open')
    expect(findShift(state, s3.id)).toMatchObject({ status: 'pending', autoClosed: true })

    // 7h59 stays open.
    const uid4 = randomUUID()
    const s4 = handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Di' }, uid4, now) as Shift
    backdate(state, s4.id, new Date(now.getTime() - (7 * HOUR + 59 * MIN)))
    const still = (handle(state, 'myShifts', { sinceDate: '2020-01-01' }, uid4, now) as Shift[])[0]
    expect(still).toMatchObject({ status: 'open', checkOut: null, autoClosed: false })
  })

  describe('6. duration cases: checkIn/checkOut round-trip unchanged, and shiftHours (rules.ts) matches the shared case list', () => {
    it.each(SHIFT_CASES)('$name', ({ checkIn, checkOut, expectedHours }) => {
      const state = createMockState()
      const uid = randomUUID()
      const shift = handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Ana' }, uid, new Date(checkIn)) as Shift
      backdate(state, shift.id, new Date(checkIn))
      const decided = handle(
        state,
        'decide',
        { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, shiftId: shift.id, decision: 'reject', supervisor: 'Sup', reason: 'r', checkOut },
        undefined,
        new Date(checkOut),
      ) as Shift
      // Compare by instant, not by string: the mock normalizes stored
      // instants to a Date's own ISO form, which drops the case's original
      // UTC-offset spelling (same instant, different string).
      expect(new Date(decided.checkIn).getTime()).toBe(new Date(checkIn).getTime())
      expect(new Date(decided.checkOut as string).getTime()).toBe(new Date(checkOut).getTime())
      expect(shiftHours(decided.checkIn, decided.checkOut as string)).toBe(expectedHours)
    })
  })

  it('7. PIN: wrong -> bad_pin; 5 wrong then the right one -> locked; another kitchen unaffected; 16 minutes later the right PIN works; unknown slug -> not_found', () => {
    const state = createMockState()
    addKitchen(state, { slug: 'kitchen-b', pin: '222222' })
    const now = new Date('2026-10-05T20:00:00Z')
    const today = '2026-10-05'
    const wrongPinCall = () =>
      handle(state, 'kitchenShifts', { slug: DEFAULT_SLUG, pin: '000000', day: today }, undefined, now)

    expect(errorCodeOf(wrongPinCall)).toBe('bad_pin')
    for (let i = 0; i < 4; i++) expect(errorCodeOf(wrongPinCall)).toBe('bad_pin')
    expect(
      errorCodeOf(() => handle(state, 'kitchenShifts', { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, day: today }, undefined, now)),
    ).toBe('locked')

    // Another kitchen is unaffected.
    expect(
      handle(state, 'kitchenShifts', { slug: 'kitchen-b', pin: '222222', day: today }, undefined, now),
    ).toEqual([])

    // 16 minutes later the right PIN works.
    const later = new Date(now.getTime() + 16 * MIN)
    expect(
      handle(state, 'kitchenShifts', { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, day: today }, undefined, later),
    ).toEqual([])

    expect(
      errorCodeOf(() => handle(state, 'kitchenShifts', { slug: 'no-such-kitchen', pin: '123456', day: today }, undefined, now)),
    ).toBe('not_found')
  })

  it('8. decide: confirm, reject, needs_correction, another kitchen', () => {
    const state = createMockState()
    const b = addKitchen(state, { slug: 'kitchen-b', pin: '222222' })
    const now = new Date('2026-10-05T20:00:00Z')

    const u1 = randomUUID()
    const s1 = handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Ana' }, u1, now) as Shift
    handle(state, 'checkOut', { code: DEFAULT_CODE }, u1, now)
    const confirmed = handle(
      state,
      'decide',
      { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, shiftId: s1.id, decision: 'confirm', supervisor: '  Maria  ' },
      undefined,
      now,
    ) as Shift & { volunteerName: string }
    expect(confirmed).toMatchObject({ id: s1.id, status: 'confirmed', confirmedBy: 'Maria', volunteerName: 'Ana' })

    // A decided shift can't be decided again.
    expect(
      errorCodeOf(() =>
        handle(
          state,
          'decide',
          { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, shiftId: s1.id, decision: 'reject', supervisor: 'Maria', reason: 'oops' },
          undefined,
          now,
        ),
      ),
    ).toBe('not_found')

    // Reject needs a non-blank reason.
    const u2 = randomUUID()
    const s2 = handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Ben' }, u2, now) as Shift
    handle(state, 'checkOut', { code: DEFAULT_CODE }, u2, now)
    expect(
      errorCodeOf(() =>
        handle(state, 'decide', { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, shiftId: s2.id, decision: 'reject', supervisor: 'Maria' }, undefined, now),
      ),
    ).toBe('needs_correction')
    expect(
      errorCodeOf(() =>
        handle(
          state,
          'decide',
          { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, shiftId: s2.id, decision: 'reject', supervisor: 'Maria', reason: '   ' },
          undefined,
          now,
        ),
      ),
    ).toBe('needs_correction')
    const rejected = handle(
      state,
      'decide',
      { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, shiftId: s2.id, decision: 'reject', supervisor: 'Maria', reason: 'Not here' },
      undefined,
      now,
    ) as Shift
    expect(rejected).toMatchObject({ status: 'rejected', reason: 'Not here' })

    // A 10h15 shift needs a correction; a 9h correction confirms. Inserted
    // directly (bypassing check_out's own 8h cap), like the SQL test's
    // insertShift, since a real check_out could never produce one.
    const u3 = randomUUID()
    const ci = new Date(now.getTime() - 11 * HOUR)
    const kitchenA = handle(state, 'kitchenByCode', { code: DEFAULT_CODE }, undefined, now) as { id: string }
    const s3after = insertShift(state, {
      userId: u3,
      kitchenId: kitchenA.id,
      checkIn: ci.toISOString(),
      checkOut: new Date(ci.getTime() + 10.25 * HOUR).toISOString(),
      status: 'pending',
    })
    expect(
      errorCodeOf(() =>
        handle(state, 'decide', { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, shiftId: s3after.id, decision: 'confirm', supervisor: 'Maria' }, undefined, now),
      ),
    ).toBe('needs_correction')
    const corrected = handle(
      state,
      'decide',
      {
        slug: DEFAULT_SLUG,
        pin: DEFAULT_PIN,
        shiftId: s3after.id,
        decision: 'confirm',
        supervisor: 'Maria',
        checkOut: new Date(ci.getTime() + 9 * HOUR).toISOString(),
      },
      undefined,
      now,
    ) as Shift
    expect(corrected.status).toBe('confirmed')

    // A correction before check-in is rejected.
    const u4 = randomUUID()
    const s4 = handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Di' }, u4, now) as Shift
    expect(
      errorCodeOf(() =>
        handle(
          state,
          'decide',
          {
            slug: DEFAULT_SLUG,
            pin: DEFAULT_PIN,
            shiftId: s4.id,
            decision: 'confirm',
            supervisor: 'Maria',
            checkOut: new Date(new Date(s4.checkIn).getTime() - MIN).toISOString(),
          },
          undefined,
          now,
        ),
      ),
    ).toBe('needs_correction')

    // A correction in the future is rejected.
    expect(
      errorCodeOf(() =>
        handle(
          state,
          'decide',
          {
            slug: DEFAULT_SLUG,
            pin: DEFAULT_PIN,
            shiftId: s4.id,
            decision: 'confirm',
            supervisor: 'Maria',
            checkOut: new Date(now.getTime() + HOUR).toISOString(),
          },
          undefined,
          now,
        ),
      ),
    ).toBe('needs_correction')

    // An open shift is closed by the decision (no correction offered -> ends now).
    const closedByDecision = handle(
      state,
      'decide',
      { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, shiftId: s4.id, decision: 'confirm', supervisor: 'Maria' },
      undefined,
      now,
    ) as Shift
    expect(closedByDecision.status).toBe('confirmed')
    expect(closedByDecision.checkOut).toBe(now.toISOString())

    // Another kitchen's shift raises not_found.
    const u5 = randomUUID()
    const s5 = handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Eli' }, u5, now) as Shift
    handle(state, 'checkOut', { code: DEFAULT_CODE }, u5, now)
    expect(
      errorCodeOf(() =>
        handle(state, 'decide', { slug: 'kitchen-b', pin: '222222', shiftId: s5.id, decision: 'confirm', supervisor: 'Maria' }, undefined, now),
      ),
    ).toBe('not_found')
    void b

    // A blank supervisor raises bad_name.
    expect(
      errorCodeOf(() =>
        handle(state, 'decide', { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, shiftId: s5.id, decision: 'confirm', supervisor: '   ' }, undefined, now),
      ),
    ).toBe('bad_name')

    // An unknown decision raises needs_correction.
    expect(
      errorCodeOf(() =>
        handle(
          state,
          'decide',
          // @ts-expect-error deliberately invalid decision, mirroring the SQL's own check
          { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, shiftId: s5.id, decision: 'maybe', supervisor: 'Maria' },
          undefined,
          now,
        ),
      ),
    ).toBe('needs_correction')

    // A wrong PIN raises bad_pin.
    expect(
      errorCodeOf(() =>
        handle(state, 'decide', { slug: DEFAULT_SLUG, pin: '000000', shiftId: s5.id, decision: 'confirm', supervisor: 'Maria' }, undefined, now),
      ),
    ).toBe('bad_pin')
  })

  it('11. California date: a shift at 2026-11-01T06:30Z shows in kitchen_shifts(..., 2026-10-31) and not 2026-11-01; myShifts uses the same boundary', () => {
    const state = createMockState()
    const uid = randomUUID()
    const checkIn = new Date('2026-11-01T06:30:00Z')
    const shift = handle(state, 'checkIn', { code: DEFAULT_CODE, displayName: 'Ana' }, uid, checkIn) as Shift

    const onOct31 = handle(state, 'kitchenShifts', { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, day: '2026-10-31' }, undefined, checkIn) as Shift[]
    expect(onOct31.map((s) => s.id)).toContain(shift.id)
    const onNov1 = handle(state, 'kitchenShifts', { slug: DEFAULT_SLUG, pin: DEFAULT_PIN, day: '2026-11-01' }, undefined, checkIn) as Shift[]
    expect(onNov1.map((s) => s.id)).not.toContain(shift.id)

    const myOct31 = handle(state, 'myShifts', { sinceDate: '2026-10-31' }, uid, checkIn) as Shift[]
    expect(myOct31.map((s) => s.id)).toContain(shift.id)
    const myNov1 = handle(state, 'myShifts', { sinceDate: '2026-11-01' }, uid, checkIn) as Shift[]
    expect(myNov1.map((s) => s.id)).not.toContain(shift.id)
  })
})
