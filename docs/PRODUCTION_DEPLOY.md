# Production deployment

## Architecture

```
Internet ──TLS──> nginx (443) ──┬── /api/* ──proxy──> NestJS API (127.0.0.1:3000)
                                ├── /uploads/* ──proxy──> NestJS API (product images)
                                └── /*      ──static──> frontend/dist (SPA + history fallback)
                                                          │
                                                     PostgreSQL
                                                     Persistent UPLOAD_DIR (images)
```

The browser only ever talks to nginx on the public origin. The Vite `/api` proxy is a development-only feature; in production nginx (or an equivalent reverse proxy) must serve the SPA and forward `/api` to the API. A ready-to-use config is in `deploy/nginx.conf`.

## 1. Database

Provision PostgreSQL and create the database/user. With the included Compose file:

```bash
docker compose up -d db
```

Back up the database before any schema change or upgrade.

## 2. Environment

Create `backend/.env` from `backend/.env.example` and set:

| Variable | Value | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Enables production hardening (JWT secret validation, CORS strictness) |
| `PORT` | `3000` | API listen port (nginx proxies to this) |
| `JWT_SECRET` | long random value | Generate with `openssl rand -hex 32`; app refuses to boot without it |
| `JWT_EXPIRES_IN` | `8h` | Token lifetime |
| `CORS_ORIGINS` | `https://warehouse.example.com` | Comma-separated public UI origins; with none set, CORS is disabled |
| `DB_TYPE` | `postgres` | |
| `DB_SYNCHRONIZE` | `false` | Never auto-alter a production schema |
| `DB_HOST` / `DB_PORT` | db host / `5432` | |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | your values | |
| `DB_SSL` / `DB_SSL_REJECT_UNAUTHORIZED` | `true` / `true` | TLS to the database |
| `UPLOAD_DIR` | `/var/lib/warehouse/uploads` | Persistent directory for product images, served at `/uploads`; create it with write permissions and preserve it across redeploys |

Frontend: build with `VITE_SHOW_DEMO_ACCOUNTS=false` (or unset). This compiles the demo credential literals out of the bundle entirely.

## 3. Schema bootstrap (one-time, new database only)

The API runs with `DB_SYNCHRONIZE=false`. To create the initial schema and demo data on a **brand-new** database:

```bash
npm --prefix backend install
DB_SYNCHRONIZE=true npm --prefix backend run seed
```

The seed honours `DB_SYNCHRONIZE`: with the production default of `false` it will not alter an existing schema, and it skips entirely if `admin@warehouse.io` already exists. The seed creates well-known demo credentials — **rotate all three passwords immediately after the first login**, or seed your own admin accounts.

> For schema changes on an existing database, do **not** re-run the seed with synchronize enabled. Introduce TypeORM migrations and run them as a controlled step.
>
> Exception: the `products.barcode` and `products.imagePath` columns (added with the product-detail feature) are ensured automatically at API startup — the service adds any missing columns and backfills barcodes idempotently, so no manual migration is required for that upgrade.

## 4. Build and start

```bash
npm --prefix backend run build
npm --prefix backend run start:prod        # node backend/dist/main, listens on :3000

VITE_SHOW_DEMO_ACCOUNTS=false npm --prefix frontend run build
# output: frontend/dist
```

Run the API under a process supervisor (systemd, pm2, or a container orchestrator) so it restarts on failure.

## 5. Reverse proxy

Install `deploy/nginx.conf`, then:

- Set `server_name` and the `root` path to your `frontend/dist` location.
- Point `ssl_certificate` / `ssl_certificate_key` at your certificates (e.g. certbot).
- Confirm the `/api/` block proxies to `127.0.0.1:3000` and preserves the `/api` prefix (the API registers routes under `/api`).
- Confirm the `/uploads/` block proxies to `127.0.0.1:3000` **before** the SPA fallback; otherwise product images return `index.html` instead of the file.
- Confirm `client_max_body_size` is at least 6m so 5 MB images are not rejected before reaching the API.
- Confirm the `location /` block uses `try_files $uri $uri/ /index.html` so client-side routes survive a hard refresh.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Verify from the public origin:

```bash
curl https://warehouse.example.com/health     # {"status":"ok",...}
curl https://warehouse.example.com/api/...     # proxied to the API
```

## 6. Post-deploy verification

With the API reachable at the public origin:

```bash
BASE=https://warehouse.example.com node scripts/verify-api.mjs
```

Note: this writes QA test records, so run it against a staging deployment or clean up afterwards.

## Operational notes

- **CORS:** because the SPA and API share one origin through nginx, `CORS_ORIGINS` should be that same public origin. If the UI is served from a different origin, list it explicitly; with no origins configured, CORS is disabled.
- **Secrets:** keep `.env` out of version control (`.gitignore`) and inject secrets via a secret manager in real deployments. Never bake them into images or the frontend bundle.
- **Backups:** back up PostgreSQL on a schedule and test restores. Stock movements are an immutable audit trail — preserve them.
- **Logging:** the API disables TypeORM SQL logging in production. Application/HTTP logs go to stdout; collect them with your supervisor.
- **Rate limiting:** the login limiter is in-memory and per-process. If you scale to multiple API instances, put a shared limiter (e.g. Redis) in front.
