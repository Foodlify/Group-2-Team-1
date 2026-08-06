# TODO / Deferred Work

Tracks intentionally postponed work so it is not repeatedly flagged as a "problem"
in code reviews. Items here are **known and deliberately deferred**, not oversights.

## In progress

### Automated tests — STARTED (2026-08-06)
- **Status:** Vitest is set up (`npm test` / `test:watch` / `test:coverage`) with
  the first unit suites: restaurant service (10 tests) and OTP service (5 tests) —
  pattern ported from Kamal's `customer-management` branch.
- **Next, in priority order** (the high-risk logic): money math
  (`Prisma.Decimal`), order status transitions (`VALID_TRANSITIONS`),
  the checkout transaction (`placeOrder`), and cart row-locking.
- **Then:** integration tests for Order & Payment (mentor requirement, S17) —
  consider Testcontainers for a real PostgreSQL in those.

## Deferred

### Forgot / reset password flow — DEFERRED
- The OTP module (send/verify with `purpose: "password_reset"`) is in place;
  the missing piece is the `/auth/forgot-password` + `/auth/reset-password`
  endpoints that consume it. Highest-priority auth follow-up.

### SMTP in production
- The mailer falls back to logging when `SMTP_HOST` is unset (dev/test only) and
  refuses to send in production. Provision real SMTP credentials before launch.
