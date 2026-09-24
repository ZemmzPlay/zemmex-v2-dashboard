# 3. zemmz Play — specification

Covers `play-marketing.html`, `play-dashboard.html` and `play-event-site.html`.

## 3.1 What Play does

An organiser gets a branded tournament website in English and Arabic and a dashboard
to run it: player registration and verification, brackets, match scheduling, score
reporting by screenshot, standings and prizes.

The prototypes were built from the client's existing Figma dashboard file, with the
problems listed in `docs/06-dashboard-ux-audit.md` fixed rather than reproduced.

## 3.2 Tournament organiser dashboard

**Dashboard.** Registrations, active tournaments, matches awaiting score confirmation,
players online, with comparison periods on every figure.

**Tournaments.** List, then a tournament with tabs: overview, participants, bracket,
**score reports**, settings.

- *Bracket*: rounds and matches, each showing its state — awaiting result, under
  review, confirmed — with Review and Enter result actions.
- *Score reports*: the flow the client asked for specifically. Both players upload a
  screenshot of the result. The admin sees them side by side, with conflicts flagged
  when the two disagree or a screenshot is cropped. The admin types the real score,
  confirms the winner and the bracket advances. They can also ask a player for a new
  screenshot.

**Players.** Search, verification status (verified, pending, blacklisted), country,
team, and the ability to correct details.

**Website.** Page editor with a full formatting toolbar in both English and Arabic
(mirrored for right-to-left), menu, socials across 12 networks with placement, and
artwork uploads per game.

**Theme.** Rebuilt to match the client's Figma: theme version, 18 English and 11
Arabic typefaces each previewed in its own face, base colour plus four accents,
automatic light or dark button text, link darkening, and **advanced colour options**
for the navigation bar, tournament section, collapsed and expanded cards, sponsors and
footer — each pair contrast-checked, with Fix and Fix all.

**Users, settings, account, help centre** with guided tours.

## 3.3 Tournament website

Example: Gulf Esports League. English and Arabic with full RTL. Registration with
mobile OTP, tournament pages, rules, bracket, standings, sponsors, and **My matches**,
where a player reports a score by uploading a screenshot.

## 3.4 Marketing site and onboarding

Hero with a live bracket demo, features, pricing, FAQ, and a seven-step onboarding:
account, email code, organisation, first tournament, game and format, brand, plan.

## 3.5 What Play still needs

- Split `play-event-site.html` and `play-marketing.html` into `src/` parts like the
  other four, so they can be edited safely.
- The Play marketing site has not had the calm redesign the Live one received. If the
  client wants the two sites to feel like one company, this is the next design job.
- Prize distribution and payouts are not designed at all.
- Team-based tournaments are implied but only single players are modelled.
