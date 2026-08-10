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

### Integration tests — 84 tests (2026-08-07, HTTP layer added 2026-08-09)

- **Done:** Order & Payment against a real PostgreSQL (mentor requirement,
  S17), plus the CI database service and the migration-drift check that
  belonged with it. `npm run test:integration`, see the README.
- **Not Testcontainers**, despite the earlier note here: it needs Docker, and
  the suite has to be runnable on a machine that doesn't have it. A plain
  `DATABASE_URL_TEST` works with docker-compose, any local PostgreSQL, or a
  throwaway `initdb` instance — and it is what the CI service container
  supplies anyway.

### ~~HTTP-layer coverage~~ — done (2026-08-09), 39 tests

- Supertest against the real Express app, every middleware in the real order:
  `tests/integration/http.auth.integration.test.ts` (22) and
  `http.contract.integration.test.ts` (17). 17 mutations, all caught.
- Covers what a service test calls past: the cookie/Bearer transports, tokens
  that were valid when issued but whose account has since been deleted,
  disabled or demoted, role enforcement, `validate` (including Express 5's
  re-parsing `req.query` getter), the error envelope, the 404 handler, helmet's
  headers on success _and_ on errors, credentialed CORS, and the Stripe
  webhook's position ahead of both `express.json()` and the admin router.

**Two real bugs it found, both fixed in the same commit:**

- **A malformed JSON body answered `500`.** Body-parser failures carry their
  own 4xx status and never reached it — so the caller was told their own broken
  request was a server fault, and every one filed a fake incident in the log.
- **The role came from the token, not the account.** `authenticate` already
  re-read the row so a deleted or disabled account stopped working immediately,
  but `authorize` still trusted the token's `role` claim. A demoted admin kept
  admin rights until their token expired.

The rate limiter was the last thing left uncovered here, and is now done too —
see the load-testing section, which is also where the two bugs it exposed are
written up.

**Convention worth keeping:** every new assertion here was checked against a
deliberately broken copy of the code before being committed. A test that
passes either way is worse than no test — one of these was vacuous on the
first attempt and only showed it under that check.

## Deferred

### ~~Payment gateway (Stripe) + webhook~~ — done (2026-08-09), verified live

- Stripe Checkout behind the existing strategy interface, plus the webhook at
  `POST /api/v1/payments/stripe/webhook`. See
  [docs/PAYMENTS.md](docs/PAYMENTS.md). Paymob was rejected: it needs an
  Egyptian merchant account with real paperwork, where Stripe issues test keys
  immediately — and `Group-1-Team-2` used Stripe too.
- Unit-tested (signature verification against real HMAC, idempotency, minor-unit
  conversion, the cancel-on-failure path), every assertion checked against
  deliberately broken source.

**Open items it produced:**

- ~~**Never run against a live Stripe account.**~~ — done (2026-08-09). Verified
  end to end against a live test account: real Checkout Session, real card
  payment, real webhooks, plus the replay and expiry paths and two forged-call
  rejections. Thirteen checks, all passing — see "What the live run proved" in
  `docs/PAYMENTS.md`.
- ~~**Refunds do not reach the gateway.**~~ — done (2026-08-09). Cancelling a
  paid card order now refunds through Stripe. The `REFUND` row starts PENDING
  and is settled by the gateway's answer, so the ledger never claims money moved
  before it did. Verified live: 91.00 EGP refunded and confirmed against
  Stripe's own record, plus the PaymentIntent-fallback and failed-refund paths.
- ~~**A `FAILED` REFUND row is money still owed, and nothing chases it.**~~ —
  done (2026-08-09). `GET /api/v1/payments/refunds/outstanding` lists `FAILED`
  and `PENDING` refunds with their reasons, and
  `POST /api/v1/payments/refunds/{id}/retry` sends one again. Retrying is safe
  to repeat: the gateway is asked what it already holds first, so a retry
  reconciles instead of paying twice — proved live by forcing that exact case
  and confirming Stripe still showed one refund of 9100 against a 9100 charge.
- **Nothing alerts anyone that an outstanding refund exists.** Someone has to
  call the endpoint. A scheduled check reporting the count would close that with
  no automatic money movement — and automatic retrying is deliberately **not**
  built: sending money back on a timer with nobody looking is not a cron job's
  decision.
- ~~**`View Payment Transactions` / `Generate Transaction Receipt`**~~ — done
  (2026-08-10). Both are named endpoints in the official scope map, and the
  transaction module had no routes at all, so neither was reachable. Customer
  and ADMIN listings (paged, filterable) plus receipts rendered on demand from
  the order's snapshots. 9 mutations, all caught.
- **Partial refunds will not be built.** `PARTIAL_REFUND` is in the enum and the
  dashboard already subtracts it, but nothing writes one — and nothing should:
  it appears nowhere in the official scope map, and the mentor's S15 decision
  was that a refund is a **manual refund** (record it, change the status, no
  gateway integration). The Stripe refunds here already exceed that.
- **Abandoned card orders depend on `checkout.session.expired`.** Stock is
  reserved at checkout, and that 24-hour event is what releases it. If the
  webhook endpoint is ever unreachable for a long stretch, abandoned checkouts
  quietly hold stock until it is redelivered.
- **`WALLET` and `PAYPAL`** remain in the Prisma enum with no strategy behind
  them, and are correctly absent from `SUPPORTED_PAYMENT_METHODS`.

### Official rules not yet applied

- ~~**Soft delete**~~ — done (2026-08-07). `isDeleted` on `Restaurant` / `Menu` /
  `MenuItem`, filtered in the repositories, cascading deletes, restore endpoints.
  See the README section. **Not** applied to `User` (team decision: `isActive`
  already covers it) or to carts / orders / transactions.
- ~~**Auditing columns**~~ — done (2026-08-07). `createdBy` / `updatedBy` on the
  three catalog tables, `changedBy` on `MenuChangeLog`.
- ~~**CI/CD**~~ — done (2026-08-07). See `.github/workflows/ci.yml`.
- ~~**`auditingEvent` entity**~~ — done (2026-08-10). `AuditingEvent`, covering
  every write to `Transaction`, plus `GET /api/v1/audit-events` (ADMIN). Written
  inside the same database transaction as the change it describes; actor carried
  ambiently in an `AsyncLocalStorage`. See the README section.

Still open in this area:

- ~~**Payment Verification & Validation**~~ — done (2026-08-10). The webhook now
  checks `payment_status`, amount and currency before settling, and handles
  `checkout.session.async_payment_succeeded`. A mismatch leaves the row PENDING
  and flagged rather than FAILED. See `docs/PAYMENTS.md`.
- ~~**`RestaurantDetails` table**~~ — done (2026-08-10). Contact and location,
  one-to-one and optional, carried on the existing Register/Update Restaurant
  payloads rather than on a new endpoint the scope map does not name.
- ~~**`TransactionDetails` table**~~ — done (2026-08-10). The gateway's own
  facts as typed columns instead of keys in `Transaction.metadata`. Written at
  the repository layer, merged across the successive writes of one payment, and
  exposed on the ADMIN listing only. 10 mutations, all caught.
- ~~**`PaymentIntegrationType` / `PaymentIntegrationConfiguration`**~~ — done
  (2026-08-10). Seeded by the migration, both enabled. No secret is stored: the
  configuration names the env var holding each key, and `secretConfigured` says
  whether it has a value. `isEnabled` is a runtime kill switch read when a
  payment is taken. 9 mutations, all caught — two of them only after the tests
  were strengthened, including a leak that a blanked env var had made invisible.
- **Partial indexes** for the soft-delete filter (`WHERE "isDeleted" = false`).
  Prisma can't express them; worth adding by hand to a migration if the catalog
  ever grows enough for it to matter.

### ~~Dashboard & Reports module~~ — done (2026-08-09)

- The seventh official module. Three ADMIN-only read endpoints: system
  overview, daily/monthly transaction report, and the same per restaurant.
  No new tables and no migration. See [docs/DASHBOARD.md](docs/DASHBOARD.md).
- Still the only one of the seven that **no other team has built**.
- **Completed 2026-08-11** with the day and month counters the map names —
  cancelled orders daily and monthly on both branches, the restaurant's own
  daily and monthly order counts, and `Daily Orders not Delivered Count`. Until
  then those bullets were served only as all-time totals, which cannot be
  narrowed to a day or a month after the fact.

**Open items it produced:**

- **Reports are UTC-only.** `createdAt` is `timestamp` without a zone, so
  "today" starts at 02:00/03:00 Cairo time and late-night orders land in the
  next day's bucket. The response says `"timezone": "UTC"` rather than hiding
  it. Fixing it properly means `timestamptz` or an explicit timezone parameter
  — a real change, not a display tweak.
- **Anything writing timestamps outside Prisma must write UTC.** The column
  carries no zone, so the writer decides what it means. A `psql` script using
  `now()` writes Cairo local time and silently falls outside every report
  window; use `now() at time zone 'UTC'`.
- **No CSV/PDF export and no caching.** Every request recomputes. Fine at this
  data size; revisit if a report ever gets slow.

### ~~SMTP~~ — configured and verified live (2026-08-09)

- Real credentials, real inbox, driven through the HTTP API: registration sends
  a verification code that arrives and verifies the account, and checkout sends
  an order confirmation with the right items and total. See
  [docs/EMAIL.md](docs/EMAIL.md).
- The failure path was exercised too, by pointing `SMTP_HOST` at a dead port:
  orders are still placed and status still changes, with the real reason
  (`ECONNREFUSED`) in the log.
- Three fixes came out of it: a transport failure now answers `503` instead of a
  bare `500`; a recipient the server rejects is logged instead of passing as
  delivered; and the notification log carries the error's message rather than
  `{}`. `.env.example` gained the SMTP block it never had — its absence is why
  the variables were misnamed (`STAMP_MAIL`) and silently ignored in the first
  place.

**Open items it produced:**

- **Gmail accepts messages and then discards them, and nothing here can tell.**
  A burst of ~15 messages in 10 minutes saw some delivered and the rest vanish —
  not in spam, not in trash — every one answered `250 OK`. Not content-related:
  an identical control arrived at 14:49 and disappeared at 14:51, and delivery
  resumed once the burst stopped. **A personal Gmail account is a demo channel,
  not a production one.** Real traffic needs a transactional provider (SES,
  SendGrid, Brevo, Postmark) on a domain with SPF/DKIM/DMARC, which is also the
  only way to get delivery and bounce events.
- **No bounce handling and no retry.** A failed notification is logged and
  dropped; a hard bounce after acceptance is invisible.
- **The mail body is plain text only**, with no HTML alternative.

### ~~JMeter load testing (S18 task)~~ — done (2026-08-07)

- Two plans, 1000 requests each, 500 concurrent users, on add-to-cart /
  place-order (+ login measured separately). See
  [docs/LOAD_TESTING.md](docs/LOAD_TESTING.md) and `perf/`.
- Order flow: 1000/1000, p95 249 ms, ~102 req/s. Contention: exactly 50 of 500
  won 50 units, 450 clean 409s, no 5xx, reproduced three times.

**Open items it produced:**

- ~~**Login blocks the event loop.**~~ — done (2026-08-09). Moved from
  `bcryptjs` to the native `bcrypt` binding, so hashing runs in libuv's thread
  pool. Ten concurrent compares: 2443 ms → 657 ms; **event-loop stall: 1000 ms →
  6 ms**. No password migration — both emit `$2b$` hashes and verify each
  other's, pinned by a committed `bcryptjs` fixture. No build step either: the
  package ships N-API prebuilds (including musl for the Alpine image) and works
  under the Dockerfile's `npm ci --ignore-scripts`.
- ~~**bcrypt silently truncates at 72 bytes.**~~ — done (2026-08-09). Flagged in
  the mentor's S18 material and confirmed against this codebase: a 92-character
  password matched both its own 72-byte prefix and a different tail. Every path
  now caps at 72 **bytes** — registration, admin-created accounts, the reset
  flow, and both login endpoints (40 Arabic letters are under any character
  limit and over the byte one). Capping login is only safe because there is no
  production data and no path can create a longer password any more; login keeps
  a minimum of 1 so it does not restate the password policy to an attacker.
  Re-measured under JMeter, same 500 concurrent logins: **23.6% → 100% success,
  p50 35.5 s → 786 ms, ~46 logins/s, and 0 pool timeouts against 499 before.**
  Plan committed as `perf/plans/03-login.jmx` (`npm run perf:login`) — login had
  no re-runnable plan of its own until now.
- **`UV_THREADPOOL_SIZE` must be set in deployment.** libuv defaults to 4
  threads on any machine, so on the 12-core host used here the native binding
  hashed on a third of the available cores: 18 logins/s at the default, 46 with
  it set to the core count. It is not in `.env.example` on purpose — libuv reads
  it as the process starts, before any `.env` is loaded, so it belongs on the
  container or service definition.
- **Login capacity is still ~4 logins/s/core** — that part is CPU and cannot be
  optimised away, only scaled horizontally. Needs no code change; it is a
  deployment decision about instance count.
  **Do not lower the cost factor** without treating it as a security decision.
  Both sibling teams hash at cost 10 — a quarter of the work per attempt.
- ~~**`DATABASE_POOL_MAX` is untuned.**~~ — done (2026-08-10). Swept 5 → 80
  against the order-flow plan now that login is off the critical path. There is
  a near-binary cliff between 8 and 10 (31% → 100% success), no throughput gain
  above 10, and a measurable tail-latency cost for going higher: place-order p95
  102 ms at 10, 193 ms at 20, 329 ms at 80, reproduced across two sweeps.
  **Default stays 20** — twice the margin over the cliff for ~90 ms of p95 —
  with the guidance now a range: no lower than 12, no higher than 20. Little's
  Law says only ~2.3 connections are needed on average, so the cliff is burst
  behaviour rather than capacity; the mechanism is a hypothesis, the cliff is
  measured.
- ~~**The pool sweep covers checkout only.**~~ — done (2026-08-10).
  `perf/plans/04-dashboard.jmx` (`npm run perf:dashboard`) against 50 000
  seeded orders/transactions over 90 days. **The 12–20 range transfers** — a
  pool of 5 costs 27% of throughput, above 20 gives nothing — but there is **no
  cliff**: the same pool of 5 that took checkout to a 31% success rate serves
  every report, only slower. The difference is connection hold time: checkout
  holds one connection for a whole interactive transaction, the reports hold
  none across await points. Short queries degrade, held transactions collapse.
  Also disproved the worry that prompted it: `overview` fans out to 11 parallel
  queries, but each holds its connection for a millisecond or two, so they queue
  through the pool rather than exhausting it — 100 concurrent admins, 0 pool
  timeouts, ~160 req/s.
- **Reports have not been measured against years of data.** 50 000 transactions
  is comfortable; the `date_trunc` series has no index helping it, and that is
  where growth would show first.
- **First report after a restart costs 307 ms against a warm 17 ms.** Cold
  PostgreSQL planning and cache, paid once per deployment — worth knowing before
  quoting a number from a fresh process.
- **500 truly simultaneous checkouts fail at every pool size tested.** With a
  1-second ramp-up instead of 10, place-order collapses to ~0% at 10, 20, 40 and
  80 — a mix of pool timeouts and Prisma's 2-second transaction `maxWait`, plus
  socket-level refusals once the pool is large. No pool size rescues it; that is
  an admission-control problem (queue, shed load, or scale out), not a tuning
  one.
- ~~**The rate limiter is untested.**~~ — done (2026-08-10). Covered by
  `tests/middleware/rateLimit.unit.test.ts` (environment stubbed to production,
  since the suite's own `NODE_ENV=test` skips it) and verified live: 25 logins
  gave exactly `200 x20, 429 x5` with draft-7 headers and `Retry-After`.
  **Two bugs came out of it:**
  - **It could not tell customers apart.** Nothing set `trust proxy`, so behind
    any load balancer `req.ip` is the proxy for everyone — measured: 20 distinct
    addresses exhaust the auth limit and the 21st customer is refused. That is a
    global cap of 20 logins per 15 minutes for the whole service. Now
    `TRUST_PROXY`, a hop count defaulting to 0; blind trust is the opposite
    failure, letting a client forge a fresh bucket per request.
  - **Login 500'd on a double-click.** `RefreshToken.tokenHash` is unique and a
    refresh JWT's only varying claim was `iat` (one-second resolution), so two
    logins in the same second collided — 14 of 20 failed. Fixed with a random
    `jti`. The 500-concurrent login plan could never have found it: every
    virtual user there is a different account.
- **The limiter's _limits_ are still unvalidated against real traffic.** 20 auth
  attempts per 15 minutes and 120 requests per minute are reasonable guesses,
  not numbers derived from observed usage. Revisit once there is production
  traffic to look at.
- **The limiter counts per instance.** It uses the in-memory store, so N
  instances means N times the effective limit. A shared store (Redis, already a
  dependency) is what makes the number mean what it says.
- **The load runs still skip it**, and should: `NODE_ENV=test` disables the
  limiter so the numbers describe the application rather than the limiter. That
  is a property to keep, not a gap — it is why the tests above stub the
  environment instead of changing how the plans run.

### ~~Restaurant-owner perspective (Kamal's branch, part 4)~~ — done

Shipped as `Restaurant.ownerId` + the `RESTAURANT` role, closing the scope
map's `Restaurants Order History` and `Cancelled Orders by Customers or
Restaurants`. Kamal's `customer-management` work was the starting point and the
naming follows it (`/restaurants/me/orders`), with two departures:

- **No self-registration.** His branch has `POST /restaurants/register`, which
  creates a restaurant for whoever is logged in. The scope map has no such
  endpoint, and adding one means deciding — with no source — who may claim a
  restaurant. An admin assigns ownership instead.
- **No `UserType` / `UserRole` tables.** His branch carries the ERD's full role
  tables; ours stays an enum with a third value, because every role is named in
  an `authorize()` call. Reasoned through in
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#L399).

Still open, and deliberately so: **demoting an account does not clear the
`Restaurant.ownerId` rows pointing at it.** The service refuses a non-RESTAURANT
actor regardless, so this is not a hole — but an admin who demotes an owner and
later re-promotes them silently restores their old restaurants. Clearing the
rows on demotion is a product decision nobody has made.

### ~~Push Notification~~ — done (2026-08-11)

The official `Notify Customer With Order Status` → `Push Notification`, over
the W3C Web Push standard. See [docs/PUSH.md](docs/PUSH.md).

**No provider and no account.** The VAPID pair is generated locally and the
push goes straight to the endpoint the browser issued. FCM would also have been
free — unlimited on the Spark plan, no card — but it needs a Google Cloud
project and a client SDK to demonstrate, and a single page plus a service
worker proves Web Push end to end.

**Open items it produced:**

- **No delivery record.** A push that succeeded is not written down anywhere,
  so "did the customer get told" can only be answered for email. The auditing
  table exists and could carry it; nobody has asked for it, and doing it would
  mean a row per device per status change.
- **The demo page is a dev tool**, served only outside production. It is not a
  client, and nothing in the product depends on it.
- **SMS is still not done**, and remains the last notification gap. There is no
  genuinely free provider: Twilio's trial stamps
  "Sent from your Twilio trial account" on every message and reaches at most 5
  pre-verified numbers, and Vonage's sandbox is the same shape. The scope map
  says `Email / SMS` in both places it appears and the email side works.
