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

export type KitchenShift = Shift & { volunteerName: string }

export type KitchenInfo = { id: string; name: string; slug: string }

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
}
