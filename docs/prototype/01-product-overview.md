# 1. Product overview

## The two products

**zemmz Live** runs live events end to end: a public event website, registration or
ticketing, badges and e-tickets, check-in at doors or gates, and whatever the event
owes people afterwards — certificates, CME points, recordings or photos.

**zemmz Play** runs esports tournaments: a branded tournament website in English and
Arabic, player registration and verification, brackets, and score reporting where
players upload screenshots that admins confirm.

They share the zemmz brand and the same underlying idea — the organiser controls a
public website from a private dashboard — but they serve different buyers and are
sold separately.

## Who buys Live

| Buyer | What they run | What they care about |
|---|---|---|
| Government and public sector | Forums, national events, public registration | Roles, audit trail, Arabic, procurement-friendly pricing |
| Hospitals and medical societies | Congresses, CME meetings | CME points, accredited certificates, evaluation reports |
| Universities and associations | Conferences, member events, graduations | Certificates of attendance, low admin effort |
| Companies and summit organisers | Summits, forums, investor days | Paid tickets, recordings, lead data |
| Promoters and cultural venues | Concerts, festivals, galas | Fast gates, ticket tiers, pass-outs, capacity |

The GCC is the home market: UAE, Kuwait, Saudi Arabia, Qatar, Bahrain and Oman.
Arabic and right-to-left layouts are a requirement, not a feature.

## Who buys Play

Community leagues and campus cups, brands and agencies running seasons, and
federations or publishers running circuits across many titles.

## The spine of Live

One rule runs through the whole product and comes from the client's original 2020
deck: **attendance is verified, and only verified attendance unlocks what comes
after.** Someone who registers but never scans in cannot claim a certificate, CME
points or the recordings. Every part of the product exists to serve that chain:

```
register / buy  →  unique ID  →  confirmation email  →  badge or e-ticket
      →  scan in (and out)  →  attendance and time in the room
      →  certificate, CME points, recordings, or an after-show page
```

## The spine of Play

```
player registers  →  verification  →  bracket  →  match played
      →  both players upload screenshots  →  admin confirms or flags a conflict
      →  bracket advances  →  standings and prizes
```

## Event types in Live

The event's type decides the vocabulary and which modules exist. This is the single
most important design decision in the product: one platform that does not feel
generic, because it speaks each organiser's language.

| Type | People | Units | After the event | Tickets |
|---|---|---|---|---|
| Conference | Speakers | Sessions | Certificate of attendance | Paid tiers |
| Medical conference | Faculty | Sessions | CME points, accredited certificate, KIMS evaluation | Usually free |
| Summit or business event | Speakers | Sessions | Recordings and slides for attendees | Paid tiers |
| Concert or festival | Line-up | Entrances | Photos and a post-show survey | Paid tiers |
| Workshop or training | Trainers | Sessions | Certificate of completion | Paid |
| Exhibition or trade show | Exhibitors | Entrances | Visitor reports | Visitor and exhibitor passes |
| Gala, launch or party | Hosts | Entrances | Photos and thanks | Invitation or paid |

The first four have full sample data in the prototypes; the last three reuse the
closest configuration.
