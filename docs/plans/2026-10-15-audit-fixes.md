# Audit fixes plan (2026-10-15)

This plan covers steps 2 and 3 of the 2026-10-15 full audit, which was reported in chat; its summary is in the project memory. It is based on `main` at `4075727`.

**Status: approved 2026-10-16 (device linking; the agent applies the migration after merge). Built and verified on branch `fix/audit-2026-10-15`; waiting for merge, then the migration.**

## Current state (verified by reading the code)

| Finding | Where | What is true today |
|---|---|---|
| H2: dashboard only reaches today and yesterday | `src/app/kitchen/[slug]/dashboard-state.ts:7`, `Dashboard.tsx:66,197,548-577` | `DayKey = "today" \| "yesterday"`. The SQL `kitchen_shifts(slug, pin, day)` already takes any date, so only the UI limits it. A shift left pending past yesterday can never be decided, yet it keeps counting toward the volunteer's 80 hours. |
| H1: iPhone check-in identity | `src/lib/shifts/local.ts`, `useKitchenShifts.ts`, `supabase.ts` | One anonymous auth user exists per browser. `my_shifts` returns only `auth.uid()`'s shifts. On iPhone the camera opens QR codes in Safari, and a Home Screen app has its own storage. |
| M4: kitchen decisions can't be undone | `decide_shift` in the migration | It only selects rows that are `open` or `pending`. Nothing moves a shift back. |
| M6: dependency advisories | `package.json` / lockfile | `next` 16.3.6 (fixed in 16.3.8), `sharp` 0.35.4 (fixed in 0.35.5), `source-map-js` 1.2.1 (fixed in 1.2.2). |
| L2: no security headers | `next.config.ts` | No `headers()`. The PIN page can be framed. |
| H3: keep-alive stops after 60 days | `.github/workflows/keepalive.yml` | GitHub disables cron workflows after 60 days without repository activity. The last commit was Oct 13, so it stops around Dec 12, before results on Jan 15. |
| M1: no monthly proof packet | `/proof` | It has per-type uploads and a CF 888, but no single summary file. |
| M3: iPhone downloads | `Cf888Form.tsx:68`, `KeepSafe.tsx:67`, `ProofDocuments.tsx:277` | All use `a[download]` on a blob URL. This is unverified in an installed iPhone web app. |

## Correction to the audit's H1 fix

The audit suggested putting the anonymous session's refresh token in the backup file. **I'm dropping that idea.** Supabase rotates refresh tokens and detects reuse. Restoring a backup holding an old token would use a token that has already been replaced, and that can revoke the whole session, including the live one in Safari. It would also put a credential in a file people email to themselves.

## Proposed changes

### 1. H2: the dashboard can reach every waiting shift
- **New SQL function** `kitchen_waiting(p_slug, p_pin)`. It is PIN-gated through `_check_pin`, like `kitchen_shifts`. It returns this kitchen's `pending` shifts dated before yesterday, at most 90 days back, oldest first. Same columns as `kitchen_shifts`.
- **Dashboard:**
  - A "Still waiting from earlier days" section appears above the day buttons whenever that list isn't empty. Each row uses the same confirm/reject controls.
  - A third day button, "Pick a day" (`<input type="date">`, max today), for looking back at decided shifts.
  - `DayKey` becomes `"today" | "yesterday" | { date: string }`.
- Refreshed with the same 30-second tick (one extra RPC per tick).
- **Mock parity:** add `kitchenWaiting` to `mock-server.ts`, `mock-client.ts`, the `ShiftBackend` type, `supabase.ts` and `UnavailableBackend`.

### 2. M4: undo a decision
- **New SQL function** `undo_decision(p_slug, p_pin, p_shift_id, p_supervisor)`. It is PIN-gated, and only works on shifts at this kitchen that are `confirmed` or `rejected` and were decided **within the last 24 hours**.
  - It sets status back to `pending` and clears `confirmed_by`, `reason` and `decided_at`.
  - It keeps `check_out`. If the supervisor corrected the end time, the correction stays.
- **Dashboard:** an "Undo" button on rows in the Done list that are less than 24 hours old.
- **Why 24 hours, not forever:** a mistaken tap gets caught the same day. An unlimited undo would let anyone with the PIN silently erase verified hours weeks later.

### 3. H1: link the Home Screen app to Safari's check-ins

**Recommended option (a): device linking.**
- **New tables**, with RLS on, all privileges revoked and no policies, so they are reachable only through RPCs:
  - `link_codes(code text pk, user_id, expires_at)`
  - `device_links(user_id pk, group_id uuid)`
- **`make_link_code()`** (authenticated) returns an 8-character code from a 31-symbol alphabet with no look-alike characters (about 2^40 combinations). It is single-use, expires in 15 minutes, and creating a new one replaces the old one.
- **`use_link_code(p_code)`** (authenticated) joins the caller and the code's owner into one group, merging groups if both already have one.
  - **Brute-force guard:** at most 5 failed tries per user per 15 minutes, using the same sequence technique as the PIN lockout (sequence writes survive the `raise` that rolls back the rest).
- **`my_shifts`** returns shifts from every user in the caller's group. **`check_in`** and `already_open_elsewhere` stay per user, so nothing about check-in changes.
- **UI:**
  - On `/k/[code]`, after a check-in or check-out: "Use HourProof from your Home Screen? Get a code to see these hours there." It shows the code with a countdown.
  - On `/log` in the installed app: "Add kitchen hours from Safari", with a code field.
  - After a successful link, set `hp.checkin.privacyShown` so `useKitchenShifts` starts syncing.
- **What this fixes:**
  - The installed app sees every past and future Safari check-in.
  - If Safari later loses its session, the shifts still show in the linked app, and Safari's new user can be linked again.
- **What it does not fix:** a lost or wiped phone with nothing linked. Those shifts stay visible only to the kitchen.
- **Privacy page:** add one sentence saying a link code ties two of your own browsers together. Add the matching es string.

**Option (c), the cheaper fallback:** change only the iOS install hint and the KeepSafe copy to say "Kitchen check-ins show in Safari, where you scanned the poster", with no schema change. It takes about an hour, but it leaves the gap open.

### 4. M6: dependency advisories
- `npm install next@16.3.8`: a patch bump. `npm audit fix` would jump to 16.4.1, a minor version, nine days before the deadline.
- Update `sharp` and `source-map-js` with `npm update sharp source-map-js`, which only edits the lockfile.
- **Never `npm audit fix --omit=dev`.** Its dry run shows it would *remove* vitest, typescript, tailwindcss and others.

### 5. L2: security headers (`next.config.ts` `headers()`, all routes)
- `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`. `/k/<code>` URLs carry the kitchen code, so nothing should leak it cross-origin.
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- **No `script-src` CSP.** Next's inline scripts and the theme boot script would need a per-request nonce, added through `proxy.ts`. That is too much change for the time left. The four directives above don't restrict scripts.

### 6. H3: a keep-alive that outlives the 60-day rule
- **Primary: a Vercel cron.** Add `vercel.json` with `{"crons":[{"path":"/api/keepalive","schedule":"17 9 * * *"}]}`. The new route `src/app/api/keepalive/route.ts` calls `ping()` with the public env vars.
  - It requires `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set, and is otherwise a harmless ping.
  - Hobby plans allow daily crons. It only runs on production deployments.
  - It is independent of GitHub activity.
- **Backup:** the GitHub workflow gains `permissions: actions: write` and a step `gh api -X PUT repos/$GITHUB_REPOSITORY/actions/workflows/keepalive.yml/enable`. This is the approach used by `keepalive-workflow` v2's API mode. **It relies on that project's reported behavior; I can't prove it before day 60.**

### 7. M1: monthly proof packet (`/proof`)
- A "Make my proof packet for <month>" button builds one PDF on the phone with pdf-lib (already a dependency, already lazy-loaded). It contains:
  - **Page 1, summary:** month; the hours that count by type and in total (from `summarizeMonth`, so it uses the same rules as the log); the counted total next to 80, worded as "the 80-hour rule"; and the HourProof disclaimer that this is the person's own record, not a county form.
  - **Itemized hours:** date, type, organization, hours, and whether each row is self-logged or kitchen-verified. Verified rows show the kitchen, the check-in and check-out times, and "confirmed by <name>".
  - **Attached proof:** every saved file for that month, appended in order.
    - JPEG and PNG are embedded as full pages.
    - PDFs have their pages copied.
    - Encrypted or unreadable PDFs, and other image types (HEIC, WebP), are listed by name with "not attached; bring it separately".
- **Fonts:** Helvetica covers English and Spanish (WinAnsi). Characters outside WinAnsi, such as a name in Vietnamese or Chinese, are replaced with `?` rather than failing. I'm not embedding a Unicode font because of the size.
- **Nothing leaves the phone.** The demo builds from demo data.

### 8. M3: iPhone save path
- A new helper, `src/lib/storage/save-file.ts` `saveFile(blob, name)`:
  - If `navigator.canShare?.({ files: [file] })` is true, it opens the share sheet.
  - Otherwise it falls back to the current `a[download]`.
  - If the user cancels the share sheet (`AbortError`), it does nothing.
- Used by CF 888, the proof packet, and "Save a copy".
- **Risk:** Safari needs a recent tap to open the share sheet, and building the PDF is async. The packet and the CF 888 therefore use two taps: "Make" builds the file, then "Save or share" calls `saveFile` directly from the tap.

## Files touched

**New:**
- `supabase/migrations/20261015000000_waiting_undo_links.sql`
- `test/sql/*` cases for the new functions
- `src/lib/storage/save-file.ts` (+ test)
- `src/lib/proof/packet.ts` (+ test)
- `src/app/proof/Packet.tsx`
- `src/app/api/keepalive/route.ts`
- `vercel.json`
- `src/app/log/LinkDevice.tsx`

**Changed:**
- the dashboard files
- `src/lib/shifts/{types,supabase,mock-server,mock-client,backend,local}.ts`
- `src/app/k/[code]/CheckIn.tsx`
- `HourLog.tsx`, `KeepSafe.tsx`
- `Cf888Form.tsx`, `ProofDocuments.tsx`
- `next.config.ts`
- `.github/workflows/keepalive.yml`
- the privacy page
- `messages/{en,es}.json`
- `package.json` and the lockfile
- e2e specs (`kitchen`, `proof`, `checkin`, `keep-safe`)
- `docs/AI-USE.md`
- README (keep-alive section)

## Do not touch
- Anonymous auth, `_check_pin`, the lockout sequences, and any existing RPC signature. New behavior goes in new functions, so a deployed old client keeps working.
- The existing migration file. Changes go in a new migration only; it is already applied to the live project.
- `displayOutcome`'s `reviewedAt` gate, `summarizeMonth`'s counting rules, and the rules JSON.
- Data placement: hours, files and CF 888 fields stay on the phone.
- `playwright.config.ts` blanking the Supabase vars, so e2e never writes to the real project.
- No dependency removals. No new runtime dependency.

## Risks and unknowns
- **The new migration must be applied to the live project.** I run `supabase db diff`/`push --linked` only after you say so, and after the PR is merged so the deploy and the schema match. Old clients keep working either way.
- **H1 is still unconfirmed on a real iPhone.** Your 10-minute test (install, scan with the camera, open the installed app) decides whether option (a) is worth its cost.
- **The share sheet, downloads in the installed app, and `<input type="date">` on iOS** can't be verified in Playwright WebKit. They need your phone.
- **The keep-alive's GitHub re-enable step** can't be proven before day 60. The Vercel cron is the one to rely on, and it needs a production deploy.
- **Size:** the proof packet adds lazily loaded code only. `/proof` first load must stay under the 200 KB JS budget (`npm run measure`).

## Verification (all must exit 0; results reported with real exit codes)
```
npm ci
npm run typecheck
npm test
npm run test:sql
npm run build
npm run e2e                  # Chromium + WebKit
npm run measure
npm audit --omit=dev         # expect 0 high
```

Then, after merge and your deploy:
- `curl -sI https://<site>/ | grep -i -E 'content-security|x-frame|referrer|permissions'`
- A live two-browser loop against the hosted project: check in, link a second browser, confirm a shift dated two days back via "Still waiting", then undo it. Test rows are deleted afterwards.

## Order of work (one branch `fix/audit-2026-10-15`, one commit per item, one PR)
1. M6, L2, H3
2. The SQL migration and tests (H2, M4, H1)
3. Dashboard (H2, M4)
4. Linking UI (H1)
5. `saveFile` (M3)
6. Proof packet (M1)
7. Full verification

**Estimate:** about 1.5 days of agent work.
