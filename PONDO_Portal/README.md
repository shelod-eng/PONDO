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

## Demo credentials

The demo accepts any username/password.

- Customer example: `customer@example.com` / `demo`
- Sponsor example: `sponsor@example.com` / `demo`

