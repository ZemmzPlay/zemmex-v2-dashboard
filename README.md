# zemmz platform

zemmz Live: registration, ticketing, check-in and certificates for conferences,
medical congresses, summits and concerts. This repository is the production
codebase built from the clickable prototypes in `docs/prototype/`.

**Read `docs/HANDOVER.md` first.** It lists what is built, what is not, the
decisions behind the code and the open questions.

## Stack

| | |
|---|---|
| App | Next.js 15.5 (App Router), React 19.1, TypeScript 5.6, Tailwind CSS 4.1, Zod |
| Data | Prisma 6.19.3, PostgreSQL 16 |
| Worker | `apps/worker`: plain Node run with tsx, ticks every 20 s |
| Email | SendGrid v3 API via `fetch` (`MESSAGING_PROVIDER=sendgrid`) |
| Tooling | npm workspaces, concurrently, vitest (integration tests on real Postgres) |
| Deploy | Docker (node:22-alpine, standalone Next), Caddy 2, GitHub Actions, ECR |

```
apps/web          Next.js: organiser dashboard (/events), public event sites (/e/<slug>)
apps/worker       session status transitions, outbox delivery
packages/shared   event-type model, attendance and CME rules, fees, contrast, schemas
packages/db       Prisma schema, migrations, seed (the four sample events)
infra/            Dockerfiles, Caddyfile
tests/            vitest global setup and factories
docs/             HANDOVER.md, and the prototype specs and HTML under prototype/
```

## Run it locally

Needs Node 22 and PostgreSQL 16 (native, or `docker compose up -d db`).

```bash
cp .env.example .env          # then set DATABASE_URL
npm install
npm run db:migrate            # creates tables
npm run db:seed               # four sample events, ~2,700 registrations
npm run dev                   # web on http://localhost:3000 + worker
```

On Windows right after installing Node, `scripts\dev-windows.cmd` does the last
step without needing a new terminal.

Sign in at `/login` with `owner@zemmz.test`, `editor@zemmz.test` or
`desk@zemmz.test` (check-in staff). The seed prints the password. Emails are not
sent locally; read them at `/outbox`.

`SEED_CLOCK=demo npm run db:seed` shifts every event so the current moment is
the one the prototype showed (medical session 3 running, concert doors open).
The default puts the events on real dates, so what is live depends on the time.

## Demo routes

| Where | What to try |
|---|---|
| `/events/gulfheartsummit` | Medical dashboard, quick settings, live sessions |
| `/events/gulfheartsummit/check-in` | Open a live session, scan `1001`, then scan it again |
| `/events/nocturnelive/check-in` | Gate A: *Simulate a wrong gate*, pass-outs |
| `/events/<slug>/registrations` | Search as you type, filters, CSV, badge printing |
| `/e/formweek` | Paid checkout, promo code `DESIGNERS10`, e-tickets |
| `/e/majlisfounders` | After-event page: `1001` gets in, `1003` (booked, never came) is refused. Claim needs the email too; look it up in the dashboard |
| `/e/nocturnelive/checkout` | Three-step checkout, declined payment, gate e-tickets |

## Checks

```bash
npm run typecheck
npm test                      # 65 tests; creates and migrates a zemmz_test database
npm run build                 # production build
```

Integration tests never touch the database in `DATABASE_URL`. They use
`zemmz_test` next to it, or `TEST_DATABASE_URL`.

## Deploy

`docker compose up -d --build` runs Postgres, web, worker and Caddy. Production
uses RDS instead of the `db` service. `.github/workflows/deploy.yml` tests,
pushes both images to ECR and deploys over SSH, running migrations first.
Merge it with the existing workflow; secret names are placeholders.
