// The mock ShiftCred backend's HTTP endpoint. Exists only so the in-browser
// mock client (src/lib/shifts/mock-client.ts) and e2e can drive the same
// in-memory state machine (src/lib/shifts/mock-server.ts) that Node-side
// contract tests exercise directly. Returns 404 whenever
// HOURPROOF_MOCK_SHIFTS isn't exactly '1' (ruling 6), so this never becomes
// live surface area in a real deployment.
import { NextResponse } from 'next/server'
import {
  createMockRegistry,
  handle,
  normalizeNamespace,
  reset,
  stateFor,
  type MockArgs,
  type MockOp,
} from '@/lib/shifts/mock-server'
import { ShiftBackendError } from '@/lib/shifts/types'

// One in-memory state per namespace (the `x-hp-mock-ns` header; 'default' without it),
// each mirroring one Supabase project. Module-level so it survives across requests within
// the same server instance. e2e gives every test its own namespace, so parallel tests
// can't reset or see each other's data (Task 4 fix round 1, ruling 3).
const registry = createMockRegistry()

export async function POST(request: Request) {
  if (process.env.HOURPROOF_MOCK_SHIFTS !== '1') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  let body: { op?: unknown; args?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'network' }, { status: 400 })
  }

  const state = stateFor(registry, normalizeNamespace(request.headers.get('x-hp-mock-ns')))

  if (body.op === 'reset') {
    const opts = (body.args ?? {}) as { seedSecondKitchen?: boolean }
    reset(state, opts)
    return NextResponse.json({ ok: true })
  }

  const volunteerId = request.headers.get('x-hp-volunteer') ?? undefined
  // e2e time travel only (ruling 6): lets a test move `now` without waiting
  // for real minutes to pass (e.g. the PIN lockout window, auto-close).
  const nowHeader = request.headers.get('x-hp-now')
  const now = nowHeader ? new Date(nowHeader) : new Date()

  try {
    const result = handle(state, body.op as MockOp, (body.args ?? {}) as MockArgs[MockOp], volunteerId, now)
    return NextResponse.json({ result })
  } catch (err) {
    if (err instanceof ShiftBackendError) {
      return NextResponse.json({ error: err.code }, { status: 400 })
    }
    return NextResponse.json({ error: 'network' }, { status: 500 })
  }
}
