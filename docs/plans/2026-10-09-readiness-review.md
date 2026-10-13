# HourProof readiness review — 2026-10-09

Reviewed: `phase-3` at `798acaa` (13 commits ahead of `main`), plus Olivia's branch `codex/shiftcred-hours-documents` at `8c9e953` (7 commits ahead of `main`, pushed Oct 8). 15 days to the planned Oct 24 submit, 17 to the hard deadline.

## Verdict

- **Code quality: strong.** Everything that can be checked on a laptop passes.
- **Submission readiness: not yet.** The app a judge would open today is the Phase 1 screener behind a login wall, and the headline feature (kitchen-verified hours) has never run against a real database.
- **iPhone as a home-screen web app: close.** A handful of fixes, listed below.
- **Native iOS / App Store app: not ready, and I would not attempt it before Oct 26.** The challenge rules explicitly allow web apps and do not require a mobile app.

## What I ran (all on `phase-3`)

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0, 474 passed (26 files) |
| `npm run test:sql` | exit 0, 29 passed |
| `npm run build` | exit 0. Every page is server-rendered on demand (`ƒ`), only the manifest is static |
| `npm run e2e` (Chromium, 360 px) | exit 0, 69 passed, 8 skipped (screenshot-only tests) |
| Same e2e suite on WebKit at iPhone size (throwaway config, not in the repo) | exit 1, 63 passed, 6 failed, 8 skipped |

The WebKit run is new: the suite has only ever run on Chromium. Of the 6 failures, 5 are test-harness artifacts (two assert a 360×740 viewport, one asks for a Chromium-only clipboard permission, two depend on desktop Tab-key behavior). **One is real**, see finding 6.

## Findings, most serious first

1. **The live site is stale and private.** Vercel has one deployment, 14 days old, from before Phase 2 merged. `/log`, `/proof` and ShiftCred are not on it. Every URL returns a 302 to Vercel's login. A judge who asks for the app gets a sign-in page.
2. **ShiftCred has never touched a real database.** Vercel has zero environment variables and there is no `.env.local`, so a production build picks the `unavailable` backend (`src/lib/shifts/backend.ts`). The migration is tested only in PGlite. PGlite is a good check, but it stubs Supabase's `auth` schema, so anonymous sign-in, PostgREST's transaction behavior and the grants are unproven for real.
3. **The verified-hours loop is not closed.** `mergeMonth` (`src/lib/hours/merge.ts`) is called nowhere outside tests. A shift a kitchen confirms never appears in `/log` or `/proof`. The pitch is "check in at the kitchen, get proof"; today the proof step stops at the kitchen's screen.
4. **Two ShiftCreds again.** Olivia's branch adds `/shiftcred`: sample shift discovery, a drawn map, and a simulated check-in. Its "verify" button writes a 4-hour volunteer entry into the person's **real** hour log (`openStore(getMode())` in `ShiftCred.tsx`), labeled as confirmed by "Sample supervisor" at "Sample Community Kitchen". From there `/proof` would offer a CF 888 for a kitchen that does not exist. In an app whose whole point is trustworthy hours, sample data must never reach the real log. Her navigation bar, info panels and shift-discovery idea are worth keeping. It merges with `phase-3` with one text conflict (`docs/AI-USE.md`), but the two features overlap in meaning, not in files.
5. **No keep-alive.** The master plan promises a GitHub Actions cron so the free Supabase project is not paused during judging (through Jan 15, 2027). The SQL has `ping()`; the workflow does not exist.
6. **Proof uploads fail in Private Browsing on WebKit.** `src/lib/proof/files.ts` stores the `File` object in IndexedDB. In a WebKit private-style session that write errors; plain objects and `ArrayBuffer`s succeed, and a normal (persistent) WebKit profile stores the `File` fine. I confirmed this with a direct probe in Playwright's WebKit, not on a physical iPhone. The page does show its "couldn't save" message, so nothing is lost silently. Fix: store bytes plus the MIME type instead of the `File`.
7. **iPhone can delete the hour log.** Nothing calls `navigator.storage.persist()`, and there is no export or backup. Safari clears a site's IndexedDB after 7 days without a visit unless the site is installed to the Home Screen. For someone logging weekly, a month of hours can vanish. The hours exist only on the phone by design, which makes this the main robustness gap on iOS.
8. **Installed app and camera do not share data on iPhone.** A Home Screen web app has separate storage from Safari. A QR scanned with the Camera opens Safari, so the check-in session and the installed app's log are different worlds. This matters as soon as finding 3 is fixed.
9. **No service worker.** This was a deliberate Phase 2 decision. The consequence: the app cannot be opened without signal. Once open, saving works offline. The in-app line ("hours stay saved on this phone, even without signal") is accurate; the README's "It works offline" overstates it.
10. **e2e is not in CI.** CI runs typecheck, unit, SQL and build. The 77 browser tests run only when someone remembers.
11. **Submission paperwork gaps.** No `LICENSE`. No list of third-party libraries in the README (the rules require documenting them). `rules/ca-calfresh-2026.json` still has `reviewedAt: null`, and the Spanish is still an unreviewed AI draft.
12. **The AI disclosure is honest, and that is a risk to manage.** `docs/AI-USE.md` shows AI writing nearly every file to the team's rulings. The rules say AI "must not constitute the entirety of the technical development" and the sample rubric gives 5 of 30 points to explaining the code. This needs a human answer, not a code fix (see "things you need to do", item 5).
13. **Minor:** the waived-county scope rule expires `2026-10-31`. The engine handles expiry, but a judge opening the app in November sees a different screener than the video shows. Record the video with that in mind.

## Is it ready to be an iOS app?

**As a Home Screen web app:** nearly. It has a manifest, an Apple touch icon and standalone display. To call it solid on iPhone it needs: storage persistence plus an "add to Home Screen" nudge (finding 7), an export of the log, the upload fix (finding 6), a real-iPhone pass, and WebKit in the test matrix.

**As a native app:** four blockers.
- Every route needs a server (the locale is a cookie read on the server, and the language switch and QR poster are server actions). A bundled Capacitor app needs a static export, so the locale and poster have to move to the browser first. Wrapping the live URL in a web view instead invites an App Store 4.2 "minimum functionality" rejection.
- It needs an Apple Developer Program membership ($99 a year, enrolled by an adult).
- QR check-in would need universal links so a scanned poster opens the app.
- App Review time is not yours to control with 17 days left, and benefits apps from individual developers can draw extra scrutiny.

Rough size: 2 to 3 days of work plus TestFlight. Worth doing after the deadline, not before. For the video, a screen recording of the installed Home Screen app on a real iPhone reads as "an iOS app" to a judge.

## Five suggestions

1. **Close the loop before adding anything.** Kitchen-confirmed shifts into `/log` (wire `mergeMonth`), then into `/proof`, with a decision on whether a confirmed shift still needs a CF 888. This is the demo's payoff.
2. **Make the iPhone web app trustworthy with data.** `storage.persist()`, an install nudge, a one-tap export (JSON or PDF), and the bytes-not-File upload fix.
3. **Merge Olivia's work on purpose.** Keep her tool navigation, info panels and "find a shift" list. Drop the simulated verification, or confine it to demo mode so it can never write to the real log. Point "find a shift" at the real `/k/<code>` check-in.
4. **Add WebKit and e2e to CI.** One more Playwright project at iPhone size, with the five harness-specific assertions made browser-neutral.
5. **Build the monthly proof packet.** One PDF per month: totals by activity, kitchen-verified shifts, a CF 888 per organization. It is Phase 4's gate and the thing the app is named for. `pdf-lib` is already in the bundle for the CF 888.

## Five things you need to do (I can't do these for you)

1. **Stand up the real backend and a public URL.** Create the Supabase project, turn on anonymous sign-ins, and give me the project URL and anon key. Then turn off Vercel Authentication and run the deploy yourself (agent deploys are blocked here). Decide the permanent web address first: printed QR posters encode it and hang on a wall for months.
2. **Talk to Olivia today, then merge.** She pushed 7 commits on a parallel path yesterday. Agree on one ShiftCred, then open and merge the `phase-3` PR.
3. **Confirm challenge registration for every teammate.** Non-school email, 9-digit ZIPs, parent name and email, eligibility quiz. The plan had this due Sep 28 and I can't see its status.
4. **Get the two human reviews and one real-world test.** A native Spanish speaker on `messages/es.json` and the rule texts; a caseworker or legal-aid contact on the rules file (the only way to unlock "likely exempt"); and a dry run on a real iPhone at a real kitchen, or a kitchen stand-in.
5. **Own the code and the video.** Pick two or three modules (the rules engine and `src/lib/hours/summarize.ts` are the best candidates), change them by hand, and be able to explain them cold. Script the 1 to 3 minute video with about 30 seconds on how the code decides an exemption, and post it publicly on YouTube.

## Functionality and APIs worth adding

| Idea | Verdict | What I need from you |
|---|---|---|
| **Supabase** (already designed) | Required. Nothing else in ShiftCred works without it. | Project URL + anon key |
| **Directions to a kitchen** | Do it with a plain "Open in Maps" link (Apple or Google Maps URL). No key, no added download size, and the phone's own app gives transit directions. | Nothing |
| **Embedded map of kitchens** | Optional, for the video. Google Maps needs a billing account with a card on file (an adult's). Leaflet with OpenStreetMap tiles needs no key and is far lighter; load it only on the map screen so it stays out of the 200 KB budget. | Only if you want Google: a key from an adult's account |
| **Real kitchen listings** | Needed if "find a shift" ships. Use a hand-checked list of 5 to 10 real Santa Clara County sites that agreed to be listed. Never invented listings in a benefits app. | The list, with each site's OK |
| **Share sheet for the CF 888 and packet** | Recommended. `navigator.share` with a file hands the PDF to Mail, Messages or Print on iPhone, and is more dependable there than a download link. | Nothing |
| **Calendar file for a shift** | Cheap and useful. A `.ics` download, no service involved. | Nothing |
| **BenefitsCal link** | A link to where hours actually get reported. There is no API. | Nothing |
| **Pace reminders (web push)** | After the deadline. Needs the service worker the plan deferred, and on iPhone works only for installed apps. | Nothing yet |
| **Email backup of the anonymous account** | After the deadline. Supabase's built-in email is test-only, so it needs your Resend account as SMTP. | Resend SMTP credentials, later |
| **Pay-stub photo reading (OCR by an AI service)** | Don't. It sends pay stubs off the phone and breaks the app's central privacy promise. | — |
| **SMS** | Still no. The 10DLC registration timeline has already passed. | — |
