# CLAUDE.md

Context for working on this repository. Read `docs/HANDOVER.md` for status.

## What this is

The production build of zemmz Live (conferences, medical congresses, summits,
concerts), made from the clickable prototypes in `docs/prototype/`. The
prototype HTML is the design spec: when building a screen that isn't done yet,
open the matching prototype and follow its flow, copy and states.

## Commands

```bash
npm run dev          # web :3000 + worker
npm run typecheck
npm test             # vitest; integration tests use a separate zemmz_test database
npm run build
npm run db:migrate   # after editing packages/db/prisma/schema.prisma
npm run db:seed      # resets data to the four sample events
```

After a change: typecheck, run the tests, and load the affected pages.
Sign in locally as owner@zemmz.test; the password is printed by the seed.

## Rules that are not negotiable

- **Nouns come from the event type.** Never write "delegate", "session",
  "faculty" in a view; use `eventType(event.type)` from `@zemmz/shared`.
- **Only verified attendance unlocks what comes after.** Certificates, CME,
  recordings: all check attendance rows.
- **CME only exists for medical events** (`TY.credits`).
- **Contrast is checked, not assumed** wherever a customer picks a colour
  (`textOn`, `fixContrast`, `contrastRatio`).
- **Every dashboard query is scoped** by the user's organisation via
  `requireEvent` / `requirePermission` in `apps/web/src/lib/auth.ts`.
- **Organiser HTML goes through `sanitizeRichText`** before display or email.
- **Emails go through the outbox** (`OutboundMessage`); never call a provider
  from the web app.
- **Raw SQL compares timestamps in UTC**: `(${date}::timestamptz AT TIME ZONE 'UTC')`.
- **Destructive actions** use `ConfirmButton`, which names the consequence.

## Copy

British English ("organiser"), sentence case, no exclamation marks. Money as
`AED 7,500` (`formatMoney`), dates as `22–23 September 2026`
(`formatDateRange`), 24-hour times in the event's timezone. Errors say what
happened and what to do next. Mid-sentence ID labels use `lowerFirst` ("ticket ID").

## Where things are

- Shared rules: `packages/shared/src` (event types, attendance/CME, money, time)
- Server logic: `apps/web/src/lib` (auth, registrations, check-in, email, stats)
- Dashboard: `apps/web/src/app/events/[slug]/…`
- Public sites: `apps/web/src/app/e/[slug]/(site)` and `(pass)` (attendee-owned pages)
- Worker: `apps/worker/src` (jobs.ts, providers.ts)
- Styles: `apps/web/src/app/globals.css` (dashboard tokens and components),
  `apps/web/src/app/e/site.css` (public sites, scoped to `.site`)
