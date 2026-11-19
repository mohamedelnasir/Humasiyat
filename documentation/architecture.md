# Architecture

## Principles
- Node.js is the single authority for business rules, authentication, permissions and database access. Flutter only talks to the REST API.
- Modular monolith: one deployable, strict module boundaries.
- Business logic lives in services; controllers stay thin; repositories contain SQL only.

## Backend layout
```
backend/src/
  config/        env validation (Zod), logger (pino, with redaction)
  database/      pg pool, withTransaction helper, SQL migrations
  middleware/    requestId, validate (Zod), rateLimit, errorHandler
  modules/<m>/   controller, service, repository, routes, schemas, types
  services/      cross-cutting integrations (storage, push, scheduler)
  utils/         AppError hierarchy and error codes
  docs/          OpenAPI document
  app.ts         createApp() (testable, no listen)
  server.ts      process entry, graceful shutdown
```

## Request flow
`route -> rate limit -> authenticate -> authorize(role) -> validate(Zod) -> controller -> service (transaction) -> repository -> PostgreSQL`

## Cross-cutting rules
- **Errors:** every failure is `{ "error": { "code", "message", "details?" } }`. PostgreSQL errors are mapped: `23P01` -> `409 SLOT_TAKEN`, `23505` -> `409 CONFLICT`, check/not-null/bad-uuid -> `400`. Unknown errors return `500` without internals.
- **Transactions:** `withTransaction(fn)` retries serialization failures and deadlocks. Side effects such as push notifications run after commit.
- **Security:** helmet, CORS allow-list (mobile sends no Origin), global and auth-specific rate limits, 1 MB JSON limit, log redaction of credentials.
- **Time:** all instants are `timestamptz` (UTC); pitches carry a time zone (default `Africa/Khartoum`).
