# Humasiyat (خماسيات)

Football pitch booking platform for the Sudanese market. Customers book pitches, managers run their facilities, super admins oversee the platform.

```
humasiyat/
  backend/        Node.js + Express + TypeScript API (modular monolith)
  mobile/         Flutter app (Riverpod, Dio, GoRouter)
  documentation/  architecture, database, API, workflows
```

## Run the backend locally

Requirements: Node 20+, a PostgreSQL database (Supabase project or local Postgres 14+).

```bash
cd backend
npm install
cp .env.example .env        # then fill in DATABASE_URL and JWT_ACCESS_SECRET
npm run migrate:up          # applies SQL migrations
npm run dev                 # http://localhost:4000
```

- Liveness: `GET /health`, readiness (checks DB): `GET /health/ready`
- API docs (when `ENABLE_DOCS=true`): http://localhost:4000/docs

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start with auto-reload |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm test` | Jest + Supertest (no external DB needed: migrations are tested against an in-process PostgreSQL) |
| `npm run typecheck` | TypeScript check |
| `npm run migrate:up` / `migrate:down` | Apply / revert migrations |
| `npm run migrate:create -- <name>` | New SQL migration |

### Environment variables

See `backend/.env.example` (every variable is documented there and validated at startup by `src/config/env.ts`; the server refuses to start on invalid configuration).

Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `JWT_ACCESS_SECRET`, `DATABASE_URL`) live only on the backend. Never put them in the Flutter app.

## Status

- Phase 1 (Foundation): done.
- Phase 2 (Authentication): backend done (register, login, rotating refresh tokens with reuse detection, logout, forgot/reset/change password, RBAC, account suspension, super-admin seed). Flutter login screens come in Phase 7.

### First run checklist
```bash
cd backend && cp .env.example .env     # set DATABASE_URL and JWT_ACCESS_SECRET
npm run migrate:up
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='ChangeMe123' npm run seed:admin
npm run dev                            # API docs at http://localhost:4000/docs
```
