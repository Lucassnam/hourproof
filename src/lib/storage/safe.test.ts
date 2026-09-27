import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { safeGet, safeRemove, safeSet, setLocaleCookie } from './safe'

describe('safeGet/safeSet/safeRemove with a throwing storage', () => {
  const originalLocalStorage = globalThis.localStorage
  const originalSessionStorage = globalThis.sessionStorage

  beforeEach(() => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    // @ts-expect-error partial stub is enough for these tests
    globalThis.localStorage = throwing
    // @ts-expect-error partial stub is enough for these tests
    globalThis.sessionStorage = throwing
  })

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage
    globalThis.sessionStorage = originalSessionStorage
  })

  it('safeGet returns null instead of throwing', () => {
    expect(safeGet('local', 'k')).toBeNull()
    expect(safeGet('session', 'k')).toBeNull()
  })

  it('safeSet does not throw', () => {
    expect(() => safeSet('local', 'k', 'v')).not.toThrow()
    expect(() => safeSet('session', 'k', 'v')).not.toThrow()
  })

  it('safeRemove does not throw', () => {
    expect(() => safeRemove('local', 'k')).not.toThrow()
    expect(() => safeRemove('session', 'k')).not.toThrow()
  })
})

describe('safeGet/safeSet/safeRemove with a working storage', () => {
  const originalLocalStorage = globalThis.localStorage
  const originalSessionStorage = globalThis.sessionStorage

  function makeMemoryStorage(): Storage {
    const map = new Map<string, string>()
    return {
      getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
      setItem: (key: string, value: string) => {
        map.set(key, value)
      },
      removeItem: (key: string) => {
        map.delete(key)
      },
      clear: () => map.clear(),
      key: (index: number) => Array.from(map.keys())[index] ?? null,
      get length() {
        return map.size
      },
    }
  }

  beforeEach(() => {
    globalThis.localStorage = makeMemoryStorage()
    globalThis.sessionStorage = makeMemoryStorage()
  })

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage
    globalThis.sessionStorage = originalSessionStorage
  })

  it('round-trips a value through local storage', () => {
    safeSet('local', 'k', 'v')
    expect(safeGet('local', 'k')).toBe('v')
    safeRemove('local', 'k')
    expect(safeGet('local', 'k')).toBeNull()
  })

  it('round-trips a value through session storage', () => {
    safeSet('session', 'k', 'v')
    expect(safeGet('session', 'k')).toBe('v')
    safeRemove('session', 'k')
    expect(safeGet('session', 'k')).toBeNull()
  })
})

describe('setLocaleCookie', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { cookie: '' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('writes NEXT_LOCALE with path=/, 1 year max-age, and SameSite=Lax', () => {
    setLocaleCookie('es')
    expect(document.cookie).toContain('NEXT_LOCALE=es')
    expect(document.cookie).toContain('path=/')
    expect(document.cookie).toContain('max-age=31536000')
    expect(document.cookie).toContain('SameSite=Lax')
  })

  it('does not throw when document is unavailable', () => {
    vi.unstubAllGlobals()
    const original = globalThis.document
    // @ts-expect-error simulate no DOM
    delete globalThis.document
    expect(() => setLocaleCookie('en')).not.toThrow()
    globalThis.document = original
  })
})
