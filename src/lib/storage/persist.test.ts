import { afterEach, describe, expect, test, vi } from 'vitest'
import { installAdvice, requestPersistence } from './persist'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestPersistence', () => {
  test('asks the browser to keep this site’s storage, once it isn’t already kept', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('navigator', { storage: { persisted: vi.fn().mockResolvedValue(false), persist } })
    expect(await requestPersistence()).toBe('granted')
    expect(persist).toHaveBeenCalledTimes(1)
  })

  test('does not ask again when storage is already kept', async () => {
    const persist = vi.fn()
    vi.stubGlobal('navigator', { storage: { persisted: vi.fn().mockResolvedValue(true), persist } })
    expect(await requestPersistence()).toBe('granted')
    expect(persist).not.toHaveBeenCalled()
  })

  test('reports a refusal, a missing API and a thrown error without throwing', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: vi.fn().mockResolvedValue(false), persist: vi.fn().mockResolvedValue(false) } })
    expect(await requestPersistence()).toBe('denied')
    vi.stubGlobal('navigator', {})
    expect(await requestPersistence()).toBe('unsupported')
    vi.stubGlobal('navigator', { storage: { persisted: vi.fn().mockRejectedValue(new Error('blocked')), persist: vi.fn() } })
    expect(await requestPersistence()).toBe('unsupported')
  })
})

describe('installAdvice', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
  const base = { platform: '', maxTouchPoints: 0, standalone: false, canPrompt: false }

  test('nothing to say once the app runs from the Home Screen', () => {
    expect(installAdvice({ ...base, userAgent: iphone, standalone: true })).toBe('none')
    expect(installAdvice({ ...base, userAgent: android, standalone: true, canPrompt: true })).toBe('none')
  })

  test('iPhone and iPad get the Share-menu steps (iPadOS reports itself as a Mac with touch)', () => {
    expect(installAdvice({ ...base, userAgent: iphone })).toBe('ios')
    expect(installAdvice({ ...base, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios')
  })

  test('a browser that offered an install prompt gets the button; any other gets nothing', () => {
    expect(installAdvice({ ...base, userAgent: android, canPrompt: true })).toBe('prompt')
    expect(installAdvice({ ...base, userAgent: android })).toBe('none')
    expect(installAdvice({ ...base, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel' })).toBe('none')
  })
})
