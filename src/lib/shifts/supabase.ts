// The real ShiftCred backend: talks to the RPCs in
// supabase/migrations/20260927000000_shiftcred.sql through supabase-js.
//
// The SQL is the source of truth (see the Task 2 report for exact RPC
// signatures, return columns and error codes); every mapping here traces back
// to a specific line there.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ShiftBackendError,
  type BackendErrorCode,
  type KitchenInfo,
  type KitchenShift,
  type Shift,
  type ShiftBackend,
  type ShiftStatus,
} from './types'

// A date far enough back that "since this date" means "all of them" — there's
// no open_shift/all-shifts RPC (Task 2 report, section 5), so openShift() and
// an unbounded myShifts() both go through my_shifts(p_since).
const EPOCH_DATE = '1970-01-01'

type RawShiftRow = {
  id: string
  kitchen_id: string
  check_in: string
  check_out: string | null
  status: ShiftStatus
  auto_closed: boolean
  confirmed_by: string | null
  reason: string | null
}
type RawNamedShiftRow = RawShiftRow & { kitchen_name: string }
type RawKitchenShiftRow = RawNamedShiftRow & { volunteer_name: string }

function mapShift(row: RawShiftRow, kitchenName: string): Shift {
  return {
    id: row.id,
    kitchenId: row.kitchen_id,
    kitchenName,
    checkIn: row.check_in,
    checkOut: row.check_out,
    status: row.status,
    confirmedBy: row.confirmed_by,
    reason: row.reason,
    autoClosed: row.auto_closed,
  }
}

function mapNamedShift(row: RawNamedShiftRow): Shift {
  return mapShift(row, row.kitchen_name)
}

function mapKitchenShift(row: RawKitchenShiftRow): KitchenShift {
  return { ...mapNamedShift(row), volunteerName: row.volunteer_name }
}

// Every RPC raises an exception whose message is exactly one of these codes
// (see the migration's header comment); anything else — "permission denied",
// a network failure, a message this client doesn't recognize yet — maps to
// 'network' per ruling 5, rather than being surfaced raw to the UI.
const KNOWN_RPC_ERROR_CODES = new Set<string>([
  'not_found',
  'already_open_elsewhere',
  'not_checked_in',
  'bad_pin',
  'locked',
  'needs_correction',
  'bad_name',
])

function mapErrorMessage(message: string | undefined): BackendErrorCode {
  if (message && KNOWN_RPC_ERROR_CODES.has(message)) return message as BackendErrorCode
  return 'network'
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new ShiftBackendError('unavailable', `missing env ${name}`)
  return value
}

let clientPromise: Promise<SupabaseClient> | null = null

// Dynamic import: @supabase/supabase-js is only pulled into a bundle once a
// Supabase-backend method is actually called, so `/` and `/screener` (which
// never touch ShiftCred) stay out of it. Verified with `npm run build && npm
// run measure`.
function getClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')),
    )
  }
  return clientPromise
}

export class SupabaseShiftBackend implements ShiftBackend {
  readonly kind = 'supabase' as const

  // Volunteer RPCs (check_in/check_out/my_shifts) need auth.uid(); the bare
  // anon key has none. Kitchen (PIN) RPCs need no session at all — the PIN is
  // the credential — so this is only ever called from the volunteer methods.
  private async ensureSession(client: SupabaseClient): Promise<void> {
    try {
      const { data } = await client.auth.getSession()
      if (data.session) return
      const { error } = await client.auth.signInAnonymously()
      if (error) throw new ShiftBackendError('network', error)
    } catch (err) {
      if (err instanceof ShiftBackendError) throw err
      throw new ShiftBackendError('network', err)
    }
  }

  private async rpc<T>(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
    // supabase-js's rpc() issues a POST by default. Never pass { get: true }
    // here: PostgREST runs a GET/HEAD /rpc call in a READ ONLY transaction,
    // and every PIN RPC refuses a read-only transaction with 'locked' before
    // it does anything else (Task 2 fix round 1, C1) — a GET would make every
    // kitchen PIN check look locked, whether it is or not.
    let data: unknown
    let error: { message?: string } | null
    try {
      ;({ data, error } = await client.rpc(name, args))
    } catch (err) {
      throw new ShiftBackendError('network', err)
    }
    if (error) throw new ShiftBackendError(mapErrorMessage(error.message), error)
    return data as T
  }

  async kitchenByCode(code: string): Promise<KitchenInfo | null> {
    const client = await getClient()
    const rows = await this.rpc<Array<{ id: string; name: string }>>(client, 'kitchen_by_code', { p_code: code })
    const row = rows[0]
    return row ? { id: row.id, name: row.name } : null
  }

  async checkIn(code: string, displayName: string): Promise<Shift> {
    const client = await getClient()
    await this.ensureSession(client)
    // check_in returns every shift column plus kitchen_name directly (Task 3
    // fix round 1), so no second lookup is needed to name the kitchen.
    const row = await this.rpc<RawNamedShiftRow>(client, 'check_in', { p_code: code, p_name: displayName })
    return mapNamedShift(row)
  }

  async checkOut(code: string): Promise<Shift> {
    const client = await getClient()
    await this.ensureSession(client)
    // check_out returns kitchen_name too, including at an inactive kitchen
    // (the SQL looks the kitchen up without an active filter there, so a
    // volunteer who is already checked in can still check out and get a
    // real name back, not '').
    const row = await this.rpc<RawNamedShiftRow>(client, 'check_out', { p_code: code })
    return mapNamedShift(row)
  }

  async openShift(): Promise<Shift | null> {
    const client = await getClient()
    await this.ensureSession(client)
    const rows = await this.rpc<RawNamedShiftRow[]>(client, 'my_shifts', { p_since: EPOCH_DATE })
    const open = rows.find((r) => r.status === 'open')
    return open ? mapNamedShift(open) : null
  }

  async myShifts(sinceDate: string): Promise<Shift[]> {
    const client = await getClient()
    await this.ensureSession(client)
    const rows = await this.rpc<RawNamedShiftRow[]>(client, 'my_shifts', { p_since: sinceDate })
    return rows.map(mapNamedShift)
  }

  async kitchenShifts(slug: string, pin: string, day: string): Promise<KitchenShift[]> {
    const client = await getClient()
    const rows = await this.rpc<RawKitchenShiftRow[]>(client, 'kitchen_shifts', {
      p_slug: slug,
      p_pin: pin,
      p_day: day,
    })
    return rows.map(mapKitchenShift)
  }

  async decide(
    slug: string,
    pin: string,
    shiftId: string,
    d: { decision: 'confirm' | 'reject'; supervisor: string; reason?: string; checkOut?: string },
  ): Promise<KitchenShift> {
    const client = await getClient()
    const rows = await this.rpc<RawKitchenShiftRow[]>(client, 'decide_shift', {
      p_slug: slug,
      p_pin: pin,
      p_shift_id: shiftId,
      p_decision: d.decision,
      p_supervisor: d.supervisor,
      p_reason: d.reason ?? null,
      p_check_out: d.checkOut ?? null,
    })
    const row = rows[0]
    if (!row) throw new ShiftBackendError('not_found')
    return mapKitchenShift(row)
  }

  async posterCode(slug: string, pin: string): Promise<string> {
    const client = await getClient()
    return this.rpc<string>(client, 'poster_code', { p_slug: slug, p_pin: pin })
  }

  async rotateCode(slug: string, pin: string): Promise<string> {
    const client = await getClient()
    return this.rpc<string>(client, 'rotate_code', { p_slug: slug, p_pin: pin })
  }
}
