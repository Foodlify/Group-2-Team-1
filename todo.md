# TODO / Deferred Work

Tracks intentionally postponed work so it is not repeatedly flagged as a "problem"
in code reviews. Items here are **known and deliberately deferred**, not oversights.

## In progress

### Automated tests — 201 unit tests (2026-08-07)

- **Status:** Vitest (`npm test` / `test:watch` / `test:coverage`) covers the
  restaurant, OTP, ratings, addresses, preferred payments, support, menu
  search, menu history, password reset, account status, guest cart + merge,
  cart cache, cart housekeeping, notification, and soft-delete services —
  plus the four order suites (stock, money, transitions, checkout).
- The high-risk logic that predated the suite is now covered: money math
  (`Prisma.Decimal`), the `VALID_TRANSITIONS` table (all 36 pairs, generated),
  and the `placeOrder` transaction / cart row-locking behaviour.
  Writing them found and fixed a real bug — line subtotals were computed with
  float multiplication and served `24.450000000000003` for `8.15 x 3`.

### Integration tests — 28 tests (2026-08-07)

- **Done:** Order & Payment against a real PostgreSQL (mentor requirement,
  S17), plus the CI database service and the migration-drift check that
  belonged with it. `npm run test:integration`, see the README.
- **Not Testcontainers**, despite the earlier note here: it needs Docker, and
  the suite has to be runnable on a machine that doesn't have it. A plain
  `DATABASE_URL_TEST` works with docker-compose, any local PostgreSQL, or a
  throwaway `initdb` instance — and it is what the CI service container
  supplies anyway.
- **Still uncovered:** the HTTP layer. Every one of these calls the service
  directly, so routing, `validate` middleware, auth and the error middleware
  are only exercised by hand. Supertest against the Express app would close
  that, and is the obvious next step for this suite.

**Convention worth keeping:** every new assertion here was checked against a
deliberately broken copy of the code before being committed. A test that
passes either way is worse than no test — one of these was vacuous on the
first attempt and only showed it under that check.

## Deferred

### Payment gateway (Stripe / Paymob) + webhook

- Only the CASH strategy is wired (`SUPPORTED_PAYMENT_METHODS`). The
  Transaction table already carries `externalRef` / `metadata` for a real
  gateway, and `PreferredPaymentSetting` stores the customer's chosen method.
  Missing: the gateway strategy itself and webhook verification.

### Official rules not yet applied

- ~~**Soft delete**~~ — done (2026-08-07). `isDeleted` on `Restaurant` / `Menu` /
  `MenuItem`, filtered in the repositories, cascading deletes, restore endpoints.
  See the README section. **Not** applied to `User` (team decision: `isActive`
  already covers it) or to carts / orders / transactions.
- ~~**Auditing columns**~~ — done (2026-08-07). `createdBy` / `updatedBy` on the
  three catalog tables, `changedBy` on `MenuChangeLog`.
- ~~**CI/CD**~~ — done (2026-08-07). See `.github/workflows/ci.yml`.

Still open in this area:

- **`auditingEvent` entity** — the official ERD has a generic auditing table tied
  to transactions. No team has built it; the per-table columns cover the mentor's
  stated requirement, so this is a differentiator rather than a gap.
- **Partial indexes** for the soft-delete filter (`WHERE "isDeleted" = false`).
  Prisma can't express them; worth adding by hand to a migration if the catalog
  ever grows enough for it to matter.

### Dashboard & Reports module

- Not started. No team has built it, so it is the clearest differentiator left.

### SMTP in production

- The mailer falls back to logging when `SMTP_HOST` is unset (dev/test only) and
  refuses to send in production. Provision real SMTP credentials before launch.
- Order notifications and OTP both depend on it.

### JMeter load testing (S18 task)

- Place order / login / add to cart, 2 plans, 1000 requests, 500 concurrent
  users. Nothing recorded yet.

### Restaurant-owner perspective (Kamal's branch, part 4)

- `register / me / me/orders` for a restaurant owner actor exists on
  `customer-management`. Needs a team decision before porting: it introduces a
  third actor across the whole authorization surface.
