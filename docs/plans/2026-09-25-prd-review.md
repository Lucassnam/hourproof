# HourProof PRD review (2026-09-25)

Reviewed: the whole "HourProof — Product Requirements (PRD)" Claude Doc (rev 13, snapshot in `docs/PRD-snapshot-2026-09-25.md`).
Verdict: **the problem, the source-grounding and the privacy stance are strong. The schedule and the P0 list are not buildable as written.** Two background research passes are checking the rule table (`docs/research/calfresh-rules-verification.md`) and the Challenge rules and tech risks (`docs/research/challenge-and-tech-risks.md`). Anything below marked *(pending research)* depends on them.

## Blockers: fix before writing code

1. **The whole plan hangs on a partner signing up in 3 days.** Sep 25–28 has "Second Harvest or a kitchen agrees to a pilot" *and* a legal-aid reviewer agreeing to check the rules. Nonprofits don't move that fast for a student project, least of all in the first months of a new federal rule. If that slips, the pilot, the 300 hours, the 20 verified shifts, the reviewer quote and the video's "pilot results" all go with it.
   **Change:** make the build demo-first. The app has to be fully demoable with seeded demo data (a "Try the demo" mode) whether or not a partner says yes. Treat the pilot as a stretch goal with a hard go/no-go on **Oct 3**: no signed partner by then means no pilot, and the video uses a scripted walkthrough plus interview quotes.

2. **Phone OTP through Twilio is the riskiest line in the PRD.** US application-to-person SMS needs A2P 10DLC or toll-free verification. That is a registration process measured in days to weeks, it needs a responsible adult or business identity, and it costs money. The builder is a minor. *(pending research on exact timelines)*
   **Change:** recipients get an anonymous device account (Supabase anonymous sign-in), and linking an email to it is optional. That's no account wall, no SMS dependency, and less data collected, which the PRD's own privacy section argues for. SMS moves to P2.

3. **P0 depends on P1.** ShiftCred (P0) needs a supervisor to confirm shifts, and the only ways to confirm are the kitchen dashboard (**P1**) or an SMS "Y" reply (Twilio inbound, **P1**). As written, P0 can't be finished.
   **Change:** move a minimal supervisor confirm screen (a list of pending shifts with Confirm and Reject) into P0. The full dashboard, the CSV export and QR rotation stay P1.

4. **Collecting the minimum conflicts with storing pay-stub photos.** Pay stubs carry home addresses, employer IDs and often the last 4 digits of an SSN. The PRD says "never address, never SSN" and also uploads stub photos to cloud storage.
   **Change:** keep photos on the device (IndexedDB) and embed them in the PDF in the browser. Nothing sensitive reaches the server. Build the packet on the device too (see 7).

## Serious: fix in the plan

5. **"Already working 20+ hrs/week" is not an exemption.** In the screener's order it sits among the exemption questions, and "any yes ends early with *You're likely exempt*." Someone working 20 hours isn't exempt. They meet the requirement, and have to keep meeting it and keep proof. Telling them "exempt" is exactly the harmful error the risk table warns about. *(the rules agent is checking this, the LPIE college-student claim and the $217.50 threshold)*

6. **The rules need an owner and a real sign-off before any real user sees them.** "Verify with a caseworker before launch" appears three times and has no date. Put `reviewedAt` and `reviewer` fields in `rules/ca-calfresh-2026.json`, and have the app **refuse to show "likely exempt" wording while `reviewedAt` is null**, falling back to "ask your county." That makes the safety rule something the code enforces, not a promise.

7. **The 200 KB JS budget doesn't hold with the stack as listed.** @zxing/browser alone is roughly that size, and server-side @react-pdf means cold starts on Vercel plus font bundling for Spanish accents. Use the native `BarcodeDetector` with a lazy-loaded fallback only on `/scan`, and generate the PDF in the browser, lazy-loaded only on `/packet`. *(pending research)*

8. **Offline hour entry that syncs later** hides in the privacy section as a requirement, but it is a real sync system with conflict handling. Local-first storage gives offline for free on the recipient side (see 4), so the real P0 is "entries save locally and sync when online." Shift check-ins need to be online, and that's fine.

9. **Dark-first contradicts "readable in bright sunlight on old phones."** Dark UIs wash out in sun on low-brightness LCDs. Ship light as the default with the same tokens, and offer dark as an option. The Rondesignlab look still works in light mode, and the demo video can use dark.

10. **Next.js 15 → 16.** Your other projects are on 16 (trajectory, ergoflowlanding). Don't start a new project a major version behind. **Local environment trap:** `~/node_modules/.bin/node` is Node 18 and silently shadows npm scripts under your home folder, and Next 16 needs Node 20+. The project needs the local node shim from day one.

## Minor

- The deadline table says to submit Oct 24 against an Oct 26 deadline. Keep that 2-day buffer; it's good.
- The "Goals" metric "5 proof packets" comes from a 7-day pilot (Oct 13–19), so the packets cover part of a month. Say "5 packets (partial month)" so a judge doesn't catch it.
- Personas: "Marco… Spanish-first" while the persona text is English. That's fine, but record the Spanish-reviewer requirement as a named person with a date, not "a native speaker from the partner."
- Team: the open question "who builds what" decides whether multi-agent Claude work or teammates own each phase. That needs an answer now; see the questions in chat.
- The AI-use disclosure: keep a running `docs/AI-USE.md` log from day one (which files AI wrote, which logic the team wrote) instead of reconstructing it on Oct 23.

## What's already right (keep)
Source-cited rules, the "not a decision" line on every result, the rules kept in a data file, no account before the screener, collateral-contact framing for supervisor confirmation, a revocable share link, the explicit non-goals, and the Oct 24 buffer.
