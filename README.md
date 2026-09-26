# HourProof

HourProof is an installable web app for California CalFresh recipients facing the H.R. 1 work rule: adults it covers must show 80 hours a month of work, volunteering or an approved program to keep their food benefits. It is built for old phones and for Spanish-first users. Phase 1 is the exemption screener: one plain question per screen, ending in "the rule likely doesn't apply", "you may be exempt, ask your county", "you're meeting it" or "the rule likely applies", always with the proof that helps and the county phone number. Later phases add an hour log, a kitchen QR check-in and a proof packet to hand the county. It is an entry for the Congressional App Challenge (CA-16).

## Setup

```bash
nvm use            # reads .nvmrc; any Node 20.9+ works
npm ci
npx playwright install chromium
# if npx resolves Node 18 (see below):
#   node node_modules/@playwright/test/cli.js install chromium
npm test           # unit tests (vitest)
npm run build      # also re-runs the rule-file tests first (prebuild)
npm run e2e        # builds, serves on :7051, runs Playwright
npm run dev        # http://localhost:7050
```

`npm run e2e` uses port 7051, so it can run while `npm run dev` holds 7050. `node scripts/measure-js.mjs` measures page weight per route after a build (it starts and stops its own server on 7050).

### Node 18 shim

This machine has a stray `~/node_modules/.bin/node` (Node 18), and npm puts every ancestor `node_modules/.bin` on `PATH`, so npm scripts can silently run Node 18. The `postinstall` script links the real Node into `node_modules/.bin/node`. `npm ci` and a bare `npm i` run it for you; `npm i <package>` does not, so run `npm run postinstall` after adding a package. Check with `npm exec -- node -v` (must be v20.9 or higher). `npx` can still pick up Node 18, which is why the Playwright install has a direct fallback above.

## Safety

The rules live in `rules/ca-calfresh-2026.json`, each with its official source URL and a verbatim quote. The file ships with `reviewedAt: null` because no advocate or caseworker has reviewed it yet. While `reviewedAt` is null, the app never says "likely exempt" / "Es probable que usted esté exento": every exemption shows "You may be exempt. Ask your county to confirm." instead (`displayOutcome` in `src/lib/rules/engine.ts`, tested for every exemption rule in `src/lib/rules/__tests__/real-file.test.ts` and end to end). Every result says "This is not a decision. Only your county can decide." The Spanish texts are AI drafts that still need native and caseworker review (see `docs/AI-USE.md`). Nothing the user answers leaves the phone: answers stay in `sessionStorage`, and there is no analytics.
