# NoShowHQ

Multi-tenant foundation for event-staffing businesses: Auth.js authentication, Prisma/PostgreSQL, platform admin tenant provisioning, and a tenant app shell.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Auth.js (NextAuth v5) with email/password credentials
- PostgreSQL + Prisma
- Local Postgres via Docker Compose

**Later (not required for local foundation):** deploy on Vercel Hobby, Neon free Postgres, and Vercel Blob for uploads.

## Prerequisites

- Node.js 22+ (see `.nvmrc`; `nvm use`)
- Docker Desktop (or another Docker engine) for local Postgres
- npm

## Local setup

### 1. Install dependencies

```bash
nvm use
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Set `AUTH_SECRET` to a long random value:

```bash
openssl rand -base64 32
```

`DATABASE_URL` in `.env.example` matches `docker-compose.yml` (Postgres on host port **5433** so it does not clash with a local Postgres on 5432).

### 3. Start Postgres

```bash
docker compose up -d
```

### 4. Run migrations

```bash
npm run db:migrate
```

When prompted for a migration name, use something like `init`.

### 5. Create the first SUPER_ADMIN

```bash
npm run create-super-admin -- --email you@example.com --password 'choose-a-strong-password' --first-name Jane --last-name Doe
```

### 6. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in as the super admin, create a tenant with an initial ADMIN user, then sign out and sign in as that admin.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm run test` | Vitest (schema + tenant-isolation event and staff tests; needs local Postgres) |
| `npm run db:migrate` | Create/apply Prisma migrations |
| `npm run db:generate` | Generate Prisma Client |
| `npm run create-super-admin` | Provision platform owner |
| `npm run provision-event-catalog` | Seed event types/subtypes (and Centre Circle venues) for existing tenants |
| `npm run reconcile-probation` | Backfill legacy probation rows and create missing in-app tasks |

## Roles

| Role | Access |
| --- | --- |
| `SUPER_ADMIN` | `/admin` platform area — list/create tenants and initial admins; **Open** a tenant to view its app shell |
| `ADMIN` | Tenant shell — `/dashboard`, `/staff`, `/events`, `/ledger`, `/absence/new`, `/settings` |

Events are tenant-isolated records (type, subtype, venue, date, staffing, risk thresholds). See [docs/events.md](docs/events.md). New tenants receive the standard type/subtype catalogue automatically; existing tenants are filled in on first visit to Events, or via `npm run provision-event-catalog`. Venues are managed from **Events → Venues** (also linked from Settings), and can also be added from the create-event form when a search finds no match.

Staff are tenant-isolated operational records (staff ID, name, role, department, manager, employment status, clearance summary, and a tenant-safe probation workflow). See [docs/staff.md](docs/staff.md). Creating a staff member does not create a login. New tenants receive a 90-day probation default under **Settings → Probation**; changing it applies to staff created afterwards only. Due and overdue reviews are chased in-app from **Staff → Probation** (no email or SMS).

Absences are tenant-isolated records attached to Staff and (for Cancellation) Events. See [docs/absences.md](docs/absences.md). This release logs Cancellations only; AWOL and Sickness will use the same parent model. Logging a cancellation does not change employment or event status.

Run `npm run reconcile-probation` (or the daily `/api/cron/probation-reconcile` cron with `CRON_SECRET`) to backfill legacy dates and create missing in-app tasks.

Unauthenticated visitors are sent to `/login`. Wrong-role access returns a safe not-found response.

## Password reset

Self-serve email reset is not enabled yet.

- Signed-in users can change their own password in **Profile** (account menu).
- Tenant admins who are locked out should ask the platform owner; a SUPER_ADMIN can set a temporary password from **Tenants → Manage**.
- Organisation defaults live under **Settings** (account menu).

## Production (Vercel + Neon)

Connecting Neon to Vercel only sets a database URL. It does **not** copy local users or apply Prisma tables. The production build now runs `prisma migrate deploy` and will seed a SUPER_ADMIN if those env vars are set.

In the Vercel project → **Settings → Environment Variables**, set:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** URL (host usually contains `-pooler`). If Prisma errors about prepared statements, append `&pgbouncer=true`. |
| `DIRECT_URL` | Neon **unpooled / direct** URL (no `-pooler`). Required for migrations. |
| `AUTH_SECRET` | `openssl rand -base64 32` (do not reuse the local secret if you prefer not to) |
| `AUTH_URL` | `https://stadigo-noshowhq.vercel.app` (or your custom domain) |
| `AUTH_TRUST_HOST` | `true` |
| `SUPER_ADMIN_EMAIL` | Email you will sign in with on production |
| `SUPER_ADMIN_PASSWORD` | At least 8 characters |
| `SUPER_ADMIN_FIRST_NAME` | Optional, default `Super` |
| `SUPER_ADMIN_LAST_NAME` | Optional, default `Admin` |
| `CRON_SECRET` | Bearer token for `/api/cron/probation-reconcile` (optional locally; set in production) |

Then **redeploy**. Local accounts (including `super@noshowhq.local`) do not exist on Neon until seeded.

The Neon Vercel integration often also exposes `POSTGRES_URL_NON_POOLING` — copy that value into `DIRECT_URL`.

- Add **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`) when file uploads are built.
