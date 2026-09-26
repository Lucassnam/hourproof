

# HourProof — Product Requirements (PRD)

2026-09-25 · 

## Overview

HourProof helps CalFresh recipients keep their food benefits under the new 80-hour work rule: it checks if they're exempt, logs their hours, and turns them into proof the county will accept. Its built-in ShiftCred feature lets people earn verified volunteer hours at local kitchens by scanning a QR code at check-in and check-out.

Built for: Rep. Sam Liccardo's 2026 Congressional App Challenge (CA-16), whose theme is helping people access federal, state and local benefits and services. Submission deadline: Oct 26, 2026, 9:00 a.m. Pacific.

Goals by Oct 26
| 

Goal | 

Target | 

How we measure it | 
| 

Real people use it | 

15 pilot users | 

Accounts created at the partner site | 
| 

Hours logged | 

300+ hours | 

Sum of logged and verified hours | 
| 

Kitchen partner live | 

1 kitchen, 20+ verified shifts | 

QR check-ins confirmed by a supervisor | 
| 

Proof works | 

5 proof packets generated; 1 reviewed by a caseworker or advocate | 

Packets exported; reviewer quote | 
| 

Winning video | 

2–3 min video with live demo and pilot numbers | 

Uploaded public by Oct 24 | 

Non-goals for the challenge build: submitting anything to the county on the user's behalf, storing Social Security numbers or case numbers, and giving legal advice. HourProof organizes proof; the county decides eligibility.

## The problem and the rules HourProof encodes

Since June 1, 2026, many California adults on CalFresh can get benefits for only 3 months in a 36-month period unless they are exempt or do 80 hours a month of qualifying activity ([https://stgenssa.sccgov.org/debs/program_handbooks/calfresh/assets/CalFresh/ABAWDs/ABAWDTmLmt.htm] Santa Clara County handbook). In Santa Clara County, 55,000 of 133,000 recipients are at risk ([https://news.santaclaracounty.gov/federal-funding-cuts-threaten-calfresh-benefits-thousands-county-residents] County news); statewide, 562,000 could lose benefits ([https://www.kqed.org/news/12083922/calfresh-snap-new-work-requirements-rules-2026-hr1-eligibility-who-is-exempt-food-stamps] KQED).

Rules the app must encode (verify each with a caseworker or legal-aid advocate before launch):
| 

Rule | 

What it means in the app | 

Source | 
| 

Applies to ages 18–64 without a child under 14 in the household | 

Screener asks age and household first | 

[https://calfresh.guide/able-bodied-adults-without-dependents-abawads-work-rules-and-three-month-time-limit-for-employable-adults/] LSNC CalFresh Guide | 
| 

Fixed statewide clock: Jan 1, 2026 – Dec 31, 2028; enforced from June 1, 2026 | 

"Months used" counter shows months since June 2026 | 

[https://stgenssa.sccgov.org/debs/program_handbooks/calfresh/assets/CalFresh/ABAWDs/ABAWDTmLmt.htm] SCC handbook | 
| 

80 hours/month (20/week) of paid work, volunteering, workfare, training, or any combination | 

Hour log accepts all of these and sums them per calendar month | 

[https://calfresh.guide/able-bodied-adults-without-dependents-abawads-work-rules-and-three-month-time-limit-for-employable-adults/] LSNC, [https://wclp.org/calfresh-work-reporting/] WCLP | 
| 

Job search counts only up to 9 hours/week and only combined with other activities | 

Job-search hours are capped and flagged | 

[https://wclp.org/calfresh-work-reporting/] WCLP | 
| 

Exempt: unfit for work, pregnant, caring for a child under 14 or an incapacitated person, Indian/Urban Indian/California Indian, receiving or applying for unemployment or disability benefits, in addiction treatment, in school at least half-time, earning $217.50+/week | 

Screener covers every exemption and explains what proof helps (e.g., a medical provider statement) | 

[https://wclp.org/calfresh-work-reporting/] WCLP, [https://calfresh.guide/able-bodied-adults-without-dependents-abawads-work-rules-and-three-month-time-limit-for-employable-adults/] LSNC | 
| 

Veterans, people experiencing homelessness and former foster youth are no longer automatically exempt | 

Screener says so plainly; routes to "unfit for work" questions where relevant | 

[https://news.santaclaracounty.gov/federal-funding-cuts-threaten-calfresh-benefits-thousands-county-residents] County news | 
| 

Verification: documents, electronic checks, collateral contacts, or the client's statement | 

Proof packet bundles self-log, pay stubs, and supervisor-confirmed shifts (a collateral contact) | 

[https://calfresh.guide/able-bodied-adults-without-dependents-abawads-work-rules-and-three-month-time-limit-for-employable-adults/] LSNC | 
| 

Report within 10 days if hours drop below 20/week | 

Alert when the weekly pace falls below 20 | 

[https://wclp.org/calfresh-work-reporting/] WCLP | 
| 

Good cause: illness, family emergency, disaster, no transportation | 

"Something came up" button logs the reason and date | 

[https://wclp.org/calfresh-work-reporting/] WCLP | 
| 

Regain eligibility by doing 80 hours in any 30-day period | 

Shows a "get back on track" plan after a missed month | 

[https://wclp.org/calfresh-work-reporting/] WCLP | 
| 

College students: full-time undergrads at CCC/CSU/UC are exempt (LPIE) | 

Screener asks about school enrollment | 

[https://www.shfb.org/impact/blog/calfresh-work-requirements-2026-are-you-affected/] Second Harvest | 

Why existing tools miss it: Propel explains the rule but has no hour log, exemption screener or proof packet ([https://www.propel.app/snap/snap-work-requirements-full-guide/] Propel guide). BenefitsCal accepts uploads but doesn't help people track hours or warn them before they fall short. Volunteer apps log hours but produce nothing a county can use.

## Users and personas

Three kinds of users; the recipient is the one we design for first. Personas are composites for design, not real people — replace them with what we learn in interviews.
| 

Persona | 

Situation | 

Needs from HourProof | 

Constraints | 
| 

Recipient — "Marco," 34, Mountain View | 

Part-time warehouse shifts that vary week to week; lives in an RV; hit by the new rule | 

Know if he's exempt; see if he's on pace for 80 hours; fill gaps with volunteer shifts; one packet to show the county | 

Older Android phone, limited data, Spanish-first, may lose the phone | 
| 

Kitchen supervisor — "Dana," volunteer coordinator at a meal program | 

Runs weekend meal service with 30+ volunteers | 

Reliable volunteers; a 5-second way to confirm hours; no extra paperwork | 

Busy during service; shared tablet or her own phone | 
| 

Navigator — caseworker or benefits advocate at Second Harvest or a pantry | 

Helps many clients with CalFresh | 

Quick view of a client's status and packet when the client chooses to share it | 

Must not see anything the client hasn't shared | 

Design principles that follow: works on a cheap phone and a slow connection; large text and plain words (6th-grade reading level); Spanish at launch; no account wall before the exemption screener; the user owns their data and chooses what to share.

## Scope: what we build, in order

P0 ships in the pilot by Oct 13; P1 by the video on Oct 20; P2 is after the challenge.
| 

Priority | 

Feature | 

One-line description | 
| 

P0 | 

Exemption screener | 

2-minute yes/no questions; result: "likely exempt," "likely must meet 80 hours," or "ask your county" | 
| 

P0 | 

Phone sign-in | 

Phone number + text code; no email or password | 
| 

P0 | 

Hour log | 

Add hours by type (paid work, volunteer, training, workfare, job search); monthly progress ring to 80 | 
| 

P0 | 

ShiftCred QR check-in | 

Scan the kitchen's QR at start and end; supervisor confirms with one tap | 
| 

P0 | 

Proof packet (PDF) | 

Month summary + itemized hours + supervisor-confirmed shifts + attached pay stub photos | 
| 

P0 | 

Spanish + English | 

Every screen and the PDF in both languages | 
| 

P1 | 

Kitchen dashboard | 

Supervisor sees today's check-ins, confirms, and prints a QR poster | 
| 

P1 | 

Pace alerts by SMS | 

"You're at 42 of 80 hours with 9 days left" and below-20-hours-a-week warnings | 
| 

P1 | 

Months-used counter + good-cause log | 

Tracks months at risk since June 2026 and records good-cause reasons | 
| 

P1 | 

Pay stub photo capture | 

Snap a stub; user types hours (no OCR in MVP) | 
| 

P1 | 

Share with a navigator | 

Time-limited link a caseworker can open, revocable by the user | 
| 

P2 | 

Vietnamese, Chinese, Tagalog | 

Remaining CA-16 languages | 
| 

P2 | 

Shift finder | 

Open volunteer shifts at partner kitchens | 
| 

P2 | 

Medi-Cal work rule (Jan 2027) | 

Same engine for Medi-Cal's community-engagement requirement | 
| 

P2 | 

Pay stub OCR | 

On-device text recognition to prefill hours | 

Explicitly out of scope: connecting to BenefitsCal or CalSAWS, filing anything for the user, storing case numbers or SSNs, GPS tracking.

## Core user flows

Flow 1 — Recipient: screen, log, prove B[Pick language]
  B --> C[Exemption screener]
  C -->|Likely exempt| D[Exemption summary+ what proof helps]
  C -->|Must meet 80 hrs| E[Sign in with phone]
  C -->|Unsure| F[Ask your county+ script and number]
  E --> G[Home: progress ring]
  G --> H[Add hours orscan kitchen QR]
  H --> G
  G --> I[Month done:download proof packet]]]>

The screener works without an account, so anyone can check their status in two minutes. Only people who must meet the 80 hours are asked to sign in.

Flow 2 — ShiftCred: volunteer check-in at a kitchen>A: Scan kitchen QR (arrive)
  A-->>V: Checked in 10:02
  V->>A: Scan QR again (leave)
  A->>K: Confirm 3h 10m for Marco?
  K->>A: Confirm
  A-->>V: Shift verified ✓ added to log]]>

The supervisor confirms from a list on the kitchen dashboard or from a text message. Unconfirmed shifts still count in the log but are marked "self-reported" in the packet.

## Functional requirements

### 1. Exemption screener (P0)
- 

One question per screen, big buttons (Yes / No / Not sure), back button always visible.
- 

Order: age → child under 14 in household → pregnant → caring for an incapacitated person → health condition limiting work to under 20 hrs/week → tribal identity → unemployment/disability benefits → addiction treatment → school half-time+ → earns $217.50+/week → already working 20+ hrs/week.
- 

Any "yes" to an exemption ends early with "You're likely exempt" + which exemption + what proof helps + "tell your county." Any "not sure" routes to the county script.
- 

Rules live in one data file (rules/ca-calfresh-2026.json) with a source URL and review date per rule, so a reviewer can check them without reading code.
- 

Result screen always shows: "This is not a decision. Only your county can decide."

### 2. Hour log (P0)
- 

Entry fields: date, activity type, hours (0.25 steps), place (optional), note (optional), proof photo (optional).
- 

Home screen: progress ring for the current month (e.g., 52/80), weekly pace bar vs 20/week, days left.
- 

Activity types map to rule categories; job search capped at 9/week and flagged if not combined with another activity.
- 

Edits allowed until the month's packet is generated; after that, edits create a visible correction entry.

### 3. ShiftCred QR check-in (P0)
- 

Each kitchen gets a printable QR poster encoding a signed, rotating kitchen token (no personal data in the QR).
- 

Scan 1 = check-in timestamp; scan 2 = check-out. Missing check-out after 8 hours auto-closes and asks the user to confirm the end time.
- 

Supervisor confirms via dashboard or SMS reply ("Y" to confirm). Confirmed shifts show a check mark and the supervisor's first name and role in the packet.
- 

Anti-fraud basics: one open shift per user; shifts over 10 hours need supervisor edit; supervisor can reject with a reason.

### 4. Proof packet (P0)
- 

One PDF per month, English or Spanish: user's name (as entered), month, total hours by type, pass/short status vs 80, itemized table, supervisor-confirmed shifts marked, attached photos, good-cause entries, and a signature line.
- 

Footer on every page: "Prepared by the participant using HourProof. Supervisor-confirmed entries were verified by the listed organization."
- 

Generated on demand; the user downloads or shares it (print, text, email). HourProof never sends it to the county.

### 5. Alerts (P1)
- 

SMS (opt-in): weekly pace check every Monday; alert if the weekly pace drops below 20 (with the 10-day reporting reminder); 5 days before month end if under 80.
- 

Quiet hours 9 p.m.–8 a.m.; STOP to opt out.

### 6. Kitchen dashboard (P1)
- 

Supervisor sign-in by phone; sees today's check-ins, pending confirmations, and a monthly roster export (CSV).
- 

Print QR poster button; rotate token if a poster is misused.

## Data model and architecture

Stack (assumed: a small student team, 30 days, works on any phone without an app store): a Next.js installable web app (PWA), Supabase for database and phone sign-in, Twilio for SMS. One codebase, free tiers, deploys in minutes.
| 

Layer | 

Choice | 

Why | 
| 

App | 

Next.js 15 (App Router) + TypeScript + Tailwind CSS, installable PWA | 

Runs on any phone browser; no app store review before Oct 26 | 
| 

Data + auth | 

Supabase (Postgres, Row Level Security, phone OTP) | 

Users only ever read their own rows; kitchens only their shifts | 
| 

SMS | 

Twilio (Supabase phone auth provider + alerts) | 

Works on flip phones; STOP handled | 
| 

PDF | 

@react-pdf/renderer, generated server-side | 

Same layout in English and Spanish | 
| 

QR | 

qrcode for posters; browser camera scan with @zxing/browser | 

No native app needed | 
| 

i18n | 

next-intl with en and es message files | 

Every string translated from day one | 
| 

Hosting | 

Vercel | 

Free, preview links for testers | PWA] --> N[Next.js on Vercel]
  K[Kitchen tabletdashboard] --> N
  N --> S[(SupabasePostgres + Auth)]
  N --> T[Twilio SMS]
  N --> P[PDF generator]]]>

Everything goes through the Next.js server; the database enforces who can see what with Row Level Security.

Tables
| 

Table | 

Key fields | 

Who can read | 
| 

profiles | 

id, phone, display_name, language, sms_opt_in, created_at | 

The user | 
| 

screener_results | 

id, user_id (nullable), answers (json), outcome, rules_version, created_at | 

The user; anonymous results stored without id only as counts | 
| 

activities | 

id, user_id, date, type (work/volunteer/training/workfare/job_search), hours, place, note, photo_path, source (self/shift), created_at | 

The user | 
| 

kitchens | 

id, name, address, qr_token_hash, active | 

Public name only | 
| 

kitchen_staff | 

kitchen_id, user_id, role (supervisor) | 

Staff of that kitchen | 
| 

shifts | 

id, user_id, kitchen_id, check_in, check_out, status (open/pending/confirmed/rejected), confirmed_by, reason | 

The user and that kitchen's staff | 
| 

good_cause | 

id, user_id, date, reason, note | 

The user | 
| 

packets | 

id, user_id, month, language, pdf_path, generated_at | 

The user | 
| 

share_links | 

id, user_id, token_hash, expires_at, revoked | 

The user; viewer via token only | 

## Privacy, safety, accessibility and languages

Our users may be immigrants, unhoused, or afraid of losing benefits, so trust is the product.
- 

Collect the minimum. Phone number, display name, hours. Never SSN, case number, address, immigration status, or precise location.
- 

User owns the data. Export everything; delete account deletes all rows and photos within 24 hours. Share links expire in 7 days and can be revoked.
- 

No selling, no ads, no analytics that identify people. Only counts (e.g., screener completions) for the challenge video.
- 

Not legal advice. Every result carries "This is not a decision — only your county can decide," plus the county CalFresh number. Rules reviewed by a legal-aid or caseworker partner before the pilot.
- 

Minors on the team, adults as users. Pilot users are adults recruited through the partner; get the partner's OK for any filming and a signed release from anyone shown on video.
- 

Accessibility (WCAG 2.1 AA). Body text 18px+, contrast 4.5:1+, tap targets 48px+, works with screen readers and at 200% zoom, no information by color alone.
- 

Low-end devices. First load under 200 KB of JS on the home route; works on 3G; offline hour entry that syncs later.
- 

Languages. English and Spanish at launch, written at a 6th-grade level and reviewed by a native Spanish speaker from the partner; Vietnamese, Chinese and Tagalog next.

## Brand direction

Direction: premium, dark-first product design in the spirit of studios like [https://rondesignlab.com/] Rondesignlab — deep near-black surfaces, one vivid signature accent, soft rounded cards, crisp data visuals — adapted so it stays readable for people on old phones in bright sunlight. It's an original identity inspired by that aesthetic, not a copy of their work ([https://dribbble.com/RonDesignLab] Dribbble).

Personality: calm, on your side, precise. It should feel like a bank-grade tool, not a charity flyer — dignity is the point.
| 

Token | 

Dark (default) | 

Light | 

Use | 
| 

bg | 

#0E1116 | 

#F6F7F9 | 

Page background | 
| 

surface | 

#171B22 | 

#FFFFFF | 

Cards | 
| 

surface-2 | 

#1F2530 | 

#EEF1F5 | 

Raised cards, inputs | 
| 

text | 

#F2F4F7 | 

#0E1116 | 

Primary text | 
| 

text-muted | 

#A3ACB9 | 

#4B5563 | 

Secondary text | 
| 

proof (signature) | 

#3DDC97 | 

#127A52 | 

Progress ring, verified check, primary buttons | 
| 

pace | 

#FFB547 | 

#9A5B00 | 

Warnings: behind pace | 
| 

signal | 

#8B7CFF | 

#5B4BDB | 

Links, ShiftCred / kitchen accents | 
| 

danger | 

#FF6B6B | 

#B42318 | 

Errors, rejected shifts | 
- 

Type: Plus Jakarta Sans (headings, numbers) + Inter (body). Both free on Google Fonts and cover Spanish accents. Scale: 40 / 28 / 20 / 18 / 16px.
- 

Shape: 20px card radius, 999px pills, 1px hairline borders at 8% white on dark.
- 

Signature element: the 80-hour ring — a thick progress ring that fills in proof green; verified shifts appear as solid segments, self-reported as striped.
- 

Logo idea: a clock-face ring whose last segment turns into a check mark.
- 

Motion: 150–250ms ease-out; the ring animates when hours are added; respects "reduce motion."

Every text color above was checked against its backgrounds: all pairs are 4.5:1 or higher (lowest: proof and signal on surface-2 at 4.7:1). Button text: bg on proof is 10.7:1 in dark mode; white on proof is 5.3:1 in light mode.

The full brand-identity prompt (for an image or design tool) and the design tokens for code are in the project files: hourproof-brand-prompt.md and CLAUDE.md.

## Build milestones: Sept 25 – Oct 26

The pilot starts Oct 13, so the P0 features must be done in 18 days.
| 

Dates | 

Milestone | 

Done when | 
| 

Sep 25–28 | 

Partner + rules check | 

Second Harvest or a kitchen agrees to a pilot; a caseworker or legal-aid advocate agrees to review the screener rules | 
| 

Sep 29–Oct 2 | 

Design + setup | 

Brand kit made from the prompt; 6 key screens in Figma or on paper; repo, Supabase project, Vercel deploy live | 
| 

Oct 3–8 | 

Build P0 core | 

Screener, phone sign-in, hour log, progress ring working in English and Spanish | 
| 

Oct 9–12 | 

Build ShiftCred + packet | 

QR poster, check-in/out, supervisor confirm, PDF packet | 
| 

Oct 13–19 | 

Real pilot | 

15 users, 1 kitchen; daily bug fixes; collect numbers and 2 quotes | 
| 

Oct 20–23 | 

Film + polish | 

2–3 min video: story → numbers → competitors → live demo → pilot results → stack; accessibility pass | 
| 

Oct 24 | 

Submit | 

Video public; written answers done; AI-use disclosure written; repo link ready if judges ask | 

Challenge deliverables checklist
- 

Registered on congressionalappchallenge.us with every teammate listed
- 

Public 1–3 min video with names, app name, purpose, audience, tools/languages, live demo
- 

Written answers (purpose, inspiration, technical challenges, what we learned, next steps)
- 

AI-use disclosure: which parts AI helped with, and the core logic we wrote ourselves
- 

Clean GitHub repo with README and setup steps

## Risks and open questions
| 

Risk | 

Why it matters | 

Mitigation | 
| 

Rules are wrong or change | 

A wrong "you're exempt" could cost someone benefits | 

Rules in one reviewed data file with sources; "not a decision" on every result; partner review before pilot | 
| 

County won't accept the packet | 

Proof is the whole point | 

Ask a caseworker what they accept; packet shows supervisor-confirmed entries as a collateral contact | 
| 

No kitchen partner in time | 

No verified shifts to show | 

Pitch 3 kitchens this week; fall back to Second Harvest volunteer shifts | 
| 

Users don't trust a new app | 

Fear of benefits loss and data misuse | 

Partner introduces the app; minimal data; no account for the screener | 
| 

Scope creep | 

30 days is short | 

P0 only until Oct 13; everything else waits | 
| 

Fake check-ins | 

Undermines trust with counties | 

Supervisor confirmation, rotating QR tokens, shift length limits | 

Open questions
- 

What exact documents does Santa Clara County accept for volunteer hours? (Ask Second Harvest's CalFresh team.)
- 

Which kitchen will pilot ShiftCred: Hope's Corner, St. Anthony's, or Loaves & Fishes?
- 

Who on the team builds what, and what coding experience does each person have?
- 

Should the PDF include a supervisor signature field, or is the confirmation record enough?

## Sources

Opened Sept 23–25, 2026.
- 

[https://stgenssa.sccgov.org/debs/program_handbooks/calfresh/assets/CalFresh/ABAWDs/ABAWDTmLmt.htm] Santa Clara County CalFresh handbook — ABAWD time limit
- 

[https://calfresh.guide/able-bodied-adults-without-dependents-abawads-work-rules-and-three-month-time-limit-for-employable-adults/] LSNC Guide to CalFresh — ABAWDs and the 3-month time limit
- 

[https://wclp.org/calfresh-work-reporting/] Western Center on Law & Poverty — CalFresh work reporting rule
- 

[https://news.santaclaracounty.gov/federal-funding-cuts-threaten-calfresh-benefits-thousands-county-residents] County of Santa Clara — federal cuts threaten CalFresh
- 

[https://www.kqed.org/news/12083922/calfresh-snap-new-work-requirements-rules-2026-hr1-eligibility-who-is-exempt-food-stamps] KQED — CalFresh work requirements June 2026
- 

[https://www.shfb.org/impact/blog/calfresh-work-requirements-2026-are-you-affected/] Second Harvest — CalFresh work requirements 2026
- 

[https://www.propel.app/snap/snap-work-requirements-full-guide/] Propel — SNAP work requirements guide
- 

[https://www.congressionalappchallenge.us/wp-content/uploads/2026/05/2026-CAC-Rules.pdf] 2026 Congressional App Challenge rules (PDF)
- 

[https://liccardo.house.gov/services/congressional-app-challenge] Rep. Liccardo — Congressional App Challenge
- 

Brand reference: [https://rondesignlab.com/] Rondesignlab · [https://dribbble.com/RonDesignLab] Rondesignlab on Dribbble