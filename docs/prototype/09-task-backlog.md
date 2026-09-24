# 9. Task backlog

Written so each task can be handed to Claude Code as-is. Rebuild and run the matching
smoke test after every one.

## Quick wins

1. **Split the two unsplit prototypes.** `play-event-site.html` and
   `play-marketing.html` are single files; break them into `src/` parts like the others
   and extend `scripts/build.sh`. Do this before any substantial work on them.
2. **Swap in the real wordmark.** Replace `assets/zemmz-wordmark-traced.svg` with the
   client's vector, then update the mask in `src/live-marketing/mk_calm.css` and the
   footer.
3. **Arabic for the Live event sites.** The Play sites already do full RTL; port the
   approach to `src/live-site/`, starting with the medical example.
4. **Deep links between prototypes.** Links from the dashboard and marketing site to a
   specific example event currently land on the medical one. Read the hash on load in
   `cs_app.js` and select the matching event.

## Design

5. **Bring the Play marketing site in line** with the calm direction now used on Live,
   so the two products look like one company.
6. **A real mobile pass** over both dashboards. They are responsive, but a steward
   scanning at a gate on a phone deserves a layout designed for it, not a shrunken one.
7. **Print styles** for badges, e-tickets and certificates. They print, but the page
   margins and page breaks have not been tuned.

## Product gaps worth prototyping

8. **Refunds and cancellations** for paid tickets: organiser side and buyer side.
9. **Exhibitor and sponsor management** for the exhibition type, which currently
   borrows the conference setup.
10. **Team tournaments** in Play; only individual players are modelled.
11. **Prizes and payouts** in Play, not designed at all.
12. **An offline mode for check-in** — even a demo of what staff see when the venue
    wifi drops mid-scan would settle an important question.

## Before any client demo

13. Work through `docs/07-open-questions.md` and either confirm or remove every
    invented figure, name and claim.
14. Confirm the pricing in `docs/05-pricing.md`, especially the card processing rate
    and the AED 25 cap.
