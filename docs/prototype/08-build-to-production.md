# 8. From prototype to production

These files are a specification you can click, not a foundation to build on. The HTML,
CSS and copy are worth keeping; the JavaScript is demo scaffolding.

## 8.1 What to carry over

- **Every screen, flow and piece of interface copy.** The wording has been worked on
  carefully and is part of the design.
- **The CSS**, including the design tokens, dark mode and the RTL work.
- **The event type model.** `TYPES` in `src/live-dashboard/N3a.js` is the product's
  core abstraction and should survive into the real schema.
- **The rules**: attendance gates what comes after; CME points from time in the room
  with a threshold; contrast checked wherever a customer picks a colour.

## 8.2 What a real build needs

**Data model, roughly:**

```
Organisation
  User (owner, admin, content editor, check-in staff)
Event            type, dates, timezone, venue, branding, status
  TicketType     name, price, capacity, on sale
  Registration   unique ID, profile fields, ticket, payment, source
  Session/Gate   day, start, end, room, capacity, credits
  Attendance     registration, session, scanned in, scanned out
  Faculty        name, category, biography, photo, order, set time
  Certificate    template, rule, issued records
  Evaluation     questions, responses
  Message        template, audience, channel, sent log
  ActivityLog    actor, action, timestamp
```

**Services**: authentication with roles, payments and refunds, transactional email and
SMS, PDF generation for certificates and badges, file storage for photos and
screenshots, and a barcode or QR scanner path that works offline at a door and syncs
later. Offline tolerance matters more than it sounds: venue wifi fails, and a gate
cannot stop.

**Public sites** are multi-tenant: each event needs its own domain or subdomain, its
own theme and its own content, rendered fast and indexable.

**Scale checks**: a concert gate scanning several hundred people a minute, and search
across tens of thousands of registrations that still feels instant.

**Compliance**: data residency, retention, consent for marketing messages, VAT
invoicing, and an audit trail government buyers can inspect.

## 8.3 Suggested order

1. Events, registration and the public event site for one type. Get a real event
   through registration to confirmation email.
2. Badges, e-tickets and the check-in console. This is the part that earns trust.
3. Certificates and CME, then evaluation. This is what makes medical clients stay.
4. Ticketing and payments.
5. The remaining event types, which by then should be configuration rather than code.
6. Play, which shares the website builder, theming, roles and messaging but little else.

## 8.4 Testing

`tests/` has a Playwright smoke test per prototype that walks the main flows,
screenshots key screens, and fails on any console error. They are demo-era tests, but
the flows they walk are the flows a real build must keep working:

```bash
pip install playwright && playwright install chromium
python3 tests/smoke-live-dashboard.py
```

Note that the test environment blocks Google Fonts, so screenshots show fallback
typefaces. That is the sandbox, not a bug in the pages.
