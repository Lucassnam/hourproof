import { describe, expect, test } from 'vitest'
import { checkInUrl, posterOrigin } from '../poster-url'

const headers = (h: Record<string, string>) => ({ get: (name: string) => h[name] ?? null })
const preview = headers({ host: 'hourproof-git-branch-abc123.vercel.app', 'x-forwarded-host': 'hourproof-git-branch-abc123.vercel.app', 'x-forwarded-proto': 'https' })

describe('posterOrigin', () => {
  test('NEXT_PUBLIC_SITE_URL wins over everything, reduced to its origin', () => {
    expect(posterOrigin({ NEXT_PUBLIC_SITE_URL: 'https://hourproof.org/', VERCEL_PROJECT_PRODUCTION_URL: 'hp.vercel.app' }, preview, true)).toBe(
      'https://hourproof.org',
    )
    expect(posterOrigin({ NEXT_PUBLIC_SITE_URL: 'https://hourproof.org/some/path' }, preview, false)).toBe('https://hourproof.org')
  })

  test('a NEXT_PUBLIC_SITE_URL that is not an http(s) URL gives no origin rather than a guess', () => {
    expect(posterOrigin({ NEXT_PUBLIC_SITE_URL: 'hourproof.org' }, preview, true)).toBeNull()
    expect(posterOrigin({ NEXT_PUBLIC_SITE_URL: 'javascript:alert(1)' }, preview, true)).toBeNull()
  })

  test("then Vercel's production domain, never the preview host the request came in on", () => {
    expect(posterOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'hourproof.vercel.app' }, preview, false)).toBe('https://hourproof.vercel.app')
    expect(posterOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'evil.example/path' }, preview, true)).toBeNull()
  })

  test('the request host only when allowed (development and e2e)', () => {
    expect(posterOrigin({}, preview, false)).toBeNull()
    expect(posterOrigin({}, headers({ host: 'localhost:7051' }), true)).toBe('http://localhost:7051')
    expect(posterOrigin({}, headers({ host: 'localhost:7051', 'x-forwarded-proto': 'https' }), true)).toBe('https://localhost:7051')
    expect(posterOrigin({}, headers({ host: 'a.example', 'x-forwarded-host': 'b.example, c.example' }), true)).toBe('https://b.example')
    expect(posterOrigin({}, headers({ host: 'bad host/x' }), true)).toBeNull()
    expect(posterOrigin({}, headers({}), true)).toBeNull()
  })
})

describe('checkInUrl', () => {
  test('is <origin>/k/<code>, with the code encoded', () => {
    expect(checkInUrl('https://hourproof.org', 'TESTCODE-0000000000000')).toBe('https://hourproof.org/k/TESTCODE-0000000000000')
    expect(checkInUrl('https://hourproof.org', 'a/b')).toBe('https://hourproof.org/k/a%2Fb')
  })
})
