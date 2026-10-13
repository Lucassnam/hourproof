# Launch readiness: six changes before sharing HourProof with real people

Written 2026-10-13 from an audit of `main` at `2a0d4b8`. Scope and order were approved in chat the same day ("add all of those + push to repo when done"), so this plan was executed without a second approval stop.

## The request, restated

1. A shift a kitchen confirms shows up in the volunteer's hour log and on the proof page.
2. Hours on the phone are safer: a copy the person can save and restore, a request for storage that isn't auto-cleared, and a nudge to add the app to the Home Screen.
3. A privacy page and an about/contact page.
4. Proof uploads work in Private Browsing on WebKit.
5. The browser tests run in CI, on Chromium and on WebKit at iPhone size.
6. Repo paperwork: third-party credits and a README that matches the app.

## Current state (audited)

- `mergeMonth` (`src/lib/hours/merge.ts`) and `summarizeMonth`'s `verifiedCounted` exist and are tested, but nothing calls `mergeMonth`. `/log` and `/proof` read only IndexedDB.
- The Phase 3 plan (`2026-09-27-phase3-shiftcred.md`, Task 6) already designed the log integration: verified hours solid in the ring, other hours striped, shift rows with a status and no Edit button, a possible-duplicate note. That design is followed here, with two changes listed below.
- `src/lib/proof/files.ts` stores the `File` object itself. WebKit refuses to store a `File` or `Blob` in a private-style session; an `ArrayBuffer` is accepted (probed 2026-10-09).
- Nothing calls `navigator.storage.persist()`. There is no export.
- `/privacy` and `/about` return 404.
- `playwright.config.ts` has one project (Chromium). CI does not run e2e.
- Messages are `messages/en.json` and `messages/es.json`, loaded by `src/i18n/request.ts`; a parity test requires identical keys.

## Changes

### 1. Kitchen shifts in the log and on the proof page
- New `src/lib/shifts/local.ts`: whether this browser has ever checked in (`hp.checkin.privacyShown`), and a validated cache of the person's shifts in `localStorage`.
- New `src/lib/shifts/useKitchenShifts.ts`: shows cached shifts at once; then, **only if this browser has checked in before**, loads the backend and refreshes them.
- `HourLog.tsx`, `Ring.tsx`: merge, verified arc and legend, shift rows, duplicate note, a quiet line when the refresh fails.
- `ProofDocuments.tsx`, `src/lib/proof/groups.ts`: count kitchen shifts that count (pending or confirmed); say how many hours a supervisor confirmed, and that the county still needs a signed form or to hear from the kitchen (research row 10b).
- Demo: the demo's two volunteer entries are shown as kitchen shifts (one confirmed, one waiting). Totals do not change.

**Two departures from the Phase 3 plan, and why**
- The cache is `localStorage`, not a new IndexedDB store. Shifts are a small list the server already keeps; this avoids a database version bump on every phone that has saved hours.
- The log does not contact the server unless this browser has checked in at a kitchen. The plan's version would have signed every log visitor in anonymously, which contradicts "your hours are saved only on this phone" for people who never use a kitchen.

### 2. Phone data safety
- New `src/lib/hours/backup.ts`: make, read and restore a copy of the self-logged hours (a JSON file).
- New `src/lib/storage/persist.ts`: ask for persistent storage after the first saved entry.
- New `src/app/log/KeepSafe.tsx`: "Save a copy", "Restore from a copy", and an install hint (iPhone instructions, or the browser's install prompt where there is one). Hidden in the demo.

### 3. Privacy and about pages
- New `/privacy` and `/about` (server-rendered, English and Spanish), linked from a small footer on the home page, the log and the proof page.
- Every statement on them is checked against the code. Contact is `NEXT_PUBLIC_CONTACT_EMAIL` if set, otherwise the project's GitHub issues page.

### 4. Private Browsing uploads
- `src/lib/proof/files.ts` stores bytes plus the MIME type. Files saved before this change (stored as a `Blob`) still open.

### 5. Browser tests in CI
- `playwright.config.ts`: a second project, WebKit at 390×844 with touch.
- The five assertions that are Chromium- or viewport-specific are made browser-neutral or skipped on WebKit with the reason.
- `.github/workflows/ci.yml`: an e2e job that installs both browsers and runs the suite.

### 6. Paperwork
- README: what the app does now, how the hosted backend is set up, third-party libraries with their licenses, privacy summary.
- **No open-source license file.** The challenge rules say "No other party should have any rights or interest in the app" (`docs/research/challenge-and-tech-risks.md`). An MIT-style license grants rights to everyone, so this is left as a decision for the team; the README says the code is all rights reserved for now.

## Do not touch

- The rules file and the engine's "never say likely exempt while `reviewedAt` is null" gate.
- `summarizeMonth`'s counting rules.
- The SQL migration, grants and PIN lockout.
- The mock/real backend selection and the e2e guard that blanks the Supabase variables.
- The 200 KB JS budget on `/`, `/screener`, `/log`.

## Risks

- **Counting twice.** A person may log a kitchen shift by hand as well. Nothing is blocked; the log shows a note for that day.
- **iPhone storage is split.** A Home Screen app and Safari keep separate data. The install hint says so and points at "Save a copy" and "Restore".
- **Spanish.** All new Spanish text is an AI draft, like the rest, and needs a native reader.
- **Unverifiable here:** behavior on a physical iPhone (install, share sheet, storage persistence).

## Verification

```
npm run typecheck
npm test
npm run test:sql
npm run build && npm run measure
npm run e2e            # Chromium and WebKit, mock backend
```
Plus one manual pass in a browser against the hosted Supabase project: check in, check out, confirm, then open `/log` and `/proof`.
