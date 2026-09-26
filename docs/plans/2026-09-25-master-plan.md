# HourProof master plan: Sep 25 – Oct 26, 2026

**Goal:** a working, demoable HourProof (screener → hour log → ShiftCred check-in → proof packet) in English and Spanish, submitted to the CA-16 Congressional App Challenge by **Sat Oct 24** (the hard deadline is Mon Oct 26, 9:00 a.m. PT, and nothing can change after it).

**Inputs:** PRD (Claude Doc, snapshot `docs/PRD-snapshot-2026-09-25.md`) · review `docs/plans/2026-09-25-prd-review.md` · research `docs/research/calfresh-rules-verification.md`, `docs/research/challenge-and-tech-risks.md`, `docs/research/ca-calfresh-2026.draft.json`.

## Decisions locked (user, 2026-09-25)
| Topic | Decision |
|---|---|
| Recipient sign-in | Supabase **anonymous** session on the device, with an optional email link to back up. No phone OTP, no Twilio for the challenge. |
| Supervisor sign-in | Email magic link |
| Pilot | **Demo-first.** Seeded demo mode makes the whole app demoable without a partner. A real pilot is a stretch goal with **go/no-go on Oct 3.** |
| Team | Team of 2–4 with some coders. Each phase names an owner. Claude agents build the tasks nobody claims. |
| Theme | **Light by default**, dark as an option. Same token names as the PRD. |

## Decisions I made (flag any you disagree with)
| Topic | Decision | Why |
|---|---|---|
| Framework | Next 16 (App Router) + TypeScript + Tailwind v4, installable PWA | The current version, and what your other projects use. The PRD's Next 15 is a version behind. |
| Node | `engines >=20.9`, plus a `postinstall` that links `node_modules/.bin/node → $npm_node_execpath` | `~/node_modules/.bin/node` is Node 18 and silently runs every npm script under your home folder. Next 16 fails on it. |
| Recipient data | **Local-first** (IndexedDB). Hours and pay-stub photos stay on the phone. Only shifts and kitchen data live in Supabase. | Pay stubs hold addresses and SSN digits. This also makes offline entry free. |
| Proof packet | Built **in the browser** (pdf-lib, lazy-loaded only on `/packet`) | The photos never leave the device, there's no Vercel 4.5 MB response cap and no cold start. |
| Volunteer proof | The packet includes a **CF 888–style verification page per organization**: hours, supervisor name and phone, and a signature line | CDSS requires volunteer hours to be signed by an org representative or stated verbally to the county. A tap in the app is not a collateral contact ([research](../research/calfresh-rules-verification.md) row 10b). |
| QR | `qr-scanner` (native BarcodeDetector where available), lazy-loaded only on `/scan` | @zxing adds about 124 KB gzipped, most of the 200 KB budget |
| Rules | `rules/ca-calfresh-2026.json` from the verified draft. The app **will not say "likely exempt" while `reviewedAt` is null**; it says "you may be exempt — ask your county to confirm." | A safety rule the code enforces, not a promise |
| Months-used counter | **Removed.** Replaced with "check BenefitsCal for your official count." | The real count depends on the person's H.R. 1 screening date and full-month rules the app can't see (research row 5) |
| Supabase keep-alive | A GitHub Actions cron pings the database every 3 days until Jan 15, 2027 | The free tier pauses after 7 idle days, and judging runs to Jan 15 |

## Phases
Each phase ends at a **gate**: a demo on a real phone plus passing tests. We go through phases one at a time, and each gets its own detailed plan in `docs/plans/` written just before it starts, so it can use what the last phase taught.

| # | Dates | Phase | Gate (done when) | Owner |
|---|---|---|---|---|
| 0 | Sep 25–26 | Decisions + research | Done: this file, the review and both research files | Claude |
| 1 | Sep 26–Oct 1 | **Foundation + exemption screener** | The screener runs in English and Spanish on a phone through a Vercel URL. The engine is tested against all 18 rules. The "likely exempt" wording is gated on `reviewedAt`. Tokens, light/dark, installable. | ___ |
| 2 | Oct 2–6 | **Hour log (local-first) + demo mode** | Log hours offline. The ring and weekly pace are correct. The monthly engine enforces the rules: workfare can't be combined, job search counts only inside a program. "Try the demo" loads a seeded month. | ___ |
| 3 | Oct 7–11 | **ShiftCred** | Supabase schema + RLS (tested). Signed, rotating kitchen QR token and a printable poster. Check-in and check-out from phone A, confirm or reject on phone B, and the shift lands in A's log as verified. | ___ |
| 4 | Oct 12–15 | **Proof packet** | A monthly PDF in English and Spanish: summary, itemized hours, a CF 888–style page per org, photos, good cause, signature lines. Generated offline on a phone. | ___ |
| 5 | Oct 16–20 | **Real-world pass** | Pilot if the Oct 3 answer was go, otherwise 3–5 usability sessions. WCAG AA pass. Spanish reviewed by a native speaker. Rules reviewed by a caseworker (fills in `reviewedAt`) or left gated. P1 items only if the gate is already green. | ___ |
| 6 | Oct 21–24 | **Submission** | Video of 1–3 min, public on YouTube, that explains the code (5 of 30 rubric points). Written answers, AI-use disclosure, every library credited, README, public repo, keep-alive cron on. **Submit Oct 24.** | ___ |

**Human track (runs in parallel; nobody else can do these):**
| By | Task | Why |
|---|---|---|
| Sep 28 | Register on congressionalappchallenge.us: a personal (not school) email, 9-digit ZIPs, parent name and email, the eligibility quiz, then invite teammates | You can't open the application until this is done |
| Sep 29 | Email 3 kitchens + Second Harvest's CalFresh team (Claude can draft these) | The pilot, and the question of what SCC accepts for volunteer proof |
| Sep 29 | Ask a legal-aid or caseworker contact to review `rules/ca-calfresh-2026.json` | The only way to turn on "likely exempt" wording |
| Oct 3 | **Pilot go/no-go** | No signed partner means no pilot. Nothing else changes. |
| Oct 10 | A native Spanish speaker reviews `messages/es.json` | P0 requirement |
| Ongoing | Keep `docs/AI-USE.md` as you go | The disclosure is required, and judges can demand the source code |

## PRD corrections to apply (from research, all sourced)
1. "Already working 20+ hrs/week" → its own result: "The rule applies to you and you're meeting it." It's not an exemption.
2. Child under 14 means *in your CalFresh household* (the people you buy and cook food with). Add the **child under 6 (can live elsewhere)** exemption.
3. Add the missing exemptions: work 30+ hrs/week, CalWORKs work rules, ORR training at least half-time.
4. School: **half-time**, not full-time. LPIE is a student-eligibility exemption, not a time-limit exemption.
5. Workfare **cannot be combined** with other activities. Job search counts **only inside** an E&T, WIOA or Trade Act program.
6. Drop the months-used counter (see above).
7. Volunteer proof = a signed CF 888 or similar, not a "collateral contact."
8. Cite CDSS ACL 26-29 as the primary source. WCLP's dates and age range are out of date.
9. The Challenge checklist is missing: explaining the code in the video, crediting every library, parent contact, the 9-digit ZIP, the eligibility quiz, the post-deadline exit questionnaire for each member, and that refusing a source-code request means disqualification.

## How agents are used (multi-agent orchestration)
- **Per phase:** I write the phase's detailed plan, then run `superpowers:subagent-driven-development`. A fresh implementer agent takes each task (tasks with no shared files run in parallel in separate git worktrees), a fresh reviewer agent checks each task against the plan, and one whole-branch review closes the phase.
- **Teammates:** any task can say `Owner: <name>` instead. A human-owned task gets the same plan text, and the reviewer agent still checks it.
- **Verification:** every "done" comes with real command output (exit codes, `vitest` counts, a `next build` log). The UI is checked with Playwright screenshots at 360 px wide plus your phone.
