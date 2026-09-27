// Shared storage helpers. localStorage/sessionStorage can throw (private browsing, storage
// disabled, quota exceeded) and every call site in this app already wrapped every access in
// its own try/catch with slightly different comments. These helpers centralize that guard so
// behavior stays identical (get returns null on failure, set/remove are silent no-ops) without
// repeating the try/catch at every call site.

export type Area = 'local' | 'session'

function storageFor(area: Area): Storage {
  return area === 'local' ? globalThis.localStorage : globalThis.sessionStorage
}

export function safeGet(area: Area, key: string): string | null {
  try {
    return storageFor(area).getItem(key)
  } catch {
    // Storage may be unavailable or throw (e.g. private mode); treat as "nothing stored".
    return null
  }
}

export function safeSet(area: Area, key: string, value: string): void {
  try {
    storageFor(area).setItem(key, value)
  } catch {
    // Storage may throw; the caller still works for this page view without persistence.
  }
}

export function safeRemove(area: Area, key: string): void {
  try {
    storageFor(area).removeItem(key)
  } catch {
    // Nothing to do if storage isn't available.
  }
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

// Sets the NEXT_LOCALE cookie the same way client-side, for use where a Server Action round
// trip isn't already happening. path=/, 1 year, SameSite=Lax.
export function setLocaleCookie(locale: 'en' | 'es'): void {
  try {
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`
  } catch {
    // document may be unavailable (e.g. during SSR); nothing to do.
  }
}
