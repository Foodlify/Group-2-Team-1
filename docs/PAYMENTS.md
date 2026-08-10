# Payments

Two payment methods, one strategy interface.

| Method        | Gateway | Settles when                          | Available                      |
| ------------- | ------- | ------------------------------------- | ------------------------------ |
| `CASH`        | none    | order reaches `DELIVERED`             | always                         |
| `CREDIT_CARD` | Stripe  | Stripe's webhook confirms the payment | only when Stripe is configured |

> **Status of the Stripe path:** unit-tested against a mocked SDK, and **verified
> end-to-end against a live Stripe test account on 2026-08-09** — real Checkout
> Session, real card payment, real webhook deliveries, including the replay and
> expiry paths. See [What the live run proved](#what-the-live-run-proved).
>
> **Gateway refunds** are built and verified live too — see
> [Refunds](#refunds).

---

## Why Stripe, and why Checkout

Stripe hosts the payment page. Card details go from the customer's browser
straight to Stripe and never touch this server, which keeps the entire PCI
burden off the project — the reason Checkout was chosen over Payment Intents,
where we would have to handle the card form ourselves.

Stripe also issues test API keys with no merchant account, company registration
or bank details, which is what makes the flow reproducible by anyone on the
team. `Group-1-Team-2` integrated Stripe the same way.

---

## The flow

```
POST /api/v1/orders  { paymentMethod: "CREDIT_CARD" }
│
├─ ── database transaction ──────────────────────────────
│    lock cart → check prices → RESERVE STOCK
│    create Order (PENDING) + OrderItems
│    create Transaction (PENDING, CREDIT_CARD)   ← strategy.pay()
│    clear cart
│  ── commit ─────────────────────────────────────────────
│
├─ create Stripe Checkout Session                 ← strategy.initiate()
│    metadata: { orderId, transactionId }
│    store session id on the Transaction as externalRef
│
└─ 201 { ...order, paymentUrl: "https://checkout.stripe.com/..." }

     customer pays on Stripe's page
                 │
                 ▼
POST /api/v1/payments/stripe/webhook          ← called by Stripe, not the client
│
├─ checkout.session.completed
│     Transaction → SUCCESS,  Order → CONFIRMED
│
└─ checkout.session.expired | async_payment_failed
      cancel the order: Transaction → FAILED, reserved stock released
```

### The order is never confirmed by the browser

The customer landing on `STRIPE_SUCCESS_URL` proves nothing. They can close the
tab before being redirected, or navigate to that URL directly. **Only the
webhook may mark a card payment `SUCCESS`.** Nothing in `stripe.strategy.ts`
returns a status other than `PENDING`.

---

## Three design decisions worth knowing

### 1. The gateway call happens after the transaction commits

`PaymentStrategy` has two phases:

- `pay()` runs **inside** the checkout transaction and stays local.
- `initiate()` runs **after the commit** and is where the HTTPS call lives.

Creating the Stripe session inside the transaction would hold the cart's row
lock and a pooled connection open for the whole round-trip to Stripe. The load
tests already showed what that costs: with a fixed `DATABASE_POOL_MAX`, requests
parked on a slow operation exhaust the pool and everything behind them fails
waiting for a connection (`docs/LOAD_TESTING.md`).

The cost of this choice is a window where the order is committed but the session
does not exist yet. If `initiate()` throws, `placeOrder` **cancels the order** —
which releases the reserved stock and marks the pending payment `FAILED` through
the existing cancellation path — and answers `402`.

### 2. Stock is reserved at checkout, not at payment

A card order holds its units from the moment it is placed, before any money
moves. The alternative — reserve only once payment succeeds — would let 500
people pay for 50 units and then refund 450 of them.

This is why `checkout.session.expired` matters: Stripe fires it when a session
goes unpaid for 24 hours, and that event is what puts the units back. Without
handling it, abandoned card checkouts would silently drain the catalog.

### 3. Every handler is idempotent

Stripe retries a delivery for up to three days until it receives a `2xx`, and
may deliver the same event more than once regardless.

Every handler begins by looking for a **still-pending gateway payment** for the
order and returns quietly when there is none. A replayed `completed` therefore
cannot re-settle a settled payment, and a replayed `expired` cannot cancel an
order twice. The order's own status update is a conditional write
(`expectedStatus: "PENDING"`), so a webhook can never drag a `CANCELLED` order
back to `CONFIRMED`.

---

## The webhook endpoint

`POST /api/v1/payments/stripe/webhook`

It is mounted in `app.ts` **before `express.json()`** and outside the `/api/v1`
router. Both are deliberate:

- **Raw body.** The signature covers the exact bytes Stripe sent. Once
  `express.json()` has consumed the stream, re-serialising the object produces
  a different byte sequence and every signature check fails. The route uses
  `express.raw({ type: "application/json" })`.
- **No rate limiter.** Stripe retries for three days; answering `429` would turn
  a traffic spike into lost payment confirmations.

**The signature is the authentication.** There is no session or token — the
endpoint is public because Stripe calls it from its own servers. An
unverifiable body is rejected with `400` (a 4xx tells Stripe to stop retrying,
which is right for a forged call). A handler that fails halfway answers `500`
**on purpose**, so Stripe retries rather than leaving a paid order stuck
`PENDING`.

---

## Configuration

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUCCESS_URL=http://localhost:3000/payment/success   # optional
STRIPE_CANCEL_URL=http://localhost:3000/payment/cancel     # optional
```

Without `STRIPE_SECRET_KEY` the card strategy is never registered **and**
`CREDIT_CARD` is absent from `SUPPORTED_PAYMENT_METHODS`, so it disappears from
request validation and from the generated OpenAPI document. Both are driven by
the same condition, which is what stops the API advertising a method that would
fail at runtime — `payment.service.unit.test.ts` asserts the two sets are equal.

Setting `STRIPE_SECRET_KEY` **without** `STRIPE_WEBHOOK_SECRET` fails validation
at boot. A card payment whose webhook can never be verified stays `PENDING`
forever and its reserved stock is never released; refusing to start is better
than taking money we cannot confirm.

---

## Verifying against real Stripe

**Done — 2026-08-09.** The whole flow was exercised against a live Stripe test
account: a real Checkout Session, a real card payment, and real webhook
deliveries. Results are in [What the live run proved](#what-the-live-run-proved)
below. The steps are kept because they are what you repeat on a new machine, a
new account, or after the CLI's signing secret changes.

**1. Create a Stripe account.** <https://dashboard.stripe.com/register>. No
company details or bank account are needed to use test mode.

**2. Stay in test mode.** The dashboard has a **Test mode** toggle, top right.
Test keys begin `sk_test_` / `pk_test_`; a key beginning `sk_live_` moves real
money and must never appear in this repo or in a `.env` that gets shared.

**3. Copy the secret key.** Developers → API keys → _Secret key_ → Reveal.

**4. Install the Stripe CLI** and forward webhooks to the local server:

```bash
stripe login
# Use YOUR PORT — the one in .env. It is 4444 in this repo's setup, not 3000.
stripe listen --forward-to localhost:4444/api/v1/payments/stripe/webhook
```

`stripe listen` must **keep running** in its own terminal for the whole session:
it is the tunnel, and Stripe cannot otherwise reach a server on `localhost`.

It prints a signing secret (`whsec_...`) — that is `STRIPE_WEBHOOK_SECRET`. It
belongs to the CLI and differs from the secret shown for a dashboard-registered
endpoint in production. Read it from the command's output each time rather than
assuming it is unchanged.

**5. Put both in `.env`**, restart the server, and confirm the log line
`Stripe card payments enabled`.

**6. Place a card order** and open the returned `paymentUrl`. Test card
`4242 4242 4242 4242`, any future expiry, any CVC, any postcode.

**7. Check what to expect:**

| Check                         | Expected                                                   |
| ----------------------------- | ---------------------------------------------------------- |
| Response to `POST /orders`    | `201`, `status: "PENDING"`, a `paymentUrl` present         |
| `Transaction` row immediately | `PENDING`, `externalRef` = `cs_test_...`                   |
| After paying                  | `Transaction` `SUCCESS`, `Order` `CONFIRMED`               |
| Stock                         | decremented at checkout, **not** at payment                |
| Abandon the page, wait 24h    | `checkout.session.expired` → order `CANCELLED`, stock back |

**8. Force the failure path** without waiting a day. Expire the order's **own**
session, taking the id from its `Transaction.externalRef`:

```bash
stripe post /v1/checkout/sessions/cs_test_.../expire
```

> Do **not** use `stripe trigger checkout.session.expired` for this. It invents
> a session of its own with no `orderId` in the metadata, so the handler
> correctly drops it and nothing happens — it looks like a pass while testing
> nothing. Expiring the real session is what delivers an event carrying our ids.

> On Git Bash, prefix the command with `MSYS_NO_PATHCONV=1`. Otherwise the shell
> rewrites the leading `/` into a Windows path and Stripe answers
> "Unrecognized request URL".

**9. Prove the handlers are idempotent** by redelivering both events:

```bash
stripe events resend <completed_event_id>   # must not re-settle the payment
stripe events resend <expired_event_id>     # must not cancel or release twice
```

**10. Confirm the signature check is live.** A `curl` with no
`Stripe-Signature` header, and one with a made-up signature, must both return
`400`:

```bash
curl -X POST localhost:4444/api/v1/payments/stripe/webhook \
  -H 'Content-Type: application/json' -d '{"type":"checkout.session.completed"}'
```

---

## What the live run proved

Run on 2026-08-09 against a live Stripe test account, with the API on a
throwaway PostgreSQL and `stripe listen` tunnelling the callbacks. Payment was
made through the real hosted page with card `4242 4242 4242 4242`.

| #   | Check                                                                                     | Result                                                                                              |
| --- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Checkout session created, `paymentUrl` returned                                           | `201`, page live, showed `EGP 60.00` for the right order                                            |
| 2   | Before payment                                                                            | order `PENDING`, payment `PENDING`, `externalRef` = real `cs_test_...`                              |
| 3   | **Stock at checkout**                                                                     | `1000000 → 999998` — decremented **before** any money moved                                         |
| 4   | Cart                                                                                      | cleared                                                                                             |
| 5   | After paying                                                                              | order `CONFIRMED`, payment `SUCCESS`, `60.00 EGP`, timeline `PENDING → CONFIRMED`                   |
| 6   | Events we don't handle (`payment_intent.succeeded`, `charge.succeeded`, `charge.updated`) | acknowledged `200`, ignored                                                                         |
| 7   | **Replayed `completed`**                                                                  | logged "replayed for a settled payment; ignoring" — timeline, payment count and stock all unchanged |
| 8   | Unpaid order held stock                                                                   | scarce item `5 → 2` while `PENDING`                                                                 |
| 9   | **Session expired**                                                                       | order `CANCELLED`, payment `FAILED`, **stock `2 → 5`**                                              |
| 10  | **Replayed `expired`**                                                                    | logged "already resolved" — stock stayed `5`, not `8`; no second cancellation                       |
| 11  | Paid order during all of the above                                                        | untouched, still `CONFIRMED`                                                                        |
| 12  | Forged webhook, no signature                                                              | `400`                                                                                               |
| 13  | Forged webhook, invalid signature                                                         | `400`                                                                                               |

Final ledger:

```
 order_status | payment |   method    | amount |     stripe_session
--------------+---------+-------------+--------+------------------------
 CONFIRMED    | SUCCESS | CREDIT_CARD |  60.00 | cs_test_a16a9Jzt9Li8fg
 CANCELLED    | FAILED  | CREDIT_CARD | 136.50 | cs_test_a1dYBC37ZUWLF6
```

### Refund retry, verified live — 2026-08-09

| #   | Check                                                                                                    | Result                                                            |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Refund fails (gateway reference removed), then cancel                                                    | `200`, stock released, `REFUND … FAILED` with its reason          |
| 2   | `GET /refunds/outstanding`                                                                               | One row, with the failure reason attached                         |
| 3   | Reference restored, `POST /refunds/{id}/retry`                                                           | `200`, `REFUND … SUCCESS`, `re_3U2XHc…`                           |
| 4   | Retry the now-settled refund                                                                             | `409 This refund has already been paid back`                      |
| 5   | **Double-refund test** — ledger forced back to `FAILED` while Stripe still held the refund, then retried | Adopted the **same** `re_3U2XHc…`, no second refund created       |
| 6   | **Stripe's own figures afterwards**                                                                      | charged `9100`, `amount_refunded` `9100` — refunded exactly once  |
| 7   | Auth                                                                                                     | `401` no token, `403` customer, `400` bad limit, `404` unknown id |
| 8   | Webhook still routes past the new admin router                                                           | `400` on an unsigned call, as before                              |

Check 5 is the whole point of the feature, and check 6 is what proves it: had
the lookup been missing, `amount_refunded` would read `18200` against a `9100`
charge.

Checks 7, 9 and 10 below are the ones worth repeating after any change to the webhook:
they are the difference between a payment system and a payment system that
double-charges or leaks stock.

### Refunds, verified live — 2026-08-09

Three paid card orders were cancelled by an admin, against the live test
account.

| #   | Check                                                                            | Result                                                                                                           |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | `paymentIntentId` captured when the payment settled                              | `pi_3U2VVAPvEuNLWkDe27kN53mh` stored on the payment                                                              |
| 2   | **Refund of a paid order** (91.00 EGP)                                           | `REFUND … SUCCESS`, `externalRef` = `re_3U2VVAPvEuNLWkDe2gMRMRrj`                                                |
| 3   | **Stripe's own record**                                                          | `amount: 9100`, `currency: egp`, `status: succeeded`, `reason: requested_by_customer` — money really moved       |
| 4   | Order and stock                                                                  | `CANCELLED`, held units returned                                                                                 |
| 5   | Replayed `refund.updated`                                                        | ignored — still one REFUND row, stock unchanged                                                                  |
| 6   | **PaymentIntent fallback** — metadata stripped, then cancelled (45.50 EGP)       | refunded anyway via session lookup, `amount: 4550` confirmed by Stripe                                           |
| 7   | **Failed refund** — every gateway reference removed, then cancelled (182.00 EGP) | cancel returned `200`, stock released, `REFUND … FAILED` with the reason stored, logged as "money is still owed" |

Check 7 is the important one. The system stayed usable and told the truth: the
customer's order was cancelled, the stock came back, and the unpaid obligation
is sitting in the ledger as `FAILED` where someone can find it.

**A defect this run found:** the failure was first logged as `"error":{}`.
`Error` has no enumerable properties, so `JSON.stringify` empties it — the most
important log line in the system arrived with no reason attached. Fixed with
`shared/errors/describe.ts`, and re-verified: the message and stack now appear.

---

## Refunds

Cancelling a paid card order returns the money through Stripe.

```
PATCH /api/v1/orders/{id}/status  { "status": "CANCELLED" }   (or DELETE, by the customer)
│
├─ ── database transaction ──────────────────────────────
│    order → CANCELLED
│    release the reserved stock
│    write a REFUND row as **PENDING**        ← no money has moved yet
│  ── commit ─────────────────────────────────────────────
│
├─ POST /v1/refunds to Stripe                  ← strategy.refund()
│    idempotencyKey: refund-<our REFUND row id>
│
└─ REFUND row → SUCCESS (+ Stripe's re_... as externalRef)
              → FAILED  (+ the reason, in metadata)
              → PENDING (gateway still working; settled later by webhook)
```

### The REFUND row is never SUCCESS before the gateway says so

The old behaviour wrote `REFUND … SUCCESS` the moment an order was cancelled,
which was simply false — nothing had been sent anywhere. It now starts PENDING
and is only settled by the gateway's answer. `refundOrderTransactions` returns
those rows so the caller can execute them **after the commit**, because the
network call must not happen inside the transaction.

Cash is unchanged and still SUCCESS immediately: there is no gateway to call, so
the ledger entry is the whole of the action. (In practice cash never reaches
here — an order can only be cancelled before `DELIVERED`, and cash is not
settled until delivery, so there is no collected money to return.)

### Chasing a refund that did not go through

Two ADMIN-only endpoints, because a `FAILED` refund row that nobody can see or
act on is not much better than no record at all.

| Endpoint                                   | What it does                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `GET /api/v1/payments/refunds/outstanding` | Lists `FAILED` **and** `PENDING` refunds, oldest first, each with the reason it failed |
| `POST /api/v1/payments/refunds/{id}/retry` | Sends one to the gateway again                                                         |

`PENDING` is listed alongside `FAILED` on purpose: a refund stuck pending for
days is an unpaid obligation just as much as a failed one, and listing only
failures would hide it.

**Retrying is safe to repeat, and that is not a hope about timing.** Before
creating anything, the strategy asks Stripe what refunds it already holds for
that PaymentIntent and looks for one tagged with this exact ledger row's id. If
it finds one, it adopts it — same refund id, marked `reconciled` — instead of
sending the money again.

The idempotency key alone would not be enough: **Stripe expires those keys after
24 hours**, and a retry is by definition later than the attempt it retries.
Without the lookup, retrying a refund that actually succeeded — and whose result
we simply failed to record — would pay the customer twice the next day. One
extra round-trip on a rare operation buys "cannot double-refund" as a property
of the code.

The match is on our own `refundTransactionId` metadata, not on the amount: two
refunds of the same order for the same amount are indistinguishable by value,
and adopting the wrong one would settle one obligation with another's money. A
refund issued by hand from the Stripe dashboard carries no such metadata and is
deliberately **not** adopted — a human refunding manually is not evidence that
_this_ row was paid.

**There is no automatic retry.** Sending customers' money back on a schedule,
with nobody looking, is not a decision a cron job should make — a failed refund
usually means something is wrong that a retry alone will not fix.

### A failed refund is recorded, never thrown

If Stripe rejects the refund, the request still returns `200`. The cancellation
already succeeded and is correct — the order is gone and the stock is back — so
failing the caller now would report something untrue.

What must never happen is the failure going unnoticed. It is logged at `error`
with _"Gateway refund failed — money is still owed"_ and the REFUND row is
marked **FAILED** with the reason in its metadata. **A `FAILED` REFUND row is
money this business still owes someone** and needs a human.

> Watch for these. `select * from "Transaction" where type='REFUND' and status
in ('FAILED','PENDING')` is the query that finds unpaid obligations.

### Refunding needs the PaymentIntent, not the session

Stripe refunds a PaymentIntent; `externalRef` holds the Checkout **Session** id,
which its refund API rejects. The webhook that confirms payment therefore stores
`paymentIntentId` on the payment's metadata. Payments settled before that
existed fall back to retrieving the session and reading it from there, so an old
order is still refundable rather than silently stuck.

### Idempotency, again

The refund request is keyed on our own REFUND row id, which exists exactly once
per refund — a retried call returns the original refund instead of sending the
money back twice. `refund.updated` / `refund.failed` webhooks settle refunds the
gateway left pending, and re-applying the same status is skipped, so redelivery
changes nothing.

---

## Viewing transactions, and receipts

Two of the three endpoints the official scope map names under Payment
Integration (`View Payment Transactions` and `Generate Transaction Receipt`).
The transaction module had a model, a repository and a service but no routes at
all, so neither was reachable.

| Endpoint                                             | Who      |
| ---------------------------------------------------- | -------- |
| `GET /api/v1/customers/me/transactions`              | customer |
| `GET /api/v1/customers/me/transactions/{id}/receipt` | customer |
| `GET /api/v1/transactions`                           | ADMIN    |
| `GET /api/v1/transactions/{id}/receipt`              | ADMIN    |

Both listings page and filter by `type`, `status` and `orderId`.

**Ownership runs through the order.** A transaction has no customer of its own,
so the customer listing filters on `order.customerId` — never on anything from
the request. A row with no order (the schema permits them, for future wallet
top-ups) belongs to nobody and is invisible to every customer.

**A receipt not yours is a 404, not a 403.** A 403 confirms the id exists to
somebody with no business knowing that, so the ownership check returns the same
answer as a missing row.

**Receipts are rendered, never stored.** Two requests for the same transaction
differ only in `issuedAt`. Everything else is read from the order's own
snapshots — `OrderItems` carries the name and price as they were at checkout —
so a receipt does not change when a restaurant renames a dish or reprices it.
There is a test that renames the item afterwards and asserts the receipt still
says `Koshary` at `8.15`.

**Only settled transactions have one.** `PENDING` or `FAILED` gives `409`: a
receipt is evidence money moved, and issuing one for a payment that never
completed hands the customer proof of something that did not happen.

The line totals are computed in `Decimal` and converted once at the response
boundary. `8.15 × 3` is the exact number this codebase has already served
wrongly once, as `24.450000000000003`, in the order line subtotals.

## What is not built

- **Alerting.** Nothing tells anyone an outstanding refund exists; someone has
  to call the endpoint. A scheduled check that reports the count would close
  that without any automatic money movement.
- **Wallet and PayPal.** Present in the `PaymentMethod` enum, no strategy
  behind either, absent from `SUPPORTED_PAYMENT_METHODS`.
- **Saved cards** and 3-D Secure step-up handling beyond what Stripe Checkout
  does on its own.
- **Partial refunds** — and deliberately so. `PARTIAL_REFUND` exists in the
  enum and the dashboard already subtracts it, but nothing writes one. It
  appears nowhere in the official scope map, and the mentor's S15 decision was
  that a refund is a **manual refund**: record it and change the status, with
  no gateway integration at all. The Stripe refunds above already go beyond
  that, so partial refunds would be an extra on top of an extra.
- **PDF receipts.** The receipt is JSON. Rendering it as a document is a
  presentation concern and needs a rendering dependency.
