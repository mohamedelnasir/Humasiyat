# Permissions (RBAC)

Roles: `customer`, `manager`, `super_admin`. The role is read from the database for every request by the `authenticate` middleware; clients cannot assert it.

```
route -> authenticate (JWT + DB lookup, rejects suspended) -> requireRole(...) -> validate -> controller -> service
```

- `requireRole('super_admin')` guards the whole `/admin` router.
- Ownership checks (a manager may only touch their own pitches; a customer only their own bookings) are enforced in services from Phase 3 onward, in addition to the role check.
- A 401 means "no valid session" (the app refreshes or signs in); a 403 means "authenticated but not allowed".

## Matrix (grows per phase)
| Capability | Customer | Manager | Super admin |
|---|---|---|---|
| Register, login, refresh, logout, reset/change password | yes | yes | yes |
| `GET /users/me` | yes | yes | yes |
| Suspend / reactivate accounts | no | no | yes (not self, not other admins) |
