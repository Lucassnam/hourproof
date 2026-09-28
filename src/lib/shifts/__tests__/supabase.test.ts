// Contract tests for supabase.ts: with a fake `rpc`/`auth`, checks the exact
// RPC name and argument mapping for every method, and that every known SQL
// error message (see the migration's header comment) maps to the matching
// BackendErrorCode, with anything else falling back to 'network' (ruling 5).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()
const getSessionMock = vi.fn()
const signInAnonymouslyMock = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: rpcMock,
    auth: { getSession: getSessionMock, signInAnonymously: signInAnonymouslyMock },
  }),
}))

// Imported after the mock so supabase.ts's dynamic import() resolves to it.
const { SupabaseShiftBackend } = await import('../supabase')
const { ShiftBackendError } = await import('../types')

function ok(data: unknown) {
  return { data, error: null }
}
function fail(message: string) {
  return { data: null, error: { message } }
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  rpcMock.mockReset()
  getSessionMock.mockReset().mockResolvedValue({ data: { session: { access_token: 't' } } })
  signInAnonymouslyMock.mockReset().mockResolvedValue({ data: {}, error: null })
})

describe('SupabaseShiftBackend: RPC name and argument mapping', () => {
  it('kitchenByCode calls kitchen_by_code(p_code) and maps the first row to {id, name}; no rows -> null', async () => {
    rpcMock.mockResolvedValueOnce(ok([{ id: 'k1', name: 'Community Kitchen' }]))
    const backend = new SupabaseShiftBackend()
    const info = await backend.kitchenByCode('CODE123')
    expect(rpcMock).toHaveBeenCalledWith('kitchen_by_code', { p_code: 'CODE123' })
    expect(info).toEqual({ id: 'k1', name: 'Community Kitchen' })

    rpcMock.mockResolvedValueOnce(ok([]))
    expect(await backend.kitchenByCode('unknown')).toBeNull()
  })

  it('checkIn ensures a session (signs in anonymously if none), then calls check_in(p_code, p_name), then fills kitchenName from kitchen_by_code', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null } })
    rpcMock
      .mockResolvedValueOnce(
        ok({
          id: 's1',
          kitchen_id: 'k1',
          check_in: '2026-10-05T16:00:00Z',
          check_out: null,
          status: 'open',
          auto_closed: false,
          confirmed_by: null,
          reason: null,
        }),
      )
      .mockResolvedValueOnce(ok([{ id: 'k1', name: 'Community Kitchen' }]))

    const backend = new SupabaseShiftBackend()
    const shift = await backend.checkIn('CODE123', '  Ana  ')

    expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'check_in', { p_code: 'CODE123', p_name: '  Ana  ' })
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'kitchen_by_code', { p_code: 'CODE123' })
    expect(shift).toMatchObject({
      id: 's1',
      kitchenId: 'k1',
      kitchenName: 'Community Kitchen',
      checkIn: '2026-10-05T16:00:00Z',
      status: 'open',
    })
  })

  it('checkIn does not sign in anonymously when a session already exists', async () => {
    rpcMock
      .mockResolvedValueOnce(
        ok({
          id: 's1',
          kitchen_id: 'k1',
          check_in: '2026-10-05T16:00:00Z',
          check_out: null,
          status: 'open',
          auto_closed: false,
          confirmed_by: null,
          reason: null,
        }),
      )
      .mockResolvedValueOnce(ok([{ id: 'k1', name: 'Community Kitchen' }]))
    const backend = new SupabaseShiftBackend()
    await backend.checkIn('CODE123', 'Ana')
    expect(signInAnonymouslyMock).not.toHaveBeenCalled()
  })

  it('checkOut calls check_out(p_code) and fills kitchenName from kitchen_by_code', async () => {
    rpcMock
      .mockResolvedValueOnce(
        ok({
          id: 's1',
          kitchen_id: 'k1',
          check_in: '2026-10-05T16:00:00Z',
          check_out: '2026-10-05T19:00:00Z',
          status: 'pending',
          auto_closed: false,
          confirmed_by: null,
          reason: null,
        }),
      )
      .mockResolvedValueOnce(ok([{ id: 'k1', name: 'Community Kitchen' }]))
    const backend = new SupabaseShiftBackend()
    const shift = await backend.checkOut('CODE123')
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'check_out', { p_code: 'CODE123' })
    expect(shift).toMatchObject({ id: 's1', status: 'pending', kitchenName: 'Community Kitchen' })
  })

  it("openShift calls my_shifts with a far-past p_since (there's no open_shift RPC) and filters for status open", async () => {
    rpcMock.mockResolvedValueOnce(
      ok([
        {
          id: 's0',
          kitchen_id: 'k1',
          check_in: '2026-09-01T00:00:00Z',
          check_out: '2026-09-01T03:00:00Z',
          status: 'confirmed',
          auto_closed: false,
          confirmed_by: 'Sup',
          reason: null,
          kitchen_name: 'Community Kitchen',
        },
        {
          id: 's1',
          kitchen_id: 'k1',
          check_in: '2026-10-05T16:00:00Z',
          check_out: null,
          status: 'open',
          auto_closed: false,
          confirmed_by: null,
          reason: null,
          kitchen_name: 'Community Kitchen',
        },
      ]),
    )
    const backend = new SupabaseShiftBackend()
    const open = await backend.openShift()
    expect(rpcMock).toHaveBeenCalledWith('my_shifts', { p_since: '1970-01-01' })
    expect(open).toMatchObject({ id: 's1', status: 'open' })
  })

  it('openShift returns null when there is no open shift', async () => {
    rpcMock.mockResolvedValueOnce(ok([]))
    const backend = new SupabaseShiftBackend()
    expect(await backend.openShift()).toBeNull()
  })

  it('myShifts calls my_shifts(p_since) and maps every row (no volunteerName field)', async () => {
    rpcMock.mockResolvedValueOnce(
      ok([
        {
          id: 's1',
          kitchen_id: 'k1',
          check_in: '2026-10-05T16:00:00Z',
          check_out: '2026-10-05T19:00:00Z',
          status: 'confirmed',
          auto_closed: false,
          confirmed_by: 'Sup',
          reason: null,
          kitchen_name: 'Community Kitchen',
        },
      ]),
    )
    const backend = new SupabaseShiftBackend()
    const shifts = await backend.myShifts('2026-10-01')
    expect(rpcMock).toHaveBeenCalledWith('my_shifts', { p_since: '2026-10-01' })
    expect(shifts).toHaveLength(1)
    expect(shifts[0]).not.toHaveProperty('volunteerName')
    expect(shifts[0]).toMatchObject({ id: 's1', kitchenName: 'Community Kitchen' })
  })

  it('kitchenShifts calls kitchen_shifts(p_slug, p_pin, p_day) over POST (no { get: true }) and maps volunteerName', async () => {
    rpcMock.mockResolvedValueOnce(
      ok([
        {
          id: 's1',
          kitchen_id: 'k1',
          check_in: '2026-10-05T16:00:00Z',
          check_out: '2026-10-05T19:00:00Z',
          status: 'pending',
          auto_closed: false,
          confirmed_by: null,
          reason: null,
          kitchen_name: 'Community Kitchen',
          volunteer_name: 'Ana',
        },
      ]),
    )
    const backend = new SupabaseShiftBackend()
    const shifts = await backend.kitchenShifts('community-kitchen', '123456', '2026-10-05')
    expect(rpcMock).toHaveBeenCalledWith('kitchen_shifts', { p_slug: 'community-kitchen', p_pin: '123456', p_day: '2026-10-05' })
    // Exactly (name, args): no third "options" argument (never { get: true }).
    expect(rpcMock.mock.calls[0]).toHaveLength(2)
    expect(shifts[0]).toMatchObject({ id: 's1', volunteerName: 'Ana' })
    // A PIN RPC never needs a session.
    expect(getSessionMock).not.toHaveBeenCalled()
  })

  it('decide calls decide_shift with every argument, defaulting reason/checkOut to null, and returns the one row', async () => {
    rpcMock.mockResolvedValueOnce(
      ok([
        {
          id: 's1',
          kitchen_id: 'k1',
          check_in: '2026-10-05T16:00:00Z',
          check_out: '2026-10-05T19:00:00Z',
          status: 'confirmed',
          auto_closed: false,
          confirmed_by: 'Maria',
          reason: null,
          kitchen_name: 'Community Kitchen',
          volunteer_name: 'Ana',
        },
      ]),
    )
    const backend = new SupabaseShiftBackend()
    const decided = await backend.decide('community-kitchen', '123456', 's1', { decision: 'confirm', supervisor: 'Maria' })
    expect(rpcMock).toHaveBeenCalledWith('decide_shift', {
      p_slug: 'community-kitchen',
      p_pin: '123456',
      p_shift_id: 's1',
      p_decision: 'confirm',
      p_supervisor: 'Maria',
      p_reason: null,
      p_check_out: null,
    })
    expect(decided).toMatchObject({ id: 's1', status: 'confirmed', volunteerName: 'Ana' })
  })

  it('decide raises not_found if decide_shift returns no rows', async () => {
    rpcMock.mockResolvedValueOnce(ok([]))
    const backend = new SupabaseShiftBackend()
    await expect(
      backend.decide('community-kitchen', '123456', 's1', { decision: 'confirm', supervisor: 'Maria' }),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('posterCode calls poster_code(p_slug, p_pin) and returns the scalar directly', async () => {
    rpcMock.mockResolvedValueOnce(ok('CODE-XYZ'))
    const backend = new SupabaseShiftBackend()
    const code = await backend.posterCode('community-kitchen', '123456')
    expect(rpcMock).toHaveBeenCalledWith('poster_code', { p_slug: 'community-kitchen', p_pin: '123456' })
    expect(code).toBe('CODE-XYZ')
  })

  it('rotateCode calls rotate_code(p_slug, p_pin) and returns the scalar directly', async () => {
    rpcMock.mockResolvedValueOnce(ok('CODE-NEW'))
    const backend = new SupabaseShiftBackend()
    const code = await backend.rotateCode('community-kitchen', '123456')
    expect(rpcMock).toHaveBeenCalledWith('rotate_code', { p_slug: 'community-kitchen', p_pin: '123456' })
    expect(code).toBe('CODE-NEW')
  })
})

describe('SupabaseShiftBackend: error-code mapping', () => {
  const knownCodes = [
    'not_found',
    'already_open_elsewhere',
    'not_checked_in',
    'bad_pin',
    'locked',
    'needs_correction',
    'bad_name',
  ] as const

  it.each(knownCodes)('maps the raised message "%s" straight through', async (code) => {
    rpcMock.mockResolvedValueOnce(fail(code))
    const backend = new SupabaseShiftBackend()
    await expect(backend.posterCode('slug', '123456')).rejects.toMatchObject({ code })
  })

  it('maps an unrecognized message (e.g. "permission denied") to network', async () => {
    rpcMock.mockResolvedValueOnce(fail('permission denied for function poster_code'))
    const backend = new SupabaseShiftBackend()
    await expect(backend.posterCode('slug', '123456')).rejects.toMatchObject({ code: 'network' })
  })

  it('maps a thrown/rejected rpc call (e.g. a network failure) to network', async () => {
    rpcMock.mockRejectedValueOnce(new Error('fetch failed'))
    const backend = new SupabaseShiftBackend()
    await expect(backend.posterCode('slug', '123456')).rejects.toMatchObject({ code: 'network' })
  })
})
