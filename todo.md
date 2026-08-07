# TODO / Deferred Work

Tracks intentionally postponed work so it is not repeatedly flagged as a "problem"
in code reviews. Items here are **known and deliberately deferred**, not oversights.

## In progress

### Automated tests — 103 unit tests (2026-08-06)

- **Status:** Vitest (`npm test` / `test:watch` / `test:coverage`) covers the
  services added so far: restaurant, OTP, ratings, addresses, preferred
  payments, support, menu search, menu history, password reset, account
  status, guest cart + merge, cart cache, cart housekeeping, order stock, and
  notifications.
- **Still missing, in priority order** (the high-risk logic that predates
  these): money math (`Prisma.Decimal` totals), order status transitions
  (`VALID_TRANSITIONS`), and the full `placeOrder` transaction / cart
  row-locking behaviour.
- **Then:** integration tests for Order & Payment (mentor requirement, S17) —
  consider Testcontainers for a real PostgreSQL in those.

## Deferred

### Payment gateway (Stripe / Paymob) + webhook

- Only the CASH strategy is wired (`SUPPORTED_PAYMENT_METHODS`). The
  Transaction table already carries `externalRef` / `metadata` for a real
  gateway, and `PreferredPaymentSetting` stores the customer's chosen method.
  Missing: the gateway strategy itself and webhook verification.

### Official rules not yet applied

- **Soft delete** — deletes are still physical (`onDelete: Restrict` protects
  referenced rows, so nothing is silently lost, but the mentor asked for a
  flag).
- **Auditing columns** (`createdBy` / `updatedBy`) — not on any table yet.
- **CI/CD** — no GitHub Actions workflow (build + lint + test) yet.

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
