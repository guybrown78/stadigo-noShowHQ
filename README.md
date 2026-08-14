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
| `npm run db:migrate` | Create/apply Prisma migrations |
| `npm run db:generate` | Generate Prisma Client |
| `npm run create-super-admin` | Provision platform owner |

## Roles

| Role | Access |
| --- | --- |
| `SUPER_ADMIN` | `/admin` platform area — list/create tenants and initial admins; **Open** a tenant to view its app shell |
| `ADMIN` | Tenant shell — `/dashboard`, `/staff`, `/events`, `/ledger`, `/absence/new`, `/settings` |

Unauthenticated visitors are sent to `/login`. Wrong-role access returns a safe not-found response.

## Password reset

Use **Forgot password** on the login page. In local development the reset URL is printed to the **server console** (no email provider configured yet).

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

Then **redeploy**. Local accounts (including `super@noshowhq.local`) do not exist on Neon until seeded.

The Neon Vercel integration often also exposes `POSTGRES_URL_NON_POOLING` — copy that value into `DIRECT_URL`.

- Add **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`) when file uploads are built.
