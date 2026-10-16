// Keeps the free Supabase project awake until results come out (Jan 15, 2027). Supabase
// pauses a free project after about a week without database activity.
//
// Vercel Cron calls this once a day (vercel.json). The GitHub workflow
// (.github/workflows/keepalive.yml) does the same every 3 days, but GitHub turns scheduled
// workflows off after 60 days without a commit; this one runs as long as the production
// deployment exists.
//
// It calls the database's ping() with the public key the site already ships, so there is
// nothing to protect. If CRON_SECRET is set in Vercel, Vercel sends it as a bearer token
// and anything else is refused, which keeps strangers from making it call Supabase.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ ok: false }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return Response.json({ ok: false, error: 'not_configured' }, { status: 503 })
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc/ping`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    const body = await res.text()
    const ok = res.ok && body.trim() === '1'
    return Response.json({ ok }, { status: ok ? 200 : 502 })
  } catch {
    return Response.json({ ok: false }, { status: 502 })
  }
}
