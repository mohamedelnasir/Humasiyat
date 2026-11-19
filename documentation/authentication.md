# Authentication

Custom authentication implemented in Node.js (Supabase Auth is not used).

## Accounts
- A user registers with a **phone number and/or an email**. Phones are normalised to E.164 (`0912345678`, `912345678`, `+249912345678` and Arabic-Indic digits all map to `+249912345678`; default country code is configurable).
- Login takes one `identifier` (phone or email). Email is case-insensitive.
- Registration always creates a `customer`. The role can never be supplied by a client; unknown fields are rejected. Managers are created by an approved manager application (Phase 3); the first super admin is seeded with `npm run seed:admin`.
- Password policy: 8-128 characters, at least one letter and one digit (any script). Hashed with **Argon2id** (19 MiB, 2 iterations, 1 lane).

## Tokens
| Token | Format | Lifetime | Storage |
|---|---|---|---|
| Access | JWT HS256, claims: `sub` only (issuer/audience checked) | 15 min (`JWT_ACCESS_TTL_SECONDS`) | memory / secure storage on device |
| Refresh | 48 random bytes, opaque | 30 days (`REFRESH_TOKEN_TTL_DAYS`) | **SHA-256 hash only** in `refresh_tokens` |

- The access token carries no role. On every authenticated request the API loads the user's `role` and `status` from the database, so a suspension or role change takes effect immediately.
- **Rotation:** each `/auth/refresh` revokes the presented token and issues a new one in the same *family*.
- **Reuse detection:** presenting an already-rotated or revoked token revokes the whole family (the thief and the owner are both signed out) and writes an audit entry. Failures are returned, not thrown, so the revocation commits.
- Two devices have two independent families; logging one out does not affect the other.

## Endpoints (all under `/api/v1`)
| Endpoint | Auth | Notes |
|---|---|---|
| `POST /auth/register` | none | returns user and tokens (201) |
| `POST /auth/login` | none | generic `INVALID_CREDENTIALS` for wrong password and unknown account; unknown accounts still cost a hash verification (no timing oracle) |
| `POST /auth/refresh` | refresh token | rotation, see above |
| `POST /auth/logout` | refresh token | idempotent, 204 |
| `POST /auth/forgot-password` | none | always 200 with the same body |
| `POST /auth/reset-password` | reset token | single use, 30 min, revokes every session |
| `POST /auth/change-password` | bearer | wrong current password is **400** (a 401 would trigger the mobile refresh logic); revokes other sessions and returns fresh tokens |
| `GET /users/me` | bearer | `{ id, fullName, email, phone, role, status, ... }` |
| `PATCH /admin/users/:id/status` | super admin | suspend (reason required) / reactivate |

Example:
```http
POST /api/v1/auth/login
{ "identifier": "0912345678", "password": "Secret123" }

200 { "user": { "id": "...", "fullName": "Ahmed Ali", "role": "customer", "status": "active" },
      "accessToken": "<jwt>", "refreshToken": "<opaque>", "expiresIn": 900 }
401 { "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid phone/email or password" } }
```

## Error codes
`INVALID_CREDENTIALS` (401), `TOKEN_EXPIRED` (401, refresh and retry), `INVALID_REFRESH_TOKEN` (401, sign in again), `ACCOUNT_INACTIVE` (403, suspended: sign out), `ACCOUNT_EXISTS` (409), `INVALID_RESET_TOKEN` (400), `INVALID_CURRENT_PASSWORD` (400), `VALIDATION_ERROR` (422), `FORBIDDEN` (403), `TOO_MANY_REQUESTS` (429).

## Account status
`active`, `suspended`, `deactivated`. Suspending a user revokes all their refresh tokens in the same transaction; their access token stops working on the next request. A super admin cannot suspend themselves or another super admin through the API.

## Abuse protection
- Credential endpoints have two rate limits per 15 minutes: per IP + account identifier (default 10) and per IP (default 100, higher because many mobile users share one carrier-NAT address). Set `TRUST_PROXY` correctly behind a reverse proxy or every user shares one counter.
- All attempts and outcomes are written to `activity_logs` (`user.registered`, `auth.login`, `auth.login_failed`, `auth.refresh_reuse_detected`, `auth.password_reset_requested/completed`, `auth.password_changed`, `user.status_changed`).

## Password reset delivery
Reset tokens are created and stored hashed, then handed to a `Messenger` (`src/services/messenger.ts`). Until an email/SMS provider is configured the development messenger logs the token (never in production, where it logs an error instead). Plug the provider in by implementing `Messenger.sendPasswordReset`.

## Seeding the first super admin
```bash
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='ChangeMe123' npm run seed:admin
```
Reads credentials from the environment only; does nothing if the account already exists.

## Known limits (deliberate for now)
- No email/phone verification (OTP) yet; the schema has `email_verified_at` / `phone_verified_at` ready.
- No per-account lockout beyond the rate limits.
- Expired/revoked token rows are not purged yet; the Phase 4 scheduler will add that.
