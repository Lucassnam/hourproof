# Phase 3: ShiftCred (kitchen QR check-in + supervisor confirmation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A volunteer scans a kitchen's QR poster with their phone camera, taps **Check in**, scans again and taps **Check out**. A supervisor enters the kitchen PIN on any device and taps **Confirm**. The shift appears in the volunteer's HourProof log as **verified**: a solid segment of the 80-hour ring, separate from self-reported hours. That supervisor confirmation is the "statement from someone who saw the work" that counties accept (research row 10b).

**Decisions (user, 2026-09-27):** build everything now against a **mock backend** and connect a real Supabase project later; supervisors sign in with a **kitchen PIN** (no email); Phase 2 is merged, and Phase 3 branches from `main`.

**Architecture:**
- **Server of record: Supabase Postgres, reached only through RPC functions** (`security definer`). Tables have row-level security; volunteers can read only their own shifts, and nothing else is readable directly.
- **Volunteers** use Supabase **anonymous sign-in**: there's no account, and supabase-js keeps a device session.
- **Supervisors** never sign in. Every kitchen RPC takes `(slug, pin)` and checks the PIN hash with a lockout after 5 failed tries in 15 minutes.
- **One `ShiftBackend` interface, three implementations:**
  - `supabase`: when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.
  - `mock`: an in-memory Next route handler at `/api/mock-shifts`, only when `HOURPROOF_MOCK_SHIFTS=1` (dev and e2e). It shares state across browser contexts, so a volunteer phone and a supervisor phone can be tested together.
  - `unavailable`: otherwise. Pages say kitchen check-in isn't set up yet.
- **The rules live twice:** pure TypeScript in `src/lib/shifts/rules.ts`, used by the mock and the UI, and SQL in the migration, which is the real authority. **Both are tested against the same named case list.** The SQL is tested **without Docker** using **PGlite** (Postgres compiled to WebAssembly, run inside Vitest), with a stubbed `auth` schema.
- **The volunteer's hour log stays local-first.** Shifts are fetched, cached in a new IndexedDB store (DB version 2), and merged into the month view at read time. Self-entered hours never go to the server. **Sync never touches the demo database;** demo mode has its own seeded shifts.

**Tech:** Next 16, React 19, TypeScript, Tailwind v4, next-intl 4, zod 4, idb, **@supabase/supabase-js** (loaded only on `/k`, `/kitchen` and lazily on `/log`), **qrcode** (server-side only, for posters), **@electric-sql/pglite** (dev only, for SQL tests), Vitest, Playwright.

**Spec:** PRD §"ShiftCred QR check-in (P0)", §"Kitchen dashboard (P1)", Flow 2, the Data model (kitchens, kitchen_staff, shifts), the anti-fraud basics; corrected by `docs/research/calfresh-rules-verification.md` row 10b (volunteer hours need the organization's statement) and the master plan. Phase 2 state: `docs/plans/phase2-gate.md`, `docs/plans/phase2-sdd-ledger.md` (its "Phase 3 plan inputs" line).

## Global Constraints
- **What leaves the device, and nothing else:** the volunteer's **display name** (first name or nickname, 1–40 characters) and **shift times at that kitchen**. The check-in screen says so before the first check-in, and the volunteer must tap to agree. Self-logged hours, notes and screener answers **never** go to the server.
- **Never overclaim hours:** shift length is **rounded down** to the nearest quarter hour. An open shift auto-closes at **8 h** and is marked `autoClosed`, so the supervisor can correct it. A shift over **10 h** can't be confirmed without a corrected end time.
- **Only confirmed shifts are "verified".** Pending shifts count toward the month total as self-reported (PRD: "Unconfirmed shifts still count in the log but are marked self-reported"). Rejected and open shifts **don't count**.
- **One open shift per volunteer** (enforced by a DB unique partial index, and mirrored in the mock).
- **The PIN is never stored in plain text** (bcrypt via pgcrypto `crypt()`), never logged, and never kept in the browser beyond the page's memory. There's a lockout after 5 failed attempts per kitchen in 15 minutes.
- **The QR code is public** (it hangs on a wall). It's a random 22-character base64url token. Rotating it invalidates old posters. Misuse, like scanning a photo from home, is caught by the supervisor, who rejects the shift.
- **Demo mode never calls a backend.** Sync never writes `hourproof-demo`.
- JS budget: first load under 200 KB on `/`, `/screener`, `/log`, `/k/[code]` and `/kitchen/[slug]` (`npm run measure`). supabase-js must not be in `/`'s or `/screener`'s bundle.
- All of Phase 1–2's constraints still apply: en + es, 48px tap targets, 18px body, token colors, guarded storage, no analytics, the safety gate untouched, AI Spanish marked for native review, a docs/AI-USE.md row per task.
- Times are shown in **California time**. Stored times are `timestamptz`. A shift's log date is the **California date of check-in**.

## Review Focus
1. **Two phones, one kitchen:** volunteer A checks in on phone 1, the supervisor confirms on phone 2, and A's `/log` shows the verified hours. This is the whole-loop e2e with two browser contexts against the mock.
2. **Forgot to check out:** check in, come back 9 h later. The shift is auto-closed at 8 h, marked "closed automatically", and the supervisor sees it flagged and can correct the end time.
3. **Wrong PIN brute force:** the 6th wrong PIN within 15 min is refused as locked, even with the right PIN, until the window passes. This is tested in SQL (PGlite) and in the mock.
4. **Checked in somewhere else:** scanning kitchen B while open at kitchen A must not create a second open shift. The page says "You're checked in at A. Check out there first."
5. **Rounding and dates:** check-in 10:02 and check-out 13:14 count as 3.0 h (rounded down from 3 h 12 min). A shift starting 23:30 on Oct 31 (California) lands in October.

---

## Decisions made in this plan (flag any you disagree with)
| Topic | Decision | Why |
|---|---|---|
| Scanning | The **phone's own camera** opens the QR URL `https://<host>/k/<code>`. No in-app scanner. | Every modern Android and iOS camera opens QR links. That's zero JS and no permission prompts. |
| Supervisor identity | First name typed once per session and recorded as `confirmed_by`. No accounts. | The PIN decision. The CF 888 page (Phase 4) needs a name and the kitchen phone, not a login. |
| Kitchen setup | An admin-only SQL function `create_kitchen(name, slug, pin, phone)`, run in the Supabase SQL editor (documented) | One pilot kitchen; no admin UI needed before Oct 24 |
| Code storage | The QR code is stored in plain text (unique). The PIN is bcrypt-hashed. | The code is public on the poster anyway; the poster page needs to re-print it |
| Rounding | Round **down** to the nearest 0.25 h | Never overclaim. The phase 2 review deferred this rule to Phase 3. |
| Auto-close | 8 h after check-in; checked when the volunteer next loads `/k` or `/log`, and when the supervisor loads the dashboard | No cron needed. The PRD says 8 h. |
| >10 h | Confirm requires a corrected end time ≤ 10 h after check-in | PRD anti-fraud |
| Mock backend | A Next route handler with in-memory state, **404 unless `HOURPROOF_MOCK_SHIFTS=1`** | Lets e2e run two contexts; can't be enabled in production by accident. |
| Verified in the ring | The ring draws **verified hours solid** and **other counted hours striped**, with a small legend | PRD signature element |
| Duplicate risk | If a day has both a self-logged `volunteer` entry and a shift, show a note: "You may have logged this shift twice." Nothing is blocked. | The Phase 2 review asked for a merge rule; the verified shift wins |
| Keep-alive | A GitHub Actions cron every 3 days calls `rpc/ping`, with secrets set by the user | The free tier pauses after 7 idle days; judging runs to Jan 15 |

---

## File map
```
supabase/migrations/20260927000000_shiftcred.sql   schema, RLS, RPCs, create_kitchen, ping
src/lib/shifts/types.ts            Shift, KitchenShift, KitchenInfo, ShiftStatus, ShiftBackend
src/lib/shifts/rules.ts            pure: shiftHours(), autoCloseAt(), needsCorrection(), shiftLogDate(), countsToward()
src/lib/shifts/__tests__/rules.test.ts
src/lib/shifts/cases.ts            the named case list shared by the rules and SQL tests
src/lib/shifts/backend.ts          getShiftBackend() env switch
src/lib/shifts/supabase.ts         SupabaseShiftBackend (supabase-js rpc)
src/lib/shifts/mock-client.ts      MockShiftBackend (fetch → /api/mock-shifts)
src/lib/shifts/mock-server.ts      in-memory state machine used by the route handler (pure, tested)
src/lib/shifts/__tests__/mock-server.test.ts
src/app/api/mock-shifts/route.ts   POST handler, 404 unless HOURPROOF_MOCK_SHIFTS=1
test/sql/pglite.ts                 PGlite harness: auth stub, roles, migration loader
test/sql/shiftcred.test.ts         SQL tests (the same named cases)
src/lib/hours/types.ts             Entry += source?, verification?, shiftId?, autoClosed?; MonthSummary += verifiedCounted
src/lib/hours/summarize.ts         excludes open/rejected; computes verifiedCounted
src/lib/hours/merge.ts             shiftsToEntries(), mergeMonth(), duplicate detection
src/lib/hours/store.ts             DB v2: 'shifts' cache store (oldVersion < 2 step)
src/lib/hours/demo.ts              + demo shifts (2 confirmed, 1 pending)
src/app/k/[code]/page.tsx, CheckIn.tsx
src/app/kitchen/[slug]/page.tsx, Dashboard.tsx
src/app/kitchen/[slug]/poster/page.tsx   server-rendered QR SVG (qrcode), print CSS
src/app/log/HourLog.tsx, Ring.tsx         sync + verified segments + row states
e2e/checkin.spec.ts, e2e/kitchen.spec.ts, e2e/shift-loop.spec.ts
.github/workflows/keep-alive.yml
docs/SUPABASE-SETUP.md
```

---

### Task 1: Pure shift rules + Entry/summary extension (TDD)

**Files:** Create `src/lib/shifts/types.ts`, `src/lib/shifts/rules.ts`, `src/lib/shifts/cases.ts`, `src/lib/shifts/__tests__/rules.test.ts`, `src/lib/hours/merge.ts`, `src/lib/hours/__tests__/merge.test.ts`. Modify `src/lib/hours/types.ts`, `src/lib/hours/summarize.ts`, `src/lib/hours/__tests__/summarize.test.ts` (append only).

**Interfaces (produces):**
```ts
// src/lib/shifts/types.ts
export type ShiftStatus = 'open' | 'pending' | 'confirmed' | 'rejected'
export type Shift = {
  id: string; kitchenId: string; kitchenName: string
  checkIn: string /* ISO */; checkOut: string | null /* ISO */
  status: ShiftStatus; confirmedBy: string | null; reason: string | null; autoClosed: boolean
}
export type KitchenShift = Shift & { volunteerName: string }
export type KitchenInfo = { id: string; name: string; slug: string }
export type BackendErrorCode =
  | 'not_found' | 'already_open_elsewhere' | 'not_checked_in' | 'bad_pin' | 'locked'
  | 'needs_correction' | 'bad_name' | 'unavailable' | 'network'
export class ShiftBackendError extends Error { constructor(public code: BackendErrorCode, public detail?: unknown) { super(code) } }
export interface ShiftBackend {
  readonly kind: 'supabase' | 'mock' | 'unavailable'
  kitchenByCode(code: string): Promise<KitchenInfo | null>
  checkIn(code: string, displayName: string): Promise<Shift>
  checkOut(code: string): Promise<Shift>
  openShift(): Promise<Shift | null>
  myShifts(sinceDate: string /* YYYY-MM-DD */): Promise<Shift[]>
  kitchenShifts(slug: string, pin: string, day: string): Promise<KitchenShift[]>
  decide(slug: string, pin: string, shiftId: string, d: { decision: 'confirm' | 'reject'; supervisor: string; reason?: string; checkOut?: string }): Promise<KitchenShift>
  posterCode(slug: string, pin: string): Promise<string>
  rotateCode(slug: string, pin: string): Promise<string>
}
// src/lib/shifts/rules.ts
export const AUTO_CLOSE_HOURS = 8
export const MAX_CONFIRM_HOURS = 10
export function shiftHours(checkIn: string, checkOut: string): number   // floor to 0.25, ≥ 0
export function autoCloseAt(checkIn: string): string                      // checkIn + 8h (ISO)
export function effectiveShift(s: Shift, now: Date): Shift                // open & >8h → pending, checkOut = autoCloseAt, autoClosed true
export function needsCorrection(s: Shift, correctedCheckOut?: string): boolean // duration > 10h and no valid correction
export function shiftLogDate(checkIn: string): string                     // California date of check-in
export function countsToward(status: ShiftStatus): boolean                // pending | confirmed
// src/lib/hours/types.ts (additions; all optional so existing entries are unchanged)
//   Entry.source?: 'self' | 'shift'   (missing = 'self')
//   Entry.verification?: ShiftStatus   (only for source 'shift')
//   Entry.shiftId?: string; Entry.autoClosed?: boolean; Entry.confirmedBy?: string; Entry.reason?: string
//   MonthSummary.verifiedCounted: number  (hours from confirmed shifts, included in counted)
//   Flag += 'possible_duplicate'
// src/lib/hours/merge.ts
export function shiftsToEntries(shifts: readonly Shift[], now: Date): Entry[]   // uses effectiveShift; id `shift-<id>`, type 'volunteer', place kitchenName
export function mergeMonth(self: readonly Entry[], shifts: readonly Shift[], month: string, now: Date): { entries: Entry[]; duplicateDates: string[] }
```
- [ ] **Step 1: the named cases** (`cases.ts`). Export an array of `{ name, checkIn, checkOut, expectedHours }` used by both the rules tests and the SQL tests (Task 2). Include: `10:02→13:14 = 3.0`; `exactly 3h = 3.0`; `14 min = 0`; `7h59 = 7.75`; `crossing midnight 23:30→01:15 = 1.75`; `DST fall-back night 2026-11-01 00:30→02:30 PT = 3.0 real hours` (compute from the ISO instants, not wall clock).
- [ ] **Step 2: failing tests** (`rules.test.ts`):
  - every case in `cases.ts`
  - `effectiveShift`: open at 9h old becomes pending, autoClosed, checkOut = checkIn + 8h; open at 7h59 stays open
  - `needsCorrection`: 10h15 → true; with a correction to 9h → false; a correction before check-in → true
  - `shiftLogDate('2026-11-01T06:30:00Z')` → '2026-10-31'
  - `countsToward`: pending/confirmed true, open/rejected false
- [ ] **Step 3: failing tests** (`merge.test.ts`):
  - a confirmed shift becomes an Entry with source 'shift', verification 'confirmed', type 'volunteer', and the right date and hours
  - rejected and open shifts become entries that `summarizeMonth` does **not** count
  - `mergeMonth` returns only that month
  - `duplicateDates` flags a date with both a self volunteer entry and a shift
- [ ] **Step 4: failing tests** (append to `summarize.test.ts`):
  - `verifiedCounted` sums only confirmed shift entries
  - `counted` includes pending and confirmed, and excludes open and rejected
  - an existing self-only month is unchanged: `verifiedCounted` 0, and all old tests still pass
- [ ] **Step 5:** implement. Use quarter-hour integers, as in summarize.ts. Implement `shiftLogDate` with the shared `californiaDate`.
- [ ] **Step 6:** `npm test`, `npm run typecheck`. **Commit** `feat(shifts): pure shift rules, verified entries, month merge`

### Task 2: SQL migration + PGlite tests (no Docker)

**Files:** Create `supabase/migrations/20260927000000_shiftcred.sql`, `test/sql/pglite.ts`, `test/sql/shiftcred.test.ts`. Modify `vitest.config.mts` (include `test/**/*.test.ts`; the SQL tests may need a longer timeout), `package.json` (devDep `@electric-sql/pglite`; run `npm run postinstall` after installing).

**Schema** (write it exactly like this, adjusting only for PGlite compatibility):
```sql
create extension if not exists pgcrypto;

create table public.kitchens (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  qr_code text not null unique,
  pin_hash text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.volunteers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kitchen_id uuid not null references public.kitchens(id),
  check_in timestamptz not null default now(),
  check_out timestamptz,
  status text not null default 'open' check (status in ('open','pending','confirmed','rejected')),
  auto_closed boolean not null default false,
  confirmed_by text,
  reason text,
  decided_at timestamptz,
  check (check_out is null or check_out >= check_in)
);
create unique index shifts_one_open_per_user on public.shifts(user_id) where status = 'open';
create index shifts_kitchen_day on public.shifts(kitchen_id, check_in);
create table public.pin_attempts (
  id bigserial primary key,
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  at timestamptz not null default now(),
  ok boolean not null
);
alter table public.kitchens enable row level security;
alter table public.volunteers enable row level security;
alter table public.shifts enable row level security;
alter table public.pin_attempts enable row level security;
create policy shifts_select_own on public.shifts for select to authenticated using (user_id = auth.uid());
create policy volunteers_select_own on public.volunteers for select to authenticated using (user_id = auth.uid());
-- kitchens and pin_attempts: no policies (RPC only)
```
**RPCs** (`language plpgsql security definer set search_path = public, extensions`; `revoke all on function … from public`; grant execute to `anon, authenticated` except where noted). Each raises an exception whose MESSAGE is one of the `BackendErrorCode` strings, so the client can map it.
- `kitchen_by_code(p_code text) returns table(id uuid, name text, slug text)`: an active kitchen only.
- `check_in(p_code text, p_name text) returns public.shifts`: requires `auth.uid()`. It auto-closes this user's stale open shift (> 8 h: status 'pending', check_out = check_in + 8h, auto_closed true), upserts the volunteer's name, raises `already_open_elsewhere` if an open shift exists at another kitchen, returns the existing open shift if it's at this kitchen, otherwise inserts. It also raises `bad_name` and `not_found`.
- `check_out(p_code text) returns public.shifts`: closes this user's open shift at that kitchen (check_out = least(now(), check_in + 8h); auto_closed if capped; status 'pending'), or raises `not_checked_in`.
- `my_shifts(p_since date) returns table(… shift columns …, kitchen_name text)`: this user's shifts where the California date of check_in ≥ p_since. It applies the auto-close first.
- `kitchen_shifts(p_slug text, p_pin text, p_day date) returns table(… shift columns …, volunteer_name text)`: calls `_check_pin`, then returns shifts whose California check_in date = p_day, with auto-close applied.
- `decide_shift(p_slug, p_pin, p_shift_id uuid, p_decision text, p_supervisor text, p_reason text default null, p_check_out timestamptz default null) returns table(… same as kitchen_shifts …)`:
  - PIN check; the shift must belong to this kitchen and be pending (or open → it closes it at p_check_out or now)
  - confirm needs a duration ≤ 10h (using p_check_out if given, else `needs_correction`)
  - reject needs a reason
  - it sets confirmed_by and decided_at
- `poster_code(p_slug, p_pin) returns text`; `rotate_code(p_slug, p_pin) returns text` (a new random 16-byte base64url code, 22 characters).
- `_check_pin(p_slug, p_pin) returns uuid` (internal, not granted): it counts failed attempts in the last 15 min for the kitchen; if ≥ 5 → `locked`; it compares `crypt(p_pin, pin_hash)`, records the attempt, and raises `bad_pin` on a mismatch. **A correct PIN while locked is still refused.**
- `create_kitchen(p_name, p_slug, p_pin, p_phone) returns text` (returns the QR code): granted to **no one**, since only postgres/service_role in the SQL editor may run it; the PIN must be 6 digits.
- `ping() returns int` (granted to anon): returns 1.

**PGlite harness** (`test/sql/pglite.ts`): create a PGlite instance with the pgcrypto extension (`@electric-sql/pglite/contrib/pgcrypto`). Before loading the migration, create what Supabase provides: `create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`, roles `anon` and `authenticated`, and schema `extensions` if the migration references it. Provide helpers: `asUser(db, uuid, fn)` (inserts into auth.users if needed, `set local role authenticated`, `set_config('request.jwt.claim.sub', uuid, true)` inside a transaction), `asAnon(db, fn)`, and `rpc(db, name, args)`. **If PGlite can't do `set role` or RLS**, fall back to testing the RPC behavior as the owner, test the RLS policies by reading `pg_policies`, and state that limit in the report. Don't fake a pass.

- [ ] **Step 1: failing SQL tests** (`test/sql/shiftcred.test.ts`), one per behavior:
  1. The migration applies cleanly on a fresh PGlite.
  2. `create_kitchen` returns a 22-character code, and `kitchen_by_code` finds it; an inactive kitchen isn't found.
  3. Check in → an open shift; checking in again at the same kitchen returns the same shift; checking in at another kitchen raises `already_open_elsewhere`.
  4. Check out → pending, with check_out set; checking out while not checked in raises `not_checked_in`.
  5. Auto-close: set check_in 9h ago, then call `my_shifts` → pending, auto_closed, check_out = check_in + 8h.
  6. The duration cases from `src/lib/shifts/cases.ts`, for the ones expressible as instants: SQL `check_out - check_in` rounded down to quarters matches `expectedHours`. Import the TS file into the test to read the cases.
  7. PIN: a wrong PIN raises `bad_pin`; 5 wrong then the right one raises `locked`; after moving the attempts' `at` back 16 minutes, the right PIN works.
  8. Decide: confirm sets confirmed_by and decided_at; reject without a reason errors; confirming a 10h15 shift without p_check_out raises `needs_correction`, and with p_check_out at 9h succeeds; deciding another kitchen's shift raises `not_found`.
  9. RLS (if roles work): user A can't select user B's shifts; `anon` can't select kitchens or pin_attempts directly; `authenticated` can't insert into shifts directly.
  10. `create_kitchen` can't be executed by `anon` or `authenticated`.
  11. California date: a shift at 2026-11-01T06:30Z shows in `kitchen_shifts(…, '2026-10-31')`.
- [ ] **Step 2:** write the migration until everything passes. **Step 3:** `npm test`, `npm run typecheck`. **Commit** `feat(db): ShiftCred schema, RLS and RPCs with PGlite tests`

### Task 3: Backend layer (Supabase client + mock server) with contract tests

**Files:** Create `src/lib/shifts/backend.ts`, `src/lib/shifts/supabase.ts`, `src/lib/shifts/mock-client.ts`, `src/lib/shifts/mock-server.ts`, `src/lib/shifts/__tests__/mock-server.test.ts`, `src/lib/shifts/__tests__/supabase.test.ts`, `src/app/api/mock-shifts/route.ts`. Modify `package.json` (dep `@supabase/supabase-js`; a `dev:mock` script `HOURPROOF_MOCK_SHIFTS=1 next dev -p 7050`; the e2e webServer env sets `HOURPROOF_MOCK_SHIFTS=1` and `NEXT_PUBLIC_HOURPROOF_BACKEND=mock`), `playwright.config.ts`, `.env.example`.

- `getShiftBackend()`: `supabase` if both public Supabase env vars are set; else `mock` if `NEXT_PUBLIC_HOURPROOF_BACKEND === 'mock'`; else `unavailable` (every method throws `ShiftBackendError('unavailable')`). The Supabase client is created lazily through a dynamic `import('@supabase/supabase-js')`, so it stays out of every bundle until it's used.
- **SupabaseShiftBackend:** `ensureSession()` calls `auth.getSession()`, then `signInAnonymously()` if there's none (volunteer methods only; kitchen methods use the anon key with no session). Each method calls `rpc(name, args)`, maps rows (snake → camel) and maps error messages to `ShiftBackendError` codes; unknown errors become `network`.
- **mock-server.ts:** a pure in-memory state machine with the same semantics as the SQL, reusing `src/lib/shifts/rules.ts`. It's seeded with one kitchen: name "Community Kitchen (test)", slug `test-kitchen`, code `TESTCODE-0000000000000` (22 chars), PIN `123456`. Volunteer identity comes from a header `x-hp-volunteer` holding a random id the mock client keeps in localStorage (via safeGet/safeSet). Exports `createMockState()` and `handle(state, op, args, volunteerId, now)`. **Also export `reset()`**, usable only when mock mode is on, so e2e can reset between tests.
- **route.ts:** `POST` with `{ op, args }`. It returns 404 unless `process.env.HOURPROOF_MOCK_SHIFTS === '1'`. State is a module-level singleton. Errors return `{ error: code }`.
- **Contract tests:** `mock-server.test.ts` runs the same behavior list as Task 2's SQL tests (items 2–8 and 11) against `handle()`. `supabase.test.ts` checks, with a fake `rpc` function, the name/arg mapping and the error-code mapping for every RPC.
- [ ] TDD for the mock and mapping. `npm test`, `npm run typecheck`, `npm run build` (no Supabase code in the `/` or `/screener` chunks; confirm with `npm run measure`). **Commit** `feat(shifts): backend interface, Supabase client, mock server`

### Task 4: Volunteer check-in page `/k/[code]`

**Files:** Create `src/app/k/[code]/page.tsx`, `src/app/k/[code]/CheckIn.tsx`, `e2e/checkin.spec.ts`. Modify `messages/*.json`.

**Behavior** (client component; one screen; states):
- **Loading → kitchen lookup.** An unknown code shows "This QR code isn't active. Ask the kitchen for the current poster." `unavailable` shows "Kitchen check-in isn't set up yet."
- **First time on this device:** a name field ("Your first name or nickname") and the privacy line: "Your first name and your check-in and check-out times go to {kitchen} so a supervisor can confirm your hours. Nothing else leaves your phone." The **Check in** button is disabled until there's a name. The name is remembered in localStorage (safeSet) for next time, and can be edited.
- **Not checked in:** the big primary button "Check in at {kitchen}".
- **Checked in here:** "Checked in at {time}" (California time, page locale), a live elapsed counter (updated every 30 s), and the primary button "Check out".
- **Checked in elsewhere:** "You're checked in at {other}. Check out there first." No buttons except a link to /log.
- **Checked out:** "Sent to {kitchen} for confirmation: {h} hours ({in}–{out})." Then the note "It shows in your hours now and becomes verified when a supervisor confirms." and a primary link to "See my hours" (/log).
- **Auto-closed** (seen on load): "It looks like you forgot to check out. We closed your shift at 8 hours. The supervisor can fix the time."
- Errors are mapped to plain messages. Network failure: "No signal. Try again when you're connected." Nothing is queued offline in this phase (check-in has to happen at the kitchen).
- A small footer: the language switch and theme toggle, as elsewhere.
- **e2e** (mock mode, reset between tests): the first check-in with the name + privacy line; checking in again is idempotent; check out; checked in elsewhere (seed a second mock kitchen via reset args); an unknown code; auto-close (use `page.clock` to jump 9 h, or a mock `now` override header allowed only in mock mode); Spanish; 360px screenshot review.
- [ ] Implement; `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e`, `npm run measure` (add `/k/TESTCODE-0000000000000`). **Commit** `feat(checkin): volunteer QR check-in and check-out`

### Task 5: Kitchen dashboard `/kitchen/[slug]` + QR poster

**Files:** Create `src/app/kitchen/[slug]/page.tsx`, `Dashboard.tsx`, `src/app/kitchen/[slug]/poster/page.tsx` (plus a small client part if needed), `e2e/kitchen.spec.ts`. Modify `messages/*.json`, `package.json` (dep `qrcode`, with types).

**Behavior:**
- **Unlock:** 6-digit PIN (`inputMode="numeric"`, `autocomplete="one-time-code"`) plus "Your first name". The PIN is held in React state only (not storage); the name is kept in sessionStorage. `bad_pin` shows "That PIN didn't work." `locked` shows "Too many tries. Wait 15 minutes."
- **Day view** (today by default; yesterday/today buttons). Three groups:
  - **Checked in now:** name, since time, elapsed.
  - **Waiting for you:** name, in–out, hours, and an "auto-closed" badge if applicable. Two buttons, **Confirm** and **Reject**. Reject opens reason chips ("Didn't work this shift", "Times are wrong", "Other" + text). If `needs_correction` or auto-closed, show an end-time field before Confirm.
  - **Done:** confirmed (✓ with the supervisor name) or rejected (with the reason).
- The list refreshes every 30 s and after each decision. Optimistic update, rolled back on error.
- **The poster link** goes to `/kitchen/[slug]/poster`. The poster page asks for the PIN again (a server action posts the PIN, then the server calls `poster_code`), then **server-renders** an SVG QR (`qrcode.toString(url, { type: 'svg', errorCorrectionLevel: 'M' })`) for `https://<host>/k/<code>`. Print layout: the kitchen name, the big QR (at least 12 cm), and instructions in en + es ("1. Open your phone camera. 2. Point it at this code. 3. Tap Check in."). A **Rotate code** button with a confirm step ("Old posters will stop working") calls `rotate_code`, then re-renders.
- **Mock-mode note:** the host for the QR URL comes from `headers()` (x-forwarded-host / host), so it works on localhost and on Vercel.
- **e2e:** wrong PIN; lockout after 5; unlock; a volunteer check-in (a second context) appears under "Checked in now"; after check-out it's under "Waiting"; confirm moves it to Done; reject needs a reason; an auto-closed shift needs an end time; the poster page contains an `<svg>` and the right URL text; rotate changes the code and the old `/k/<old>` becomes inactive; Spanish; screenshots.
- [ ] Implement; `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e`, `npm run measure` (add `/kitchen/test-kitchen`). **Commit** `feat(kitchen): PIN dashboard, confirm/reject, QR poster with rotation`

### Task 6: `/log` integration (verified hours in the ring)

**Files:** Modify `src/lib/hours/store.ts` (DB version 2: `if (oldVersion < 2)` creates a `shifts` store keyPath `id`; `cacheShifts(shifts)` / `cachedShifts()` on EntryStore; the demo DB too), `src/lib/hours/demo.ts` (demo shifts: 2 confirmed at "Community kitchen", 1 pending; all local), `src/app/log/HourLog.tsx`, `src/app/log/Ring.tsx`, `messages/*.json`, `e2e/log.spec.ts` or `e2e/shift-loop.spec.ts`.

**Behavior:**
- **Real mode:** on load, show the cached shifts immediately. Then, if the backend isn't `unavailable`, lazily import it and call `myShifts(first day of previous month)`, cache the result and re-render. Sync failures are silent except for a small "Couldn't update kitchen shifts" line. **Demo mode:** never import or call the backend; use the demo shifts.
- **Merge:** `mergeMonth(selfEntries, shifts, month, now)` → `summarizeMonth(merged)`.
- **Ring:** a solid `proof` arc for `verifiedCounted`, followed by a **striped** arc (SVG pattern, same hue) for `counted − verifiedCounted`. A legend under the ring: "■ Verified by a kitchen  ▨ Your own log". The aria-label includes both numbers.
- **Rows:** shift rows show the kitchen name, times, hours and a badge:
  - "Verified by {name}" (confirmed)
  - "Waiting for the kitchen" (pending)
  - "Checked in now" (open; not counted)
  - "Not accepted: {reason}" (rejected; not counted)
  Shift rows can't be edited or deleted (no Edit button; a note: "Kitchen shifts are managed by the kitchen").
- **Duplicate note** when `duplicateDates` isn't empty: "You may have logged a kitchen shift twice on {date}. You can delete your own entry." (en/es).
- **e2e (the whole loop, two contexts, mock):** volunteer: `/k/<code>` → check in → (`page.clock` +3h) → check out → `/log` shows 3 hours "Waiting for the kitchen", striped. Supervisor: unlock → confirm. Volunteer: reload `/log` → "Verified by {name}", solid segment, ring aria-label says 3 verified. Plus the demo: `/` → Try the demo → the ring shows verified + own, the legend is visible, and the network log has **no** `/api/mock-shifts` request.
- [ ] Implement; the full verification; screenshots (the ring with both segments in en/es and light/dark; the rows); `npm run measure` (/log still under 200 KB, with supabase-js not in the first load). **Commit** `feat(log): verified kitchen shifts in the ring and list`

### Task 7: Setup runbook, keep-alive, gate

**Files:** Create `docs/SUPABASE-SETUP.md`, `.github/workflows/keep-alive.yml`, `docs/plans/phase3-gate.md`. Modify `README.md`, `docs/AI-USE.md`, `.env.example`.
- **SUPABASE-SETUP.md:** exact click-by-click steps.
  1. Create a free project named `hourproof` in region `us-west-1`.
  2. Authentication → turn on **Anonymous sign-ins**.
  3. SQL editor → paste `supabase/migrations/20260927000000_shiftcred.sql` and run it. Alternatively, use `supabase link --project-ref <ref>` then `supabase db push`.
  4. Run `select create_kitchen('Kitchen name','kitchen-slug','123456','(xxx) xxx-xxxx');` and keep the returned code.
  5. Put `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` and in Vercel project env vars.
  6. Redeploy.
  7. Print the poster from `/kitchen/<slug>/poster`.
  8. Add GitHub secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` for the keep-alive.
  9. Smoke test: check in and out on your phone, confirm on another device.
- **keep-alive.yml:** `schedule: cron '0 15 */3 * *'` plus `workflow_dispatch`. It curls `POST $SUPABASE_URL/rest/v1/rpc/ping` with the anon key headers, fails if the response isn't `1`, and is skipped cleanly if the secrets are missing.
- **Gate report:** the real outputs (vitest, PGlite SQL tests, Playwright, build, measure table for all 5 routes), the screenshots, what's verified vs. what's only mocked ("SQL tested in PGlite; not yet run on a real Supabase project"), the human track (create the project, enable anonymous sign-ins, pick the pilot kitchen, choose the PIN, print the poster, Oct 3 go/no-go), and the Phase 4 inputs (CF 888 page using `confirmed_by` + the kitchen phone).
- [ ] **Commit** `docs: Supabase setup runbook, keep-alive workflow, phase 3 gate`

---

## Parallelism
- **Task 2 (SQL + PGlite) runs in a parallel worktree** with Task 1. It touches only `supabase/`, `test/sql/`, `vitest.config.mts` and package.json; merge package.json carefully.
- Then T3 → T4 → T5 → T6 → T7 run sequentially in the main tree. T4 and T5 both edit messages/*.json, so they aren't parallel.

## Human track (Phase 3)
| When | Task |
|---|---|
| Before the Oct 13 pilot | Create the Supabase project (≈3 min) and follow docs/SUPABASE-SETUP.md. Claude can do steps 3–7 once the MCP or CLI is pointed at the project. |
| Oct 3 | Pilot go/no-go: pick the kitchen, its supervisor(s) and a 6-digit PIN |
| Before the pilot | Print the poster; test with two phones on site |
