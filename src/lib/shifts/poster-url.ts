// The address a kitchen's QR poster encodes: <origin>/k/<code>. A printed poster hangs on a
// wall for months, so it must never encode a preview or deployment-specific host (those
// change or disappear). The origin comes from, in order:
//   1. NEXT_PUBLIC_SITE_URL (the canonical site, e.g. https://hourproof.example), if set.
//      A value that isn't an http(s) URL is a misconfiguration: no poster, not a guess.
//   2. https://$VERCEL_PROJECT_PRODUCTION_URL (Vercel sets it on every deployment, previews
//      included, to the project's production domain).
//   3. Only in development and e2e (`allowRequestHost`): the host this request came in on
//      (x-forwarded-host, else host), so localhost posters work.
// Pure (env and headers are passed in), so it's unit-tested without a server.

export type PosterUrlEnv = {
  NEXT_PUBLIC_SITE_URL?: string
  VERCEL_PROJECT_PRODUCTION_URL?: string
}

type HeaderReader = { get(name: string): string | null }

const HOST = /^[A-Za-z0-9.-]{1,253}(:\d{1,5})?$/

function firstValue(v: string | null): string | null {
  const first = v?.split(',')[0]?.trim()
  return first ? first : null
}

export function posterOrigin(env: PosterUrlEnv, headers: HeaderReader, allowRequestHost: boolean): string | null {
  const site = env.NEXT_PUBLIC_SITE_URL?.trim()
  if (site) {
    try {
      const u = new URL(site)
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null
    } catch {
      return null
    }
  }

  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return HOST.test(vercel) ? `https://${vercel}` : null

  if (!allowRequestHost) return null
  const host = firstValue(headers.get('x-forwarded-host')) ?? firstValue(headers.get('host'))
  if (!host || !HOST.test(host)) return null
  const forwarded = firstValue(headers.get('x-forwarded-proto'))
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
  const proto = forwarded === 'http' || forwarded === 'https' ? forwarded : local ? 'http' : 'https'
  return `${proto}://${host}`
}

export function checkInUrl(origin: string, code: string): string {
  return `${origin}/k/${encodeURIComponent(code)}`
}
