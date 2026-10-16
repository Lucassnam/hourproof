// Types for ShiftCred: kitchen QR check-in, supervisor confirmation.
// See docs/plans/2026-09-27-phase3-shiftcred.md for the full design. This
// file only defines shapes shared by the pure rules (rules.ts), the mock and
// Supabase backends (Task 3), and the hour-log merge (src/lib/hours/merge.ts).

export type ShiftStatus = 'open' | 'pending' | 'confirmed' | 'rejected'

export type Shift = {
  id: string
  kitchenId: string
  kitchenName: string
  checkIn: string /* ISO instant */
  checkOut: string | null /* ISO instant */
  status: ShiftStatus
  confirmedBy: string | null
  reason: string | null
  autoClosed: boolean
}

// decidedAt: when the kitchen confirmed or rejected it (null while undecided). The
// dashboard offers Undo for 24 hours after it (undo_decision in the second migration).
export type KitchenShift = Shift & { volunteerName: string; decidedAt: string | null }

// What use_link_code says: linked, a code that isn't live (or is the caller's own), or too
// many wrong codes in 15 minutes.
export type LinkResult = 'ok' | 'bad_code' | 'locked'
export type LinkCode = { code: string; expiresAt: string /* ISO instant */ }

// The SQL's kitchen_by_code no longer returns a slug: the poster is public, and the
// slug is half of what a PIN guesser needs (Task 2 fix round 1, ruling 1).
export type KitchenInfo = { id: string; name: string }

export type BackendErrorCode =
  | 'not_found'
  | 'already_open_elsewhere'
  | 'not_checked_in'
  | 'bad_pin'
  | 'locked'
  | 'needs_correction'
  | 'bad_name'
  | 'unavailable'
  | 'network'

export class ShiftBackendError extends Error {
  constructor(
    public code: BackendErrorCode,
    public detail?: unknown,
  ) {
    super(code)
  }
}

export interface ShiftBackend {
  readonly kind: 'supabase' | 'mock' | 'unavailable'
  kitchenByCode(code: string): Promise<KitchenInfo | null>
  checkIn(code: string, displayName: string): Promise<Shift>
  checkOut(code: string): Promise<Shift>
  openShift(): Promise<Shift | null>
  myShifts(sinceDate: string /* YYYY-MM-DD */): Promise<Shift[]>
  kitchenShifts(slug: string, pin: string, day: string): Promise<KitchenShift[]>
  decide(
    slug: string,
    pin: string,
    shiftId: string,
    d: { decision: 'confirm' | 'reject'; supervisor: string; reason?: string; checkOut?: string },
  ): Promise<KitchenShift>
  posterCode(slug: string, pin: string): Promise<string>
  rotateCode(slug: string, pin: string): Promise<string>
  // Pending shifts dated before `before` (YYYY-MM-DD), at most 90 days back.
  kitchenWaiting(slug: string, pin: string, before: string): Promise<KitchenShift[]>
  // Back to pending, within 24 hours of the decision.
  undoDecision(slug: string, pin: string, shiftId: string): Promise<KitchenShift>
  // Device links: a code from one browser, typed into another, joins the two so myShifts
  // returns the shifts checked in from either.
  makeLinkCode(): Promise<LinkCode>
  useLinkCode(code: string): Promise<LinkResult>
}
