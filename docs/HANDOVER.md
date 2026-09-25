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
| **Marketing site** | `/`: the landing page from `live-marketing.html` (hero, how it works, who it's for, pricing, questions, footer with the wordmark), `/contact` for demos, questions and enterprise enquiries, `/help`, `/terms` and `/privacy` (drafts awaiting legal review). Requests are stored and emailed to `SALES_EMAIL`. |
| **Signup and onboarding** | `/signup` in the prototype's 11 steps: account, a 6-digit email code, organisation, type of event, the event, tickets, a step that changes by type (CME and accreditation, gates and pass-outs, after-event content, certificates), form fields, logo and colour with a contrast check, team invitations, plan. Finishing creates the event with everything the answers imply and shows a checklist built from the real data. People who stop part-way resume where they left off. |
| **Plans and trial** | Every new organisation starts on a free trial of 50 confirmed attendees, enforced inside the registration transaction; a dashboard banner shows usage. Owners ask to activate a plan from Organisation → Plan; zemmz staff (`PLATFORM_ADMIN_EMAILS`) activate or pause plans at `/admin`, where website requests also land. |
| **Accounts** | Email and password sign-in, hashed session tokens, four roles (Owner, Admin, Content editor, Check-in staff) enforced on every page and action. Check-in staff only reach the console. Forgot password (single-use link, 2 hours; resets sign out everywhere). Your account: name, password, sign out other devices. |
| **Team** | Organisation → People with access: invite by email with a role (link valid 7 days), resend or cancel, change roles, remove access (signs them out). Only owners manage owners; the last owner can't be removed. Organisation details and an organisation-wide activity log. |
| **Files** | Logos (website header, badges, e-tickets), photos of faculty, speakers and artists, after-event photo galleries and slides. Checked by their bytes, never their name; stored on disk or S3. Attendee-only files need the claim link. Recordings are links to the organiser's video host. |
| **Help centre** | In each event's dashboard: guides for before, on the day and after, in that event's words, and five on-screen tours that highlight the real controls. A public version at `/help`. |
| **Arabic** | Each event's website can be English, Arabic, or both with a switch. All interface text, error messages, badges, certificates and emails have Arabic versions; the layout is right to left with an Arabic typeface. Organiser text appears as written. |
| **Events** | All events, New event (type first; defaults per type), event switcher, per-event timezone and currency. Settings: name, dates, timezone (fixed once there's a schedule), currency (fixed after the first order), pass-outs for gates, archive and restore. |
| **Event type model** | `packages/shared/src/event-types.ts`, ported from the prototype's `TYPES`. Every view takes its nouns from it (Delegates, Attendees, Ticket holders; Faculty, Speakers, Line-up; Sessions, Entrances). All seven types exist; the last three borrow the closest configuration, as the spec says. |
| **Dashboard** | KPIs by type with a comparison period, quick settings (the client's three switches) with a live homepage preview, today's sessions, 14-day chart, breakdown by the type's first profile field, recent activity. |
| **Registrations** | Search as you type across name, ID, email and mobile; filters; sort; pagination; CSV export (formula-injection safe); record page with attendance per session, minutes and CME points; edit; resend confirmation; cancel and restore with a confirm dialog; add someone; printable badge or e-ticket with a Code 39 barcode; filter by the type's first profile field or by registered today; tick several to print their badges together. |
| **Check-in** | Add, edit and delete sessions or gates (times, room, chairs, CME points, capacity, the ticket a gate accepts; gates may close after midnight). Export attendance with in and out times. Sessions or gates by day with live counts. Console: a large scan field for keyboard-wedge scanners, in/out modes, colour-and-words feedback, capacity limits, wrong-gate refusals with directions, pass-outs, recent scans from the database, demo simulate buttons (hidden in production). |
| **Messages** | Confirmation email editor with merge tags and live preview; send to an audience (everyone, checked in, not checked in, in a session now) by email or SMS; sent log with delivery status; send me a test. |
| **Tickets** | Ticket types with price, capacity, sold and a progress bar; on-sale switches; add, edit, and delete while unsold; capacity can't drop below what's sold. Promo codes with a percentage, optional use limit and an on/off switch. Payments tab shows the provider's real state and the ticket fee. |
| **Certificates & CME / Certificates** | Issuing switch, eligible and not eligible counts, downloads. Medical: how points are earned (time in the room with a threshold, or checking in). Others: minimum sessions. Optional evaluation first. Points or sessions distribution. Certificate template editor with a live preview per eligible person, using the same component as the printed certificate. |
| **After-event / After-show page** | Summit, concert, gala and exhibition: what to show (recordings, slides, photos, survey), who can open it, the message, and a live preview. |
| **Evaluation / Feedback** | Report from real answers: responses, averages per rating, tick-box counts, latest comments, CSV export. Form builder: add, edit, reorder, delete questions; reset to the KIMS (medical) or standard template while nobody has answered. |
| **Faculty / Speakers / Line-up** | Search, category filter, add, edit, delete; biography, display order (set times for concerts), homepage highlight. |
| **Website** | General (homepage introduction), registration or checkout form builder (show, require, reorder, add custom fields including dropdowns, delete custom fields) with a live preview, page editor (rich text, add, publish, delete), venue, menu (hide built-in and custom pages), theme with a live contrast check. |
| **Raffle / Giveaway draw** | Draw from everyone who checked in, everyone, or one session or gate; leave out past winners; the pick is made on the server with a cryptographic generator and logged; full-screen result for the stage; winners list. |
| **Settings** | Event name, short name and organiser; people with access; full activity log. (Venue, colour and homepage text moved to Website; the CME rule to Certificates & CME.) |
| **Public sites** | `/e/<slug>`: four site characters (medical, conference, summit, concert) themed from the event's own colour with automatic contrast; people, programme or set times, venue, custom pages; maintenance mode. |
| **Registration** | Free: one form built from the event's own form fields; one registration per email (a repeat resends the confirmation instead of duplicating). Paid: three steps (tickets, details, payment), promo codes, the capped ticket fee from `docs/prototype/05`, one ID and e-ticket per ticket. |
| **After the event** | Claim needs the ID **and** the registration email. People who never checked in are refused with an explanation. Medical: KIMS evaluation, then a printable certificate with CME points from time in the room. Conference: certificate of attendance. Summit: recordings and slides page. Concert: after-show page and survey. |
| **Worker** | Every 20 s: moves sessions between upcoming, live and ended, and delivers the email outbox (SendGrid via `fetch`, or `log` locally) with retries and backoff. |
| **Deploy** | Standalone Next build, two Dockerfiles, docker-compose, Caddyfile, GitHub Actions (test → ECR → SSH deploy with migrations first), `/api/health`. |
| **Tests** | 81 vitest tests. Integration tests run on a real Postgres and cover the race conditions that matter at a door (see section 5). |

## 2. Not built yet

Everything designed in the Live prototypes is built. What's left is outside
them, or waits on a decision:

1. **zemmz Play**: all three prototypes. It shares the website builder, theming, roles and messaging but little else (docs/prototype/08).
2. **A real payment provider** (and refunds). The checkout uses a stand-in that never takes card details; see section 6.
3. **Card billing for plans.** Plans are invoiced and activated by zemmz staff at `/admin`. Online subscription billing needs the payment provider first.
4. **Single sign-on** ("Continue with Microsoft" in the prototype) and **custom domains per event**. Both are listed on the enterprise plan; neither is designed.
5. **Bilingual organiser content.** Arabic sites translate the interface; an event's own text (name, pages, biographies) is in whichever language the organiser writes it. Separate English and Arabic versions of that text would be the next step.
6. **An offline mode for check-in** (docs/prototype/09, task 12).
7. **Uploading video files.** Recordings are links to a video host, as the prototype's onboarding offers.

Left out on purpose from the prototype's Tickets → Payments tab: the VAT,
"pass the fee on" and refund-window switches. Nothing behind them exists yet,
so a switch would promise something the product doesn't do. From the marketing
prototype: the client-logo row and the testimonial, which docs/prototype/07
lists as unconfirmed.

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
- **Screens that edit the same thing live in one place.** The prototype had
  venue, colour and homepage text in both Settings and Website, and the CME
  rule in both Settings and Certificates. They're now only in Website and
  Certificates & CME; Settings links to them.
- **Hiding built-in website pages** (people, programme, venue) uses
  `Event.navHidden`. Hidden pages stay reachable by their address.
- **The page editor** uses `contenteditable` and offers only the formatting the
  sanitiser keeps (headings, bold, italic, underline, lists, links, quotes). The
  prototype's colour and alignment buttons are left out because the sanitiser
  would remove what they did.
- **Ticket types that someone holds, or that a gate accepts, can't be deleted**;
  they can be taken off sale. Custom form fields can be deleted; built-in ones
  can only be hidden.
- **Evaluation questions** can be edited after people answer, but not change
  type. Reset to the template only works while there are no responses.
- **One organisation per account**, as before: an invitation to an email that
  already belongs to another organisation is refused with an explanation.
- **Signup verifies the email before anything else exists.** The account is
  created at step 1 but has no organisation until the 6-digit code is entered.
- **The free trial is counted across the organisation**, in the same
  transaction as the registration, so people racing for the last trial places
  can't overshoot it (tested). It's 50 confirmed attendees, as priced in
  docs/prototype/05; section 5.5 there still asks whether it should be
  time-based instead.
- **Plans are activated by people.** `/admin` is open only to the emails in
  `PLATFORM_ADMIN_EMAILS`; it isn't a role in the database, so no organiser
  can grant it.
- **Files are checked by their first bytes** (PNG, JPEG, WebP, GIF, PDF). SVG
  is refused because it can carry scripts. Every file is served from `/files`
  with a sandboxing Content-Security-Policy; public ones are cached for good
  because keys are never reused.
- **The prototype's marketing CSS is used as is**, scoped under `.mkt` by a
  script, so the dashboard's styles and the marketing styles can't collide.
- **Arabic text lives in one file**, `packages/shared/src/site-text.ts`, next
  to the English it mirrors. A test fails if an Arabic string is missing.
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
- Reset, invitation and email-code secrets are stored only as SHA-256 hashes;
  codes allow five tries; sign-up, reset and contact forms are rate limited.
- Changing or resetting a password, and removing someone, signs them out
  everywhere else.
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
- **The marketing site's promises.** Pricing, plan limits, "single sign-on" and
  "on-site support" on the enterprise plan are the prototype's proposal, not
  signed off; SSO isn't built. Confirm or soften them before launch.
- **Plan limits after the trial** (1 event and 1,000 attendees on Single event,
  6 events on Season) are shown on the Plan tab but not enforced; decide
  whether they should block or just prompt a conversation.

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
- [ ] `PLATFORM_ADMIN_EMAILS` and `SALES_EMAIL` set; someone owns `/admin` requests
- [ ] `STORAGE_PROVIDER=s3` with a bucket in the right region, or `UPLOAD_DIR` on a backed-up volume
- [ ] Terms and privacy policy reviewed by a lawyer (they say they're awaiting review)
- [ ] The Arabic reviewed by a native editor (`packages/shared/src/site-text.ts`)
- [ ] Shared rate limiting if more than one web container runs
- [ ] Patch the existing production Next.js (section 3)
