# HourProof

HourProof is an installable web app for California CalFresh recipients facing the H.R. 1 work rule: adults it covers must show 80 hours a month of work, volunteering or an approved program to keep their food benefits. It is built for old phones and for Spanish-first users, in English and Spanish. It is an entry for the Congressional App Challenge (CA-16).

What it does now:

- **Screener** (`/screener`): 4 to 5 short screens (the scope questions, one "Check any that apply" list of exemptions, then a question or two) end in a next step: the rule likely doesn't apply, you may be exempt (ask your county), you're meeting it, or the rule likely applies. Results show the county phone number and, where they apply, the proof to bring and a script for the call.
- **Hour log** (`/log`): add, edit and delete hours (paid work, volunteering, job programs, job search, workfare). An 80-hour ring shows the month, with a plain pace line and notes when something doesn't count (job search outside a program, workfare). It works offline.
- **Demo mode** ("Try the demo" on the home page): a separate sample log, with a banner, that never touches your real hours.

## Privacy

Nothing leaves the phone. Screener answers stay in `sessionStorage` (gone when the tab closes). Hours and notes are stored in IndexedDB on the device. The demo uses its own database. There is no account, no server storage and no analytics.

## Commands

```bash
npm ci                          # install (also links the right Node, see below)
npm test                        # unit tests (vitest)
npm run build                   # production build (re-runs the rule-file tests first)
npm run e2e                     # builds, serves on :7051, runs Playwright
npm run build && npm run measure   # JS per route (must stay under 200 KB on /, /screener, /log)
```

`npm run dev` serves on http://localhost:7050. Playwright needs Chromium once: `node node_modules/@playwright/test/cli.js install chromium`.

Node 20.9+ is required. This machine has a stray Node 18 in `~/node_modules/.bin`, so the `postinstall` script links the real Node into `node_modules/.bin/node`. Run `npm run postinstall` after `npm i <package>`, and prefer npm scripts over `npx`.

## Safety

The rules live in `rules/ca-calfresh-2026.json`, each with its official source URL and a verbatim quote. The file ships with `reviewedAt: null` because no advocate or caseworker has reviewed it yet. While `reviewedAt` is null, the app never says "likely exempt" / "Es probable que usted esté exento": every exemption shows "You may be exempt. Ask your county to confirm." instead (`displayOutcome` in `src/lib/rules/engine.ts`, tested for every exemption rule in `src/lib/rules/__tests__/real-file.test.ts` and end to end). Every result says "This is not a decision. Only your county can decide." The hour log doesn't assume the rule applies to you either: its 80-hour lines start with "If the rule applies to you" or "To reach 80". The Spanish texts are AI drafts that still need native and caseworker review (see `docs/AI-USE.md`).
