import { describe, expect, test, vi } from 'vitest'
import { prefersShareSheet, saveFile, type SaveEnv } from './save-file'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'

function env(over: Partial<SaveEnv> = {}): SaveEnv & { download: ReturnType<typeof vi.fn> } {
  return {
    userAgent: IPHONE,
    platform: 'iPhone',
    maxTouchPoints: 5,
    canShare: () => true,
    share: vi.fn(async () => {}),
    download: vi.fn(),
    ...over,
  } as SaveEnv & { download: ReturnType<typeof vi.fn> }
}

const pdf = () => new Blob(['%PDF-1.7'], { type: 'application/pdf' })

describe('saveFile', () => {
  test('iPhone with file sharing: the share sheet, with the file named', async () => {
    const e = env()
    expect(await saveFile(pdf(), 'packet.pdf', e)).toBe('shared')
    const data = (e.share as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(data.files[0].name).toBe('packet.pdf')
    expect(data.files[0].type).toBe('application/pdf')
    expect(e.download).not.toHaveBeenCalled()
  })

  test('iPad (reports a Mac with touch) counts as iPhone', async () => {
    const e = env({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', platform: 'MacIntel' })
    expect(await saveFile(pdf(), 'a.pdf', e)).toBe('shared')
  })

  test('closing the share sheet is cancelled, with no download', async () => {
    const e = env({ share: vi.fn(async () => Promise.reject(new DOMException('no', 'AbortError'))) })
    expect(await saveFile(pdf(), 'a.pdf', e)).toBe('cancelled')
    expect(e.download).not.toHaveBeenCalled()
  })

  test('Safari refusing the share (tap too long ago) falls back to the download', async () => {
    const e = env({ share: vi.fn(async () => Promise.reject(new DOMException('no', 'NotAllowedError'))) })
    expect(await saveFile(pdf(), 'a.pdf', e)).toBe('downloaded')
    expect(e.download).toHaveBeenCalledOnce()
  })

  test('Android, desktops, and iPhones without file sharing download as before', async () => {
    for (const e of [env({ userAgent: ANDROID, platform: 'Linux armv8l' }), env({ canShare: () => false }), env({ share: undefined })]) {
      expect(await saveFile(pdf(), 'a.pdf', e)).toBe('downloaded')
      expect(e.download).toHaveBeenCalledWith(expect.any(Blob), 'a.pdf')
    }
  })

  test('prefersShareSheet matches what saveFile would do', () => {
    expect(prefersShareSheet(env())).toBe(true)
    expect(prefersShareSheet(env({ userAgent: ANDROID, platform: 'Linux armv8l' }))).toBe(false)
    expect(prefersShareSheet(env({ canShare: () => { throw new TypeError('x') } }))).toBe(false)
  })
})
