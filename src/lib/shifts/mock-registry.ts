// The one mock ShiftCred world per server process, shared by the /api/mock-shifts route and
// the kitchen poster's server actions (src/app/kitchen/[slug]/poster/actions.ts).
//
// Why globalThis and not a module-level variable: Next compiles the route handler and each
// page's server actions into separate server bundles, and a module both of them import can
// be instantiated once per bundle. A module-level Map would then give the poster page a
// different world from the volunteer's /k page, and rotating a code there would not stop
// the old poster. A well-known symbol on globalThis is one Map for the whole process.
//
// Only ever reached when HOURPROOF_MOCK_SHIFTS=1 (dev and e2e); see the callers.
import { createMockRegistry, type MockRegistry } from './mock-server'

const KEY = Symbol.for('hourproof.mockShiftsRegistry')

export function sharedMockRegistry(): MockRegistry {
  const g = globalThis as typeof globalThis & { [KEY]?: MockRegistry }
  g[KEY] ??= createMockRegistry()
  return g[KEY]
}
