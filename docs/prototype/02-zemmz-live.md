# 2. zemmz Live — specification

Covers `live-marketing.html`, `live-dashboard.html` and `live-event-sites.html`.

## 2.1 The event type model

Every event has a type. The type is chosen during onboarding and in the New event
dialog, and it sets two things: the **words** the product uses and the **modules**
that exist. In the prototype this lives in `TYPES` in `src/live-dashboard/N3a.js`.

Each type defines, at minimum:

```
guest / guests      Delegate, Attendee, Ticket holder, Guest
people / person     Faculty, Speakers, Line-up
unit / units        Session, Entrance
ckNav               Schedule & check-in, Agenda & check-in, Entry & gates
credits             true only for medical (CME points exist)
cert                'cme' | 'attendance' | 'none'
certNav             Certificates & CME, Certificates, After-event page, After-show page
evalNav             Evaluation (medical, KIMS) | Feedback
openLbl             Registration | Ticket sales
afterLbl            Certificate issuing | After-event page | After-show page
idName              Registration ID | Ticket ID
f1 / f2             the two profile fields: Speciality + Hospital, Discipline + Studio,
                    Role + Company, Ticket + City
cats                categories for the people list
inLbl / outLbl      Checking in / Checking out, Entering / Leaving
shape               avatar shape: hexagon, square, circle, rounded
```

Adding a type means adding an entry to `TYPES` and, if it needs demo data, an entry in
`EVDEF`. Nothing else should need editing. If you find yourself writing the word
"delegate" or "session" into a view, take it from the type instead.

## 2.2 Organiser dashboard

Four sample events, switchable from the event menu, each deliberately at a different
stage so the same screens can be seen in different states:

| Event | Type | State |
|---|---|---|
| 5th Gulf Heart Summit | medical | Live, day 1, session 3 running |
| Form Week 2026 | conference | Live, day 2, two parallel sessions running |
| Majlis Founders Summit | summit | Ended, after-event page switched on |
| Nocturne Live | concert | Doors open, three gates live |

### Screens

**Dashboard.** KPIs that change by type (registrations or tickets sold, revenue when
paid, checked in, in the room now, certificates or recording views). Quick settings —
the three switches from the client's original deck — control what the public homepage
shows, with a live preview of the result. Today's sessions or gates, a 14-day sales
chart, and a breakdown by the type's first profile field.

**Registrations / Attendees / Ticket holders.** Search as you type across name, ID,
email and mobile. Filters, sorting, bulk selection. Print ID opens the badge, or the
e-ticket for concerts, with a real Code 39 barcode and `window.print()`. Edit opens
the record with its attendance and points.

**Tickets.** Ticket types with price, capacity, sold and a progress bar; on-sale
switches; promo codes; payment settings. Free events show one free type.

**Schedule & check-in / Entry & gates.** Sessions by day, or gates for a concert.
Opening one gives the **check-in console**: a scan field that accepts a barcode
scanner or typed ID, an in/out mode switch, colour-coded feedback (welcome, already
checked in, wrong gate, not found, session full), live counts, a recent-scan feed, and
simulate buttons for demos. Concerts allow pass-outs; sessions with a capacity refuse
scans when full.

**Certificates & CME / Certificates / After-event page.** Branches on the type:
- *medical*: how points are earned (time in the room with a percentage threshold, or
  simply checking in), eligibility, an editable certificate template with live preview
  per delegate, and the accreditation wording.
- *conference*: certificates of attendance, minimum sessions attended, same template
  editor without credits.
- *summit and concert*: an after-event page instead — choose what to show (recordings,
  slides, photos, survey), decide whether only people who came can open it, and a
  preview of the public page.

**Evaluation / Feedback.** A report with averages, the ticked-statement counts and
comments, plus a form builder. Medical events use the KIMS-standard question set.

**Faculty / Speakers / Line-up.** List with photos, categories, biographies, display
order, and set times for concerts.

**Messages.** The automatic confirmation email with merge tags and a live preview, a
send-a-message tool with audiences (everyone, checked in, not checked in, in the
session now, speakers) by email or SMS, and a sent log.

**Website.** General details, the registration or checkout form builder with live
preview, page editor, venue, menu, and theme with a contrast check.

**Raffle / Giveaway draw.** Draw from people who checked in, exclude past winners,
full-screen result for the stage.

**Settings.** Event details, admins and check-in staff roles, activity log.

**All events, Help centre.** Event list with types and states; 3 stages of guides with
5 guided on-screen tours.

## 2.3 Public event websites

`live-event-sites.html` contains four complete event websites, one per type, each with
its own visual identity. The demo bar switches event and homepage state.

Shared structure: homepage with the registration or ticket panel always visible,
people page with biography dialogs, agenda or set times, venue with map and
directions, an information page, and a past editions or FAQ page.

**Registration and checkout.** Free events use a single form. Paid events use three
steps — choose tickets, details, payment (card or Apple Pay, promo codes) — and issue
one ID per ticket, with a barcode per e-ticket for concerts.

**Homepage states.** Registration or tickets open; after the event (certificate claim,
recordings unlock, or an after-show page); maintenance.

**The attendance gate.** In the after state, entering an ID that attended proceeds;
an ID that registered but never checked in is refused with an explanation. Demo IDs
are 1001 and 1002 (attended) and 1003 (no-show).

## 2.4 Marketing site and onboarding

A deliberately calm page: hero, three how-it-works cards, who it's for, pricing, four
questions, and the blue footer with the oversized wordmark carried over from the
client's own design.

**Onboarding, 11 steps:** account, email code, organisation, **type of event**, event
details, tickets or registration, a step that changes by type (CME and accreditation /
gates and pass-outs / after-event content / certificates), form fields, brand colour
and logo with a contrast check, team invites with roles, plan. It ends on a checklist
of what is set up and what is left.
