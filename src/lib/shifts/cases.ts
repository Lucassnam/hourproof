// Named shift-duration cases shared by the pure rules tests (rules.test.ts)
// and, in Task 2, the SQL/PGlite tests, so both implementations of the
// rounding rule are checked against the exact same instants. All times are
// full ISO instants (with explicit UTC offsets) so the SQL side can subtract
// timestamptz values directly and the TS side never does wall-clock math.

export type ShiftCase = {
  name: string
  checkIn: string /* ISO instant */
  checkOut: string /* ISO instant */
  expectedHours: number
}

export const SHIFT_CASES: ShiftCase[] = [
  {
    name: '10:02 to 13:14 = 3.0 (12 min over 3h rounds down)',
    checkIn: '2026-10-05T10:02:00-07:00',
    checkOut: '2026-10-05T13:14:00-07:00',
    expectedHours: 3.0,
  },
  {
    name: 'exactly 3h = 3.0',
    checkIn: '2026-10-05T09:00:00-07:00',
    checkOut: '2026-10-05T12:00:00-07:00',
    expectedHours: 3.0,
  },
  {
    name: '14 min = 0 (under one quarter hour)',
    checkIn: '2026-10-05T09:00:00-07:00',
    checkOut: '2026-10-05T09:14:00-07:00',
    expectedHours: 0,
  },
  {
    name: '7h59 = 7.75 (59 min rounds down to 45)',
    checkIn: '2026-10-05T09:00:00-07:00',
    checkOut: '2026-10-05T16:59:00-07:00',
    expectedHours: 7.75,
  },
  {
    name: 'crossing midnight 23:30 to 01:15 = 1.75',
    checkIn: '2026-10-05T23:30:00-07:00',
    checkOut: '2026-10-06T01:15:00-07:00',
    expectedHours: 1.75,
  },
  {
    name: 'DST fall-back night 2026-11-01 00:30 to 02:30 PT = 3.0 real hours',
    // Wall clock reads "00:30 to 02:30" (a nominal 2h), but clocks fall back
    // from 2:00am PDT to 1:00am PST during this window, so 3 real hours
    // elapse. Computed from the ISO instants (note the offset change), never
    // from wall-clock subtraction.
    checkIn: '2026-11-01T00:30:00-07:00',
    checkOut: '2026-11-01T02:30:00-08:00',
    expectedHours: 3.0,
  },
]
