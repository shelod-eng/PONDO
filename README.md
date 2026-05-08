# PONDO Demo System (PONDO-TRD-001)

This is a working demo implementation derived from the **PONDO-TechSpec-v1.0-Sponsor-Ready** spec (PONDO-TRD-001 v1.0, April 2026).

## Modules covered

- Checkout flow (transaction initiation)
- QR issuance (HMAC-signed payload) + barcode (transaction id)
- Credit vetting (demo scoring + POPIA consent gate)
- Payment routing + authorization (demo gateways)
- Reconciliation (demo: marks `processing` → `reconciled`)
- Sponsor portal dashboard + immutable audit trail (append-only)

## Project layout

- `api/` Node.js (Express) API gateway + orchestration (demo)
- `web/` Next.js sponsor portal + checkout UI (demo)
- `docker-compose.yml` PostgreSQL for persistence (optional)

## Quick start (in-memory mode)

1) API

```powershell
cd .\api
Copy-Item .\.env.example .\.env
npm run dev
```

2) Web

```powershell
cd ..\web
Copy-Item .\.env.example .\.env.local
npm run dev
```

Open `http://localhost:3000`.

## PostgreSQL mode (optional)

1) Start Postgres:

```powershell
cd ..
docker compose up -d
```

2) Update `api/.env`:

- Set `USE_IN_MEMORY=false`
- Set `DB_*` values to match `docker-compose.yml`

Restart the API. Tables are created automatically from `api/db/schema.sql`.

## Vercel Production checklist

For the current `web/` Next.js app, Vercel Production should use the internal Next API routes under `web/src/app/api/pondo/*`. That means the production deployment depends on the `web/` environment variables and the `pondo_core` SQL schema, not the legacy standalone `api/` service.

### 1. Run this SQL in Supabase/Postgres

Run these files in order:

1. `api/db/pondo_fintech_schema.sql`
2. `api/db/pondo_fintech_seed.sql`

This creates and seeds the `pondo_core` schema used by `web/src/server/pondo/service.ts`, including the partner, payment method, risk, customer, checkout session, OTP, order, settlement, notification, and delivery tables the checkout flow reads and writes.

### 2. Set these Vercel Production env vars on the `web` project

Required:

- `DATABASE_URL`
- `JWT_SECRET`

Recommended for the full address + risk flow:

- `GOOGLE_MAPS_API_KEY`
- `IP2LOCATION_API_KEY`

Notes:

- Leave `NEXT_PUBLIC_API_BASE_URL` unset in Vercel Production so the browser uses the same deployed origin and hits the internal Next routes directly.
- If you cannot provide `DATABASE_URL`, the app can also read `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and optional `DB_SSL`, but `DATABASE_URL` is the cleanest Production setup.
- `GOOGLE_MAPS_API_KEY` powers address autocomplete, place resolution, and address validation. Without it, checkout now falls back to manual address entry.
- `IP2LOCATION_API_KEY` improves IP geolocation. Without it, the app falls back to `ipapi` and then to safe defaults.
- After deploy, verify `/api/pondo/health`. It should return `ok: true`. If it returns missing tables, the wrong SQL schema was loaded.

## Demo credentials

The demo accepts any username/password.

- Customer example: `customer@example.com` / `demo`
- Sponsor example: `sponsor@example.com` / `demo`

