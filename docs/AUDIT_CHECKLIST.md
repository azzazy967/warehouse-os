# Post-change audit checklist

Run this after every phase or meaningful change. The workflow contract is: **finish a phase -> run audits in parallel/background -> apply findings -> rebuild and re-verify -> proceed to the next phase.**

## 1. API / DTO alignment

- [ ] Every frontend URL + HTTP method maps to a real controller route (check method, path, and `@HttpCode`).
- [ ] Request field names match DTO properties; response fields the UI reads actually exist on the entity/DTO.
- [ ] No placeholders, TODO/FIXME, "coming soon" stubs, or empty handlers in shipped code.
- [ ] Create endpoints return `201`; state-transition actions return `200`.

## 2. Role & security matrix

- [ ] Nav roles (`Layout.tsx`) match route allow lists (`App.tsx`) match backend `@Roles()` decorators.
- [ ] Mutating endpoints are guarded; role-specific restrictions (e.g. PICKER assigned orders only) enforced server-side.
- [ ] No password leakage in any response; JWT secret fails fast; CORS allowlist; `forbidNonWhitelisted`.
- [ ] Guarded stock updates and transactional status claims intact; last-admin and self-delete protections intact.

## 3. Stock & transactional integrity

- [ ] All stock changes go through the guarded `applyMovement` inside a transaction.
- [ ] Available = onHand - reserved is respected; over-receive/over-pick/double-ship still blocked.
- [ ] Cancel/deliver use conditional updates (no read-then-save overwrite race).
- [ ] Every movement writes an immutable audit row.

## 4. Data & config portability

- [ ] Column types valid for **both** drivers (SQLite `better-sqlite3` and Postgres) - see the `DATETIME_TYPE` constant in `entities.ts`.
- [ ] Postgres metadata builds: `DB_TYPE=postgres node -e "..."` must not throw `DataTypeNotSupportedError`.
- [ ] `DB_SYNCHRONIZE` defaults to `false`; production schema changes go through migrations.
- [ ] `.env.example` complete; no real secrets committed.

## 5. UI hygiene

- [ ] Zero emojis / non-ASCII icon glyphs in `src/**` (Lucide components only).
- [ ] Chart axis/tooltip text color follows the theme: dark `#e4e4f0` / `rgb(228,228,240)`, light `#1e293b` / `rgb(30,41,59)`.
- [ ] DataTable rows have stable keys; modals open/close; 401 interceptor has no redirect loop.
- [ ] Production build (`VITE_SHOW_DEMO_ACCOUNTS=false`) contains no demo credentials.

## 6. Docs & ops

- [ ] README quick start, roles, env table, and API overview match the code.
- [ ] Production hosting path exists: `deploy/nginx.conf`, `docs/PRODUCTION_DEPLOY.md` with `/api` proxy, `/uploads` proxy, SPA fallback, and persistent `UPLOAD_DIR`.
- [ ] Verification script committed and runnable (`npm run verify`).

## Verification commands

```bash
npm run build                                   # both packages compile clean
cd backend && DB_SYNCHRONIZE=true npm run seed  # fresh DB bootstraps (dev)
node scripts/verify-api.mjs                     # 57/57 runtime checks
VITE_SHOW_DEMO_ACCOUNTS=false npm --prefix frontend run build \
  && ! grep -rq "Admin@123" frontend/dist/assets   # no demo creds in bundle
```
