// Browser-only access to the ShiftCred backend, shared by the volunteer check-in page
// (/k/[code]) and the kitchen dashboard (/kitchen/[slug]). The backend module (and, behind
// it, the Supabase or mock client) is `import()`ed lazily, so it loads only on the pages
// that call loadBackend(), and only after they mount: nothing here reaches `/` or
// `/screener`. Import this only from Client Components.
import { ShiftBackendError, type BackendErrorCode, type ShiftBackend } from './types'

let backendPromise: Promise<ShiftBackend> | null = null

export function loadBackend(): Promise<ShiftBackend> {
  backendPromise ??= import('./backend')
    .then((m) => m.getShiftBackend())
    .catch((err) => {
      backendPromise = null // a failed chunk load (no signal) can be retried
      throw err
    })
  return backendPromise
}

// Weak signal can leave a request hanging for minutes with a button stuck on "Checking in…"
// or "Saving…". After this long the page gives up and says there's no signal. Every call
// the pages retry is safe to repeat: check-in is idempotent, a repeated check-out finds
// nothing open, and a repeated decision on an already-decided shift comes back not_found.
export const REQUEST_TIMEOUT_MS = 20_000

export function withTimeout<T>(promise: Promise<T>, ms: number = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ShiftBackendError('network', 'timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

// Anything that isn't a backend error (a chunk that couldn't load, a dropped connection)
// is treated as no signal.
export function errorCode(err: unknown): BackendErrorCode {
  return err instanceof ShiftBackendError ? err.code : 'network'
}
