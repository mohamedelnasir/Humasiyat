# Database

PostgreSQL (Supabase). Schema changes are made only through `backend/src/database/migrations/*.sql` (node-pg-migrate). UUID primary keys, `created_at`/`updated_at` with a shared trigger.

## Tables (18)
Required 17 plus `password_reset_tokens` (needed for forgot/reset password).

| Area | Tables |
|---|---|
| Identity | `users`, `refresh_tokens`, `password_reset_tokens`, `device_tokens` |
| Supply | `manager_applications`, `pitches`, `pitch_images`, `pitch_facilities`, `pitch_operating_hours`, `pitch_pricing`, `pitch_blocks` |
| Demand | `bookings`, `payments`, `payment_receipts`, `reviews` |
| Platform | `notifications`, `activity_logs`, `platform_settings` |

## Relationships
```
users 1-* refresh_tokens / password_reset_tokens / device_tokens / notifications
users(manager) 1-* pitches 1-* pitch_images / pitch_facilities / pitch_operating_hours / pitch_pricing / pitch_blocks
pitches 1-* bookings *-1 users(customer; NULL for walk-in manual bookings)
bookings 1-* payments 1-* payment_receipts
bookings 1-0..1 reviews
```
Deletion rules: bookings/pitches reference users and pitches with `RESTRICT` (history is never silently lost; pitches use soft delete via `deleted_at`). Child rows of a pitch/payment/user cascade. Audit and reviewer columns use `SET NULL`.

## Double-booking protection
```sql
CONSTRAINT bookings_no_overlap_active EXCLUDE USING gist (
  pitch_id WITH =, tstzrange(starts_at, ends_at) WITH &&
) WHERE (status IN ('awaiting_payment','payment_submitted','payment_rejected','confirmed'))
```
- Ranges are half-open: 18:00-19:00 and 19:00-20:00 do not conflict.
- `pending_manager_approval` is intentionally not constrained: several customers may request the same slot; approval moves one into the constrained set, and the loser fails with `23P01` -> `409 SLOT_TAKEN`.
- `payment_rejected` stays in the set while the customer may still re-upload evidence.
- Manual bookings are inserted as `confirmed` and hit the same constraint.
- `pitch_blocks` prevent overlap among blocks; overlap between blocks and bookings is checked by the service inside the transaction.
- A hold past `hold_expires_at` still occupies the slot until the expiry job runs, so the service must expire stale holds for the pitch inside the transaction before inserting or approving (Phase 4).

## Other guarantees
- A user must have an email or phone (E.164 format); email is case-insensitive unique.
- Payments: at most one open (`awaiting_payment`/`submitted`) and one `verified` payment per booking.
- Receipts accept only JPEG/PNG/WebP.
- Seeded `platform_settings`: `payment_hold_minutes` (15), `payment_reminder_minutes` (5), `default_currency` ("SDG").

## Tests
`tests/migrations.test.ts` applies every migration to an in-process PostgreSQL and verifies the constraints above and that all down migrations roll back cleanly.
