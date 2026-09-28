// Picks the ShiftBackend the UI should use, per the plan:
//   - 'supabase' when both public Supabase env vars are set (a real deploy)
//   - else 'mock' when NEXT_PUBLIC_HOURPROOF_BACKEND === 'mock' (local/e2e)
//   - else 'unavailable' (every method throws ShiftBackendError('unavailable'))
//
// Neither branch's implementation module pulls its real dependency
// (@supabase/supabase-js, or even mock-server.ts's runtime code) into
// whatever bundle imports this file: supabase.ts only `import()`s
// supabase-js lazily inside its methods, and mock-client.ts only imports
// mock-server.ts's *types*. Verified with `npm run build && npm run measure`.
import { MockShiftBackend } from './mock-client'
import { SupabaseShiftBackend } from './supabase'
import { ShiftBackendError, type Shift, type ShiftBackend } from './types'

class UnavailableShiftBackend implements ShiftBackend {
  readonly kind = 'unavailable' as const

  private fail(): never {
    throw new ShiftBackendError('unavailable')
  }

  kitchenByCode = (): Promise<never> => this.fail()
  checkIn = (): Promise<Shift> => this.fail()
  checkOut = (): Promise<Shift> => this.fail()
  openShift = (): Promise<never> => this.fail()
  myShifts = (): Promise<never> => this.fail()
  kitchenShifts = (): Promise<never> => this.fail()
  decide = (): Promise<never> => this.fail()
  posterCode = (): Promise<never> => this.fail()
  rotateCode = (): Promise<never> => this.fail()
}

export function getShiftBackend(): ShiftBackend {
  const hasSupabaseEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  if (hasSupabaseEnv) return new SupabaseShiftBackend()
  if (process.env.NEXT_PUBLIC_HOURPROOF_BACKEND === 'mock') return new MockShiftBackend()
  return new UnavailableShiftBackend()
}
