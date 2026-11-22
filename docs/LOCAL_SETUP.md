# Local development setup

This is the zero-dependency path: SQLite for the database, Vite dev server for the UI. No Docker or external services required.

## Prerequisites

- Node.js 18+ and npm
- (Optional) Docker, only if you want to test the PostgreSQL production path locally

## First run

From the repository root:

```bash
npm run setup        # npm install in backend/ and frontend/
npm run seed         # create SQLite schema + demo data (idempotent)
npm run dev:sqlite   # start API (:3000) and UI (:5173)
```

Open http://localhost:5173 and sign in with a demo account:

| Role | Email | Password |
| --- | --- | --- |
| ADMIN | `admin@warehouse.io` | `Admin@123` |
| MANAGER | `manager@warehouse.io` | `Manager@123` |
| PICKER | `picker@warehouse.io` | `Picker@123` |

The login chips that fill these credentials are controlled by `VITE_SHOW_DEMO_ACCOUNTS` in `frontend/.env` (set to `true` locally). The credentials are never included in a production build where the flag is `false`.

## What the dev config does

`backend/.env` (git-ignored, copied from `.env.example`) sets:

- `DB_TYPE=sqlite`, `SQLITE_PATH=warehouse.sqlite` - the database is the file `backend/warehouse.sqlite`
- `DB_SYNCHRONIZE=true` - the schema is created/updated automatically on boot
- `NODE_ENV=development`
- CORS allows `http://localhost:5173`
- A development `JWT_SECRET`

The Vite dev server proxies `/api` to `http://localhost:3000`, so the frontend calls relative `/api` URLs and never needs to know the API origin.

## Running pieces separately

```bash
# Terminal 1
cd backend && npm run start:sqlite     # API with watch mode on :3000

# Terminal 2
cd frontend && npm run dev             # UI on :5173
```

## Reset the local database

```bash
cd backend
rm -f warehouse.sqlite
DB_SYNCHRONIZE=true npm run seed
```

Then restart the API. Deleting the file is safe in development; never do this against production data.

## Verify the API

With the API running on :3000:

```bash
npm run verify
```

This exercises login, stock guards, the full receive/assign/pick/ship lifecycle, over-quantity and double-ship blocking, deletion guards, RBAC, and DTO validation. It creates `QA-*` and `ASSIGN-*` test records in the database.

## Testing the PostgreSQL path locally

A Compose file provisions PostgreSQL 16:

```bash
docker compose up -d db
cp backend/.env.example backend/.env   # then edit: DB_TYPE=postgres, DB_SYNCHRONIZE=true
DB_SYNCHRONIZE=true npm run seed
npm run dev                            # or: cd backend && npm run start:prod
```

See `docs/PRODUCTION_DEPLOY.md` for the production-grade version of these steps.
