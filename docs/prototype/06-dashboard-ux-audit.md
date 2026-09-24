# 6. Dashboard UX audit

Findings from reviewing the client's original Figma dashboard file for zemmz Play
(about 70 screens, file key `4zT6ZTUJNgWqGejDxwDKYD`), assessed against established
usability principles. The prototypes fix all of these; this record exists so the
same problems don't come back, and because most apply to zemmz Live too.

## Fixed in the prototypes

1. **Status colours were inverted.** Pending was green and Completed was orange.
   Colour has to follow meaning: green done, amber waiting, red stopped.
2. **No timezone anywhere in scheduling.** For events with international participants
   this causes missed matches. Timezone is now explicit.
3. **Destructive actions sat beside benign ones.** "End Tournament" was a button in a
   row of ordinary buttons. Destructive actions are now separated, styled differently
   and confirmed with a dialog that names the consequence.
4. **No project or event context.** Nothing told you which event you were editing.
   There is now a persistent event switcher showing name, type and dates.
5. **Five overlapping ideas of "settings"** across the navigation. Now grouped:
   Event, Content, Tools.
6. **Tab labels did not match their content.** Renamed to what is inside them.
7. **Twelve identical blue buttons in a table.** Primary and secondary actions are
   now visually ranked, with an overflow menu for the rest.
8. **Wrong placeholders** — "Alison G." in an email field, a date in a time field.
   Placeholders now show the expected format.
9. **Add User mixed single and bulk entry** in one modal. Separated.
10. **Eight identical artwork upload fields** with no indication of which was which.
    Now labelled with purpose and expected size.
11. **Chip groups with nothing selected** by default, so the state was ambiguous.
12. **Contradictory dummy data** (more players than users) that made review harder.
13. **KPIs with no comparison period** — a number with nothing to judge it against.
14. **No empty, loading, error or success states**, no pagination, no mobile layout,
    no dark mode. All now designed.

## Principles applied

- **Hick's law**: the number of choices on a screen drives decision time. Grouped
  navigation, an overflow menu instead of twelve equal buttons.
- **Jakob's law**: people expect your product to work like others they use. Search
  behaves like search, tables sort like tables, green means done.
- **Fitts's law**: important targets are large and near where the eye already is; the
  scan field on the check-in console is the biggest thing on the screen.
- **Doherty threshold**: feedback under 400ms. Search filters as you type, scan
  feedback is immediate.
- **Von Restorff**: one thing stands out per screen, not five.
- **Tesler's law**: complexity has to live somewhere. CME rules, contrast checking and
  score conflicts are handled by the system rather than pushed onto the organiser.
