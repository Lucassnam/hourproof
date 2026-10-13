# HourProof

HourProof is an installable web app for California CalFresh recipients facing the H.R. 1 work rule: adults it covers must show 80 hours a month of work, volunteering or an approved program to keep their food benefits. It is built for old phones and for Spanish-first users, in English and Spanish. It is an entry for the 2026 Congressional App Challenge (CA-16).

HourProof is a student project. It is not a government website and is not connected to CalFresh, any county or the State of California.

## What it does

- **Screener** (`/screener`): 4 to 5 short screens (the scope questions, one "Check any that apply" list of exemptions, then a question or two) end in a next step: the rule likely doesn't apply, you may be exempt (ask your county), you're meeting it, or the rule likely applies. Results show the county phone number and, where they apply, the proof to bring and a script for the call.
- **Hour log** (`/log`): add, edit and delete hours (paid work, volunteering, job programs, job search, workfare). An 80-hour ring shows the month, with a plain pace line and notes when something doesn't count (job search outside a program, workfare). Saving never needs signal.
- **Kitchen check-in** (`/k/<code>`): a volunteer scans a kitchen's QR poster, types a first name and taps Check in, then Check out. No account.
- **Kitchen dashboard** (`/kitchen/<slug>`): a supervisor unlocks with the kitchen's 6-digit PIN and confirms or rejects each shift. `/kitchen/<slug>/poster` prints the QR poster.
- **Verified hours**: a kitchen shift appears in the volunteer's hour log as "Waiting for the kitchen to confirm", then "Verified by <name>". Verified hours draw solid in the ring; hours from the person's own log draw striped.
- **Proof** (`/proof`): one box per kind of activity for photos and PDFs, and a CF 888 (the state's volunteer-hours form) filled in on the phone for each organization. The page says how many hours a kitchen verified and that the county still needs the signed form or the organization's own word.
- **Keep your hours safe** (on `/log`): save a copy of the hours as a file, restore one, and a hint for adding the app to the Home Screen.
- **Demo mode** ("Try the demo" on the home page): a separate sample log, with a banner, that never touches real hours and never uses the network.
- **About** (`/about`) and **Privacy** (`/privacy`), linked from every screen.

## Privacy

The hours a person logs, their proof files, their screener answers and what they type into a CF 888 stay on their phone (IndexedDB and `sessionStorage`). There is no account, no analytics and no ad or tracking code.

Two things are sent:

- the language choice, as a cookie;
- kitchen check-in: the first name or nickname typed, check-in and check-out times, the kitchen, and a random ID for the phone. Supervisors at that kitchen see the name and times.

The hour log asks the server for kitchen shifts only on a phone that has checked in at a kitchen. Someone who never uses a kitchen never contacts the server from the log or the proof page (this is tested). The full statement is the `/privacy` page; the facts it cites live in `src/lib/site.ts`.

## Safety

The rules live in `rules/ca-calfresh-2026.json`, each with its official source URL and a verbatim quote. The file ships with `reviewedAt: null` because no advocate or caseworker has reviewed it yet. While `reviewedAt` is null, the app never says "likely exempt" / "Es probable que usted esté exento": every exemption shows "You may be exempt. Ask your county to confirm." instead (`displayOutcome` in `src/lib/rules/engine.ts`, tested for every exemption rule in `src/lib/rules/__tests__/real-file.test.ts` and end to end). The About page reads the same field and says the rules are unreviewed. Every result says "This is not a decision. Only your county can decide." The hour log doesn't assume the rule applies to you either: its 80-hour lines start with "If the rule applies to you" or "To reach 80".

A kitchen's confirmation is never presented as all the county needs. The state asks for a form signed by the organization, or the organization's own statement to the county (`docs/research/calfresh-rules-verification.md`, row 10b).

The Spanish texts are AI drafts that still need native and caseworker review (see `docs/AI-USE.md`).

## Commands

```bash
npm ci                          # install (also links the right Node, see below)
npm run dev                     # http://localhost:7050
npm test                        # unit tests (vitest)
npm run test:sql                # the database migration, in an in-memory Postgres
npm run build                   # production build (re-runs the rule-file tests first)
npm run e2e                     # builds, serves on :7051, runs Playwright on Chromium and WebKit
npm run build && npm run measure   # JS per route (budget: 200 KB on /, /screener, /log)
```

Playwright needs its browsers once: `node node_modules/@playwright/test/cli.js install chromium webkit`.

The browser tests always run against an in-memory mock backend. `playwright.config.ts` blanks the Supabase variables, so `npm run e2e` cannot write to a real project even when `.env.local` points at one.

Node 20.9+ is required. This machine has a stray Node 18 in `~/node_modules/.bin`, so the `postinstall` script links the real Node into `node_modules/.bin/node`. Run `npm run postinstall` after `npm i <package>`, and prefer npm scripts over `npx`.

`npm run measure` needs port 7050 free, so stop `npm run dev` first. With the real Supabase settings in `.env.local`, the check-in page (`/k/<code>`) measures about 220 KB because it loads the Supabase client; the three budgeted routes do not load it.

## The hosted backend (Supabase)

Only kitchen check-in uses a server. Without the two variables below, the rest of the app works and the check-in pages say check-in isn't set up.

1. Create a Supabase project and link it: `supabase link --project-ref <ref>`.
2. Apply the schema: `supabase db push --linked`.
3. Turn on anonymous sign-ins: `supabase config diff`, then `supabase config push`. `supabase/config.toml` declares only that one setting, and only declared settings are written.
4. Put the project URL and its **publishable** key in `.env.local` (see `.env.example`) and in the host's environment as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never the secret key: the app has no use for one.
5. Create a kitchen. This prints its QR code and its PIN once:
   ```bash
   supabase db query --linked "select * from public.create_kitchen('Kitchen name', 'kitchen-slug', null)"
   ```
6. For the keep-alive job (`.github/workflows/keepalive.yml`), set the repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`. A free project is paused after about a week without activity.

Optional: `NEXT_PUBLIC_CONTACT_EMAIL` is the address the About page shows. Until it is set, the page links to this repository's issues instead. `NEXT_PUBLIC_SITE_URL` is the address printed on QR posters.

## Built with

Every library below is someone else's work, used under its license. All of HourProof's own code is in this repository.

| Library | Used for | License |
|---|---|---|
| [Next.js](https://nextjs.org) 16 and [React](https://react.dev) 19 | the app framework | MIT |
| [next-intl](https://next-intl.dev) | English and Spanish text | MIT |
| [Tailwind CSS](https://tailwindcss.com) 4 | styling | MIT |
| [Supabase](https://supabase.com) (`@supabase/supabase-js`) | database and anonymous sign-in for kitchen check-in | MIT |
| [idb](https://github.com/jakearchibald/idb) | IndexedDB on the phone | ISC |
| [pdf-lib](https://pdf-lib.js.org) | filling the CF 888 on the phone | MIT |
| [qrcode](https://github.com/soldair/node-qrcode) | the kitchen's QR poster | MIT |
| [zod](https://zod.dev) | checking the rules file | MIT |
| [Vitest](https://vitest.dev) | unit tests | MIT |
| [Playwright](https://playwright.dev) | browser tests | Apache-2.0 |
| [PGlite](https://pglite.dev) | running the database tests in memory | Apache-2.0 |
| [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) | IndexedDB in unit tests | Apache-2.0 |
| [TypeScript](https://www.typescriptlang.org) | the language | Apache-2.0 |

Fonts: Inter and Plus Jakarta Sans (SIL Open Font License), served from the app itself through `next/font`.

The CF 888 form (`public/forms/cf888-template.pdf`) is the California Department of Social Services' own form, revision 5/25, re-saved without encryption so it can be filled on a phone. Its text is unchanged.

Hosting: Vercel (pages) and Supabase (kitchen check-in records). Tools: the Supabase CLI and GitHub Actions.

AI tools wrote much of the code and the first draft of the Spanish text. What they did, file by file, is in `docs/AI-USE.md`.

## Rights

© 2026 the HourProof team. All rights reserved.

There is deliberately no open-source license yet. The Congressional App Challenge rules say no other party should have any rights or interest in an entry, and an open-source license would grant rights to everyone. The team can choose a license after the challenge.
