# Payments

Two payment methods, one strategy interface.

| Method        | Gateway | Settles when                          | Available                      |
| ------------- | ------- | ------------------------------------- | ------------------------------ |
| `CASH`        | none    | order reaches `DELIVERED`             | always                         |
| `CREDIT_CARD` | Stripe  | Stripe's webhook confirms the payment | only when Stripe is configured |

> **Status of the Stripe path:** implemented and unit-tested against a mocked
> SDK, with signature verification exercised using real HMAC. It has **not yet
> been run end-to-end against a live Stripe account** — see
> [Verifying against real Stripe](#verifying-against-real-stripe). Treat the
> card flow as unproven in production until that has been done.

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

Everything below still needs doing — it is the one part of this feature that
cannot be covered by tests on a machine with no Stripe account.

**1. Create a Stripe account.** <https://dashboard.stripe.com/register>. No
company details or bank account are needed to use test mode.

**2. Stay in test mode.** The dashboard has a **Test mode** toggle, top right.
Test keys begin `sk_test_` / `pk_test_`; a key beginning `sk_live_` moves real
money and must never appear in this repo or in a `.env` that gets shared.

**3. Copy the secret key.** Developers → API keys → _Secret key_ → Reveal.

**4. Install the Stripe CLI** and forward webhooks to the local server:

```bash
stripe login
stripe listen --forward-to localhost:3000/api/v1/payments/stripe/webhook
```

`stripe listen` prints a signing secret (`whsec_...`) — that is
`STRIPE_WEBHOOK_SECRET`. It is **specific to this CLI session** and differs from
the secret shown for a dashboard-registered endpoint in production.

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

**8. Force the failure paths** without waiting a day:

```bash
stripe trigger checkout.session.expired
stripe events resend <event_id>     # must be a no-op — proves idempotency
```

**9. Confirm the signature check is live.** A plain `curl` with no
`Stripe-Signature` header must return `400`:

```bash
curl -X POST localhost:3000/api/v1/payments/stripe/webhook \
  -H 'Content-Type: application/json' -d '{"type":"checkout.session.completed"}'
```

---

## What is not built

- **Refunds through the gateway.** Cancelling a paid card order writes a
  `REFUND` transaction to our ledger but does not call Stripe's refund API, so
  the money is not actually returned. Cash orders are unaffected. This must be
  built before the card path handles real money.
- **Wallet and PayPal.** Present in the `PaymentMethod` enum, no strategy
  behind either, absent from `SUPPORTED_PAYMENT_METHODS`.
- **Partial refunds**, saved cards, and 3-D Secure step-up handling beyond what
  Stripe Checkout does on its own.
