# Phase 1 Gate Report — HourProof Foundation Screener

**Date:** 2026-09-25
**Branch:** `phase-1`
**Scope:** Tasks 1-7 of the Phase 1 plan (`.superpowers/sdd/2026-09-25-phase1-foundation-screener/`)

## Controller ruling on this task

Task 7's brief calls for a Vercel preview deploy in Step 3. The controller ruled
**do not deploy** for this run: no `vercel`, `vercel link`, `vercel deploy`, and
no `git push`. The first deploy needs the user's explicit approval, since it
creates a public URL under their Vercel account.

**Preview URL: pending user approval.**

The commands the deploy will use, once approved:

```bash
vercel link      # link this repo to a Vercel project (first time only)
vercel deploy    # creates a preview deployment, prints its URL
```

After that preview is up, the brief calls for opening it on a phone and
running the six e2e flows by hand (the same flows already covered by
`npm run e2e`, see below).

## Test results (real command output, exit codes captured with `$?`)

### Unit tests — `npm test`

```
> test
> vitest run

 RUN  v5.0.2 /Users/coolio_999/Desktop/Active/hourproof

 Test Files  7 passed (7)
      Tests  106 passed (106)
   Start at  22:39:49
   Duration  205ms (transform 47%, import 41%, worker 6%, tests 6%)
```

Exit code: `0`

### Typecheck — `npm run typecheck`

```
> typecheck
> tsc --noEmit
```

Exit code: `0`

### Build (with prebuild rules validation) — `npm run build`

```
> prebuild
> vitest run src/lib/rules

 Test Files  3 passed (3)
      Tests  44 passed (44)

> build
> next build

▲ Next.js 16.3.6 (Turbopack)
✓ Compiled successfully in 886ms
  Running TypeScript ...
  Finished TypeScript in 354ms ...
  Collecting page data using 6 workers ...
✓ Generating static pages using 6 workers (5/5) in 279ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ○ /manifest.webmanifest
└ ƒ /screener
```

Exit code: `0`

Note: Next 16.3.6's build output no longer prints a per-route "First Load JS"
size table (confirmed by reading the actual output above — only the ○/ƒ
static/dynamic markers are shown). The JS budget was measured directly
instead (below).

### End-to-end tests — `npm run e2e`

```
> e2e
> playwright test

Running 7 tests using 6 workers

  ✓  2 [chromium] › e2e/screener.spec.ts:99:5 › Unsure on question 1 leads to the ask-county result with a tel: link (828ms)
  ✓  6 [chromium] › e2e/screener.spec.ts:84:5 › Spanish: shows 'Sí' and the Spanish not-a-decision line on a result (828ms)
  ✓  3 [chromium] › e2e/screener.spec.ts:68:5 › Reloading on question 3 resumes at question 3 (878ms)
  ✓  5 [chromium] › e2e/screener.spec.ts:33:5 › Pregnant path shows possibly-exempt result and never shows 'likely exempt' text (902ms)
  ✓  4 [chromium] › e2e/screener.spec.ts:46:5 › Back after a result returns to the question that produced it, not the result (962ms)
  ✓  7 [chromium] › e2e/screener.spec.ts:114:5 › A blocked sessionStorage does not break the screener (233ms)
  ✓  1 [chromium] › e2e/screener.spec.ts:17:5 › English: answering no to everything until meeting_80_hours, then yes, shows the meeting-requirement result (1.4s)

  7 passed (7.2s)
```

Exit code: `0`

After the e2e run, `lsof -i :7050` returned nothing and `ps aux | grep "next start"`
returned nothing — no stray server left running on port 7050.

## JS budget check

Spec: "First load under 200 KB of JS on the home route." The task brief also
expects `/screener` under 200 KB.

Since `next build`'s log has no per-route size column in this Next version,
`scripts/measure-js.mjs` was written to measure it directly: launch a
Chromium page via Playwright against the production server (`npm run build
&& npm start` on port 7050), navigate to each route, and sum the transferred
bytes of every JS response (`response.request().sizes()`, which reflects
compression) plus the decoded/uncompressed body size for reference. Re-run
with `node scripts/measure-js.mjs` any time the bundle changes.

**First pass (before this task's fix):**

| Route | Transferred | vs 200 KB budget |
|---|---|---|
| `/` | 149.9 KB | OK |
| `/screener` | 241.4 KB | **41.4 KB over** |

Root cause: `src/app/screener/Screener.tsx` is a Client Component
(`"use client"`) that imported `ruleSet` from `@/lib/rules/load`, which in
turn does a *value* import of `parseRuleSet` from `@/lib/rules/schema` — a
zod schema. Because the import was a value import (not `import type`), the
zod library and the full schema-validation code shipped to the browser
bundle just to re-validate data that had already been validated at build
time (`npm run build`'s `prebuild` step runs `vitest run src/lib/rules`
against the same file).

**Fix applied:**
- `src/app/screener/page.tsx` (a Server Component, no `"use client"`) now
  imports `ruleSet` from `@/lib/rules/load` itself and passes it down as a
  plain prop: `<Screener ruleSet={ruleSet} />`. The validation and the zod
  import now run only on the server.
- `src/app/screener/Screener.tsx` no longer imports `@/lib/rules/load` at
  all. It imports `RuleSet` from `@/lib/rules/schema` as a **type-only**
  import (`import type { RuleSet } from "@/lib/rules/schema"`), which is
  erased at compile time and adds zero runtime bytes. `Screener` now takes
  `ruleSet` as a parameter instead of reading a module-level constant.

**Second pass (after the fix):**

| Route | JS files | Transferred | Decoded (uncompressed) | vs 200 KB budget |
|---|---|---|---|---|
| `/` | 7 | 149.9 KB | 494.0 KB | OK (50.1 KB headroom) |
| `/screener` | 7 | 147.7 KB | 489.1 KB | OK (52.3 KB headroom) |

`node scripts/measure-js.mjs` exit code: `0` ("all measured routes are
within the 200 KB JS budget").

`next start` does not gzip responses in this project (no compression
middleware configured), so the "transferred" and "decoded" numbers above
differ only because "transferred" also counts response headers per file;
the actual wire bytes would be smaller behind a compressing host/CDN (e.g.
Vercel, which gzips/brotlis by default) — the 149-150 KB figures here are
effectively an uncompressed-transport upper bound, not a best case.

Full per-file breakdown from the second pass:

```
Route /
  149.9 KB total:
    70.4 KB  /_next/static/chunks/0bma92pht_c97.js
    46.4 KB  /_next/static/chunks/1z99mlp5cofct.js
    12.2 KB  /_next/static/chunks/3zpv-smfm7y5p.js
     7.5 KB  /_next/static/chunks/1u5zan5bs9a7v.js
     5.2 KB  /_next/static/chunks/27nk6dt-wmy40.js
     4.1 KB  /_next/static/chunks/turbopack-3ookby65335ia.js
     4.0 KB  /_next/static/chunks/2_b75x8woym56.js

Route /screener
  147.7 KB total:
    70.4 KB  /_next/static/chunks/0bma92pht_c97.js
    46.4 KB  /_next/static/chunks/1z99mlp5cofct.js
    12.2 KB  /_next/static/chunks/3zpv-smfm7y5p.js
     7.5 KB  /_next/static/chunks/1u5zan5bs9a7v.js
     4.1 KB  /_next/static/chunks/turbopack-3ookby65335ia.js
     4.0 KB  /_next/static/chunks/2_b75x8woym56.js
     3.0 KB  /_next/static/chunks/29_biy2o21244.js
```

The two large shared chunks (70.4 KB, 46.4 KB) are React 19 + the Next
runtime + next-intl's client provider, common to every route; they are not
screener-specific and were not a target for this task's fix.

## PWA manifest

- `src/app/manifest.ts` — a generated manifest (`MetadataRoute.Manifest`),
  not a static `public/manifest.webmanifest` file. Confirmed against
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`:
  Next 16 supports both, and the generated form was chosen so the
  `background_color`/`theme_color` values can import directly from
  `src/lib/theme/tokens.ts` instead of duplicating the hex values.
- `src/app/layout.tsx` now exports `viewport: Viewport` with
  `themeColor: tokens.light.bg` (`#F6F7F9`). Per
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`,
  `theme-color` belongs on the `viewport` export in Next 16, not as a raw
  `<meta>` tag and not on the `Metadata` object. Also added a `metadata`
  export with `title`/`description` (previously missing entirely).
- Verified against a running `npm start` server:
  - `GET /manifest.webmanifest` returns the expected JSON (`name`,
    `short_name`, `start_url: "/"`, `display: "standalone"`,
    `background_color`/`theme_color` both `#F6F7F9`, three icon entries).
  - The rendered `/` page's `<head>` contains
    `<link rel="manifest" href="/manifest.webmanifest"/>` and
    `<meta name="theme-color" content="#F6F7F9"/>`, both auto-injected by
    Next from the file conventions above (no manual `<head>` wiring needed).
  - `/icon-192.png`, `/icon-512.png`, `/icon-512-maskable.png` all return
    `200 image/png`.

Light was chosen as the manifest/viewport color because it's the app's
default theme — `layout.tsx`'s boot script only ever flips `data-theme` to
`"dark"` when `localStorage` says so; it never sets light explicitly, so
light is the true default.

## Icon

`scripts/icon-source.svg` and `scripts/icon-source-maskable.svg` are the
authored SVGs; PNGs were rendered with `rsvg-convert` (available locally) to
`public/icon-192.png`, `public/icon-512.png`, and `public/icon-512-maskable.png`.

Design: a clock ring (drawn as a circle with `stroke-dasharray` leaving a
gap) with two short clock hands, in proof green `#127A52` on the light
background `#F6F7F9`. The ring's gap is filled by a checkmark stroke of
matching color/weight, meant to read as "time verified."

**Honest legibility note (viewed via the Read tool at both 192px and 512px,
per the brief's instruction):** the clock face itself reads clearly at both
sizes. The checkmark is less unambiguous than intended — because it's the
same stroke weight/color as the ring and sits where the ring's arc would
otherwise continue, it can be read as an arrowhead/swoosh completing the
circle rather than a distinct checkmark, especially at 192px. Two rounds of
adjustment (widening the gap, changing the checkmark's proportions and
angle) improved but did not fully resolve this. The icon is legible as "a
clock" — which is the core brand association — but a designer pass (e.g. a
genuinely separated checkmark badge, or a different color for the check)
would sharpen the "verified/proof" half of the concept. Flagging this as a
concern rather than treating it as fully resolved.

**Maskable icon:** `public/icon-512-maskable.png`, `purpose: "maskable"` in
the manifest. The glyph is scaled to 72% and centered, keeping all content
within the ~80% "safe zone" circle (radius ~205px of 256px half-width) that
Android/other OS masks (circle, squircle, rounded square) crop to, so the
icon isn't clipped when the OS applies its own shape.

## Files changed

- `src/app/manifest.ts` (new)
- `src/app/layout.tsx` (modified — added `metadata`/`viewport` exports)
- `src/app/screener/page.tsx` (modified — now a data-loading Server
  Component, passes `ruleSet` down as a prop)
- `src/app/screener/Screener.tsx` (modified — takes `ruleSet` as a prop
  instead of importing it; drops the value import of `@/lib/rules/load`)
- `public/icon-192.png`, `public/icon-512.png`, `public/icon-512-maskable.png` (new)
- `scripts/icon-source.svg`, `scripts/icon-source-maskable.svg` (new — source
  SVGs, kept for future re-rendering)
- `scripts/measure-js.mjs` (new — re-runnable JS budget script)
- `docs/plans/phase1-gate.md` (this file)
- `docs/AI-USE.md` (new row for this task)

## Screenshots

16 screenshots exist at `docs/screenshots/phase1/` (captured and reviewed
during Task 6, unchanged by this task):

```
home-dark.png                          question-es-light.png
home-light.png                         result-ask_county-dark.png
question-dark.png                      result-ask_county-light.png
question-es-dark.png                   result-es-light.png
question-light.png                     result-meeting_requirement-dark.png
                                        result-meeting_requirement-light.png
                                        result-not_subject-dark.png
                                        result-not_subject-light.png
                                        result-possibly_exempt-dark.png
                                        result-possibly_exempt-light.png
                                        result-subject-dark.png
                                        result-subject-light.png
```

No new screenshots were added for this task: the PWA manifest/icon/theme-color
changes aren't visually distinguishable from the existing app screens (a
manifest has no on-page render; "Add to Home Screen" behavior can only be
verified from a real device against a deployed URL, which is out of scope
per the controller's no-deploy ruling above).

## Preview URL

**Pending user approval.** See "Controller ruling on this task" above for
the exact `vercel link` / `vercel deploy` commands queued for when approved.

## Open items for Phase 2

From `.superpowers/sdd/2026-09-25-phase1-foundation-screener/progress.md`
(deferred/parked items, read-only — not edited by this task):

- Task 1 (minor, deferred): vitest ESM-as-CJS warning — add `"type": "module"`
  to `package.json`. (Still appears in this task's test/build output above.)
- Task 1 (minor, deferred): Turbopack warns about a stray
  `~/package-lock.json` outside the repo (environment issue, not app code).
- Task 2 (minor, deferred): `z.string().url()` is deprecated in zod 4 — use
  `z.url()` instead, in `src/lib/rules/schema.ts`.
- Task 2 (minor, deferred): `next-env.d.ts` churn not consistently noted in
  `AI-USE.md`.
- Task 3 (minor, deferred): `goBack` relies on the `rules.min(1)` schema
  invariant for its last-index fallback — add an explanatory code comment.
- Task 4 (minor, deferred): `ThemeToggle`'s initial rendered state is
  `"light"` before its `useEffect` runs, which can cause a one-frame icon
  flash on dark-mode page loads.
- Task 4 (minor, deferred): same vitest ESM/CJS config warning as Task 1.
- Task 5 (minor, deferred): `messages/es.json` uses generic masculine
  Spanish forms ("exento", "seguro") — needs gender-neutral rewording.
- Task 6 (minor, deferred): `Result`'s `becauseYes`/`becauseUnsure` ternary
  in `Screener.tsx` relies on an engine invariant (only `yes`/`unsure`
  answers ever attach a `ruleId` to a result step) rather than an exhaustive
  switch — worth hardening later.

Human-track items (cannot be closed by an agent):

- **Native Spanish review of `messages/es.json`**, including the
  gender-neutral wording fix noted above (Task 5's deferred item) — no
  native Spanish speaker has reviewed the translations yet.
- **Caseworker review of `rules/ca-calfresh-2026.json`** — the file ships
  with `reviewedAt: null` and `reviewer: null` (unreviewed draft rules); a
  caseworker needs to review the 18 rules and fill in `reviewedAt` before
  this is used with real applicants.
- **Confirm the Santa Clara County CalFresh phone number** —
  `(408) 758-3800` was sourced from a multi-program sccgov.org IHSS contacts
  PDF (per Task 2's ruling), not the dedicated CalFresh page. Someone needs
  to open the actual CalFresh page in a browser and confirm the number
  before the pilot, in case the PDF is stale.
- **Oct 3 pilot go/no-go** — the decision to proceed with the pilot on that
  date is a human call, not something this task or its automated checks can
  make.
