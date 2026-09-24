# Handover: zemmz Live platform

Prepared 24 September 2026. The starting point was the six prototypes and nine
documents in `docs/prototype/` (from the `zemmz-handoff` package) plus the
change log `zemmz-changes.txt`. This codebase implements **zemmz Live** in
your developers' stack. **zemmz Play is not started.** It follows once Live is
agreed (docs/prototype/08, "Suggested order", step 6).

## 1. What works today

Everything below runs against a real database, survives reloads, and is shared
between the dashboard and the public sites. This was the prototypes' biggest
limitation.

| Area | Built |
|---|---|
| **Accounts** | Email and password sign-in, hashed session tokens, four roles (Owner, Admin, Content editor, Check-in staff) enforced on every page and action. Check-in staff only reach the console. |
| **Events** | All events, New event (type first; defaults per type), event switcher, per-event timezone and currency. |
| **Event type model** | `packages/shared/src/event-types.ts`, ported from the prototype's `TYPES`. Every view takes its nouns from it (Delegates, Attendees, Ticket holders; Faculty, Speakers, Line-up; Sessions, Entrances). All seven types exist; the last three borrow the closest configuration, as the spec says. |
| **Dashboard** | KPIs by type with a comparison period, quick settings (the client's three switches) with a live homepage preview, today's sessions, 14-day chart, breakdown by the type's first profile field, recent activity. |
| **Registrations** | Search as you type across name, ID, email and mobile; filters; sort; pagination; CSV export (formula-injection safe); record page with attendance per session, minutes and CME points; edit; resend confirmation; cancel and restore with a confirm dialog; add someone; printable badge or e-ticket with a Code 39 barcode. |
| **Check-in** | Sessions or gates by day with live counts. Console: a large scan field for keyboard-wedge scanners, in/out modes, colour-and-words feedback, capacity limits, wrong-gate refusals with directions, pass-outs, recent scans from the database, demo simulate buttons (hidden in production). |
| **Messages** | Confirmation email editor with merge tags and live preview; send to an audience (everyone, checked in, not checked in, in a session now) by email or SMS; sent log with delivery status. |
| **Settings** | Event details with a live contrast check on the brand colour, CME rule and threshold (medical), people with access, full activity log. |
| **Public sites** | `/e/<slug>`: four site characters (medical, conference, summit, concert) themed from the event's own colour with automatic contrast; people, programme or set times, venue, custom pages; maintenance mode. |
| **Registration** | Free: one form built from the event's own form fields; one registration per email (a repeat resends the confirmation instead of duplicating). Paid: three steps (tickets, details, payment), promo codes, the capped ticket fee from `docs/prototype/05`, one ID and e-ticket per ticket. |
| **After the event** | Claim needs the ID **and** the registration email. People who never checked in are refused with an explanation. Medical: KIMS evaluation, then a printable certificate with CME points from time in the room. Conference: certificate of attendance. Summit: recordings and slides page. Concert: after-show page and survey. |
| **Worker** | Every 20 s: moves sessions between upcoming, live and ended, and delivers the email outbox (SendGrid via `fetch`, or `log` locally) with retries and backoff. |
| **Deploy** | Standalone Next build, two Dockerfiles, docker-compose, Caddyfile, GitHub Actions (test → ECR → SSH deploy with migrations first), `/api/health`. |
| **Tests** | 65 vitest tests. Integration tests run on a real Postgres and cover the race conditions that matter at a door (see section 5). |

## 2. Designed in the prototype, not built yet

These are in the navigation with an honest "Designed, not built yet" page that
says what they will do.

1. **Tickets module** (manage types, prices, capacity, promo codes). The data model and checkout already use them; there's no editing screen yet.
2. **Certificates & CME settings screen** (template editor with live preview). Certificates are already issued; the template is edited in the database for now.
3. **Evaluation report and form builder.** Questions and responses are stored; the report screen isn't built.
4. **Faculty / Speakers / Line-up editor.** The public site shows them; the editor isn't built.
5. **Website editor** (form builder, page editor, menu, theme).
6. **Raffle / giveaway draw.**
7. **Inviting people** to the organisation by email, and password reset.
8. **Help centre and guided tours.**
9. **File uploads**: photos, logos, recordings and slides. Recordings tiles show "to be uploaded".
10. **The marketing site and onboarding** (`live-marketing.html`). It's a static marketing site and belongs on its own, or as a later route here.
11. **Arabic on the Live event sites.** This was already an open question in the prototype.
12. **zemmz Play**: all three prototypes.

Suggested order: 1, 2, 4, 5 (they unblock an organiser running an event alone),
then 7 and 9, then 3 and 6, then Arabic, then Play.

## 3. Decisions made while building, and why

- **Next.js 15.5.26, not 15.5.4.** npm flags 15.5.4 as affected by
  CVE-2025-66478, a remote code execution flaw in React Server Components.
  15.5.26 is a patch release in the same minor line. **Your production is
  on 15.5.4 and should be patched regardless of this project.**
- **React pinned to 19.1.x and Tailwind to 4.1.x** with `overrides`. Caret
  ranges had pulled in React 19.3 and Tailwind 4.3, and two copies of React
  break hooks.
- **Zod 3.25.** Its API is shared with Zod 4 for what's used here; move up when
  the rest of your codebase does.
- **Auth is built in, with no auth library.** scrypt from `node:crypto`,
  random session tokens stored as SHA-256 hashes, `HttpOnly` `SameSite=Lax`
  cookies. It's small enough to read in one sitting (`apps/web/src/lib/auth.ts`).
  Swap in your standard if you have one.
- **Money is integer minor units**, per currency (KWD has 3 decimals). The fee
  is computed per ticket on the discounted price and capped. Only the AED
  figures come from the pricing proposal; the other currencies are placeholder
  conversions (`packages/shared/src/money.ts`).
- **Times are UTC in the database and shown in the event's timezone.** The
  Figma audit's finding 2 (no timezone anywhere) is fixed by design.
- **Attendance is stored as intervals**, one row per time in the room. Leaving
  and coming back adds a row, so CME minutes and concert pass-outs are exact.
- **Session status is stored and kept current by the worker**, as your
  existing worker does for its transitions.
- **Public IDs are sequential per event, allocated with a row lock.** They're
  never reused. Because they're guessable, links to tickets, orders and
  certificates are HMAC-signed, and claiming after the event needs the email too.
- **Emails go through an outbox table.** The web app only inserts rows; the
  worker delivers them. A registration and its email commit or fail together.
- **The payment provider is a stand-in.** It collects no card data: the buyer
  chooses approve or decline. In production it refuses to take money until a
  real provider is configured. Seats are taken and the charge made in one
  transaction, so a decline releases everything. With a real provider that
  transaction shouldn't wait on a network call: reserve seats with an expiry,
  redirect to the provider's hosted page, confirm on its webhook.
- **The prototype's demo "simulate" buttons are kept** on the check-in console
  in development only.
- **Organiser-written HTML is sanitised** with a small allowlist sanitiser
  (`packages/shared/src/sanitize.ts`) before it's shown or emailed. A later
  rich-text editor should keep using it.

## 4. Security notes

- Every dashboard query is scoped by organisation. A guessed slug from another
  organisation gives the same 404 as a missing one (tested).
- Server Actions check origin themselves; the JSON scan endpoint checks
  `Origin` explicitly.
- Rate limiting (`apps/web/src/lib/rate-limit.ts`) is in memory. That's fine
  for one web container; with several, move it to Postgres or Redis.
- `SESSION_SECRET` must be set to 32 or more random characters in
  production. The app refuses to sign links without it.
- **Keep Postgres in UTC** (RDS defaults to UTC). Raw SQL here converts
  explicitly, but anything written later should too; see section 5.
- A repeat registration with the same email tells the visitor "already
  registered" (and emails them). That confirms to anyone who knows the email
  that the person registered. Decide whether that's acceptable for medical
  and government events.

## 5. Bugs found and fixed during the build

- **Duplicate emails with several workers.** A concurrency test (three workers,
  one queue) sent 61 emails for 40 messages. The cause: raw SQL compared UTC
  timestamps with JavaScript dates, and on a Postgres not set to UTC (this
  machine is in Asia/Dubai) the worker thought freshly claimed messages had
  been stuck for hours and re-queued them. Fixed with explicit UTC conversion,
  and "stuck" is now judged by a new `claimedAt` column.
- **Enter could pay.** In the three-step checkout, pressing Enter in a field on
  step 1 or 2 triggered the form's first submit button, which was Pay. Enter now
  moves to the next step or applies the promo code.
- **Seed data that contradicted itself** (audit finding 12): activity lines about
  sessions that hadn't started, evaluations during day one, a certificate date
  before the event. The seed now follows the real clock.
- **Certificates issued while points were still being counted.** A delegate
  still in a live session would have got a certificate with 0 points. The
  certificate now waits until the session ends.

## 6. Open questions (new, plus the prototype's still open)

New:
- **Payment provider** for the Gulf (hosted card fields, Apple Pay, KNET for
  Kuwait?). Needed before any paid ticket is sold.
- **SMS provider.** SMS rows are queued and fail with "No SMS provider
  configured" when SendGrid is the email provider.
- **Refunds.** Cancelling a paid registration doesn't refund; the organiser is
  told to handle it with the provider.
- **One organisation per user** is assumed. Agencies running events for several
  clients will need an organisation switcher.
- **Custom domains per event** (`events.client.com`): Caddy can issue the
  certificates; the app needs a host-to-event lookup in middleware.

Still open from `docs/prototype/07-open-questions.md`: every name, figure and
organisation in the seed is fictional; the CME activity number and KIMS
certificate wording need checking with KIMS; pricing (card rate, the AED 25
cap, VAT); data residency for government and hospital buyers; attendee data
ownership; the traced wordmark.

## 7. Before going live

- [ ] Real payment provider, then remove `PAYMENT_PROVIDER=mock`
- [ ] `MESSAGING_PROVIDER=sendgrid`, a verified sender domain (SPF, DKIM)
- [ ] `SESSION_SECRET`, `APP_URL`, `DATABASE_URL` set in the host's `.env`
- [ ] Postgres timezone UTC; automated backups on RDS
- [ ] Remove or replace every fictional name and figure (docs/prototype/07)
- [ ] Password reset and invitations (section 2, item 7), since today users are created by the seed
- [ ] Shared rate limiting if more than one web container runs
- [ ] Patch the existing production Next.js (section 3)
