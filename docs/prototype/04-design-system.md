# 4. Design system

## 4.1 Brand

The wordmark is a heavy display serif, lowercase, in `#321EDC`. Both files are in
`assets/`: the original PNG from the client and an SVG traced from it. **Replace the
traced SVG with the client's real vector file** — the trace has slightly softer
corners than the original.

Brand blue `#321EDC` is the company colour. It appears in the Live marketing site and
its footer. The products themselves use their own accents, and each customer's event
website uses the customer's colour.

## 4.2 Colour

**Live marketing site** (the calm direction, `src/live-marketing/mk_calm.css`):

| Token | Light | Purpose |
|---|---|---|
| `--z-paper` | `#FFFFFF` | page |
| `--z-mist` | `#F3F4F8` | alternating sections, cards |
| `--z-ink` | `#14142B` | text |
| `--z-slate` | `#56597A` | secondary text |
| `--z-rule` | `#E1E3EC` | borders |
| `--z-blue` | `#321EDC` | buttons, icons, footer |

Dark values are defined for every token under `prefers-color-scheme: dark`.

**Dashboards**: brand `#0B5CFF`, navigation `#00032E`, success `#0F7A52`, warning
`#9A5B00`, danger `#C8323A`, each with a dark-mode counterpart.

**Event websites** are themed per event, since each customer brands their own site:

| Event | Accent | Character |
|---|---|---|
| Medical summit | `#B3122E` | serif, hexagon avatars, formal |
| Design conference | `#C2410C` | grid paper, square avatars, light hero |
| Founders summit | `#0E5E4E` | green and gold, circular avatars |
| Concert | `#7C3AED` | dark theme, magenta, poster-scale type |

## 4.3 Type

| Where | Family | Notes |
|---|---|---|
| Live marketing | Schibsted Grotesk | one family, 400–800 |
| Dashboards | system sans | speed and familiarity |
| Medical event site | Source Serif 4 + Inter | authority |
| Design conference | Space Grotesk | contemporary |
| Founders summit | Fraunces | editorial |
| Concert | Unbounded | poster |

Headings use tight tracking (about `-0.03em`) at display sizes. Body text stays under
80 characters a line. Avoid all-caps labels above headings.

## 4.4 Components

Shared across prototypes: buttons (primary, secondary, ghost, danger), switches,
custom dropdowns (native `<select>` was replaced because it could not be styled to
match), chips, tabs, tables with sticky headers, modals, toasts, empty states,
skeleton loaders, badges and status pills, contrast-checked colour pickers, barcodes
(Code 39, drawn as SVG), and avatars in four shapes.

## 4.5 Rules that are not negotiable

- **Contrast is checked in the product, not assumed.** Where a customer picks a
  colour, the interface calculates the ratio, switches button text between white and
  dark automatically, and warns when a pair fails. Keep this behaviour if you refactor.
- **Status colour follows meaning**: green done, amber needs attention, red stopped or
  failed. The original Figma had these inverted; see the audit.
- **Every destructive action is separated from benign ones** and confirmed with a
  dialog that names the consequence.
- **Every state exists**: empty, loading, error and success are designed, not implied.
- **Keyboard and screen reader**: real labels, `aria-pressed` / `aria-current` /
  `aria-expanded`, focus visible, Escape closes overlays, arrow keys move within
  custom dropdowns.
- **Motion is restrained**: one reveal per section, hover feedback, and animations that
  answer an action. All of it disabled under `prefers-reduced-motion`.
- **Arabic is first class**: full RTL mirroring, Arabic typefaces previewed in their
  own face, and mirrored editor toolbars.
