# Push Notifications

> The official `Notify Customer With Order Status` → `Push Notification`.
> Implemented over the W3C Web Push standard.

---

## No provider, and no account

Web Push is a standard, not a service. The pieces:

| Piece             | Who owns it    | Where it lives                     |
| ----------------- | -------------- | ---------------------------------- |
| VAPID key pair    | **us**         | environment, never the database    |
| `endpoint` URL    | browser vendor | `PushSubscription.endpoint`        |
| `p256dh` + `auth` | the browser    | `PushSubscription`, never returned |

We generate the VAPID pair ourselves:

```
npx web-push generate-vapid-keys
```

and the push goes **straight from our server to the endpoint the browser gave
us**, on Google's or Mozilla's push service. Nobody signs up to anything, there
is no dashboard, no quota and no bill.

**FCM was the alternative and is also free** — unlimited messages on the Spark
plan, no card. It was not chosen because it needs a Google Cloud project and a
client SDK to demonstrate; a single HTML page and a service worker prove Web
Push end to end, and that difference is the whole cost of this feature.

### What is not stored

The two keys in the table are the **recipient's** half: they encrypt a payload
_to that browser_. They cannot be used to send anything, and they never come
back out of the API — a customer listing their devices has no use for them, and
only somebody copying a subscription elsewhere would.

Our signing key is in the environment, like every other secret in this project.

---

## Optional, like everything else

No VAPID keys means push is off: `POST /push/subscriptions` still works,
`GET /push/public-key` answers **404**, and every send becomes a no-op. Nothing
else changes. Same "configure it or it doesn't exist" rule as the mailer, the
cache and Stripe.

404 rather than an empty string on the key, because a browser handed `""` would
call `subscribe()` with it and fail somewhere the client cannot act on.

**Half-configured is refused at boot.** A public key with no private key lets
browsers subscribe successfully and then never hear from us — a failure with no
symptom. `env.ts` rejects the pair unless both are set or neither is.

---

## The rule that matters: pruning

A push service answers **404** or **410 Gone** when a subscription no longer
exists — the browser unsubscribed, cleared its storage, or expired it. Browsers
do this routinely; it is the normal end of a subscription's life, not an error.

So those rows are **deleted**, and they are not logged as errors.

The failure this prevents has no symptom. Keep the row and the customer's other
devices still work, nothing 500s, nobody notices — there is just a table of
addresses that can never receive anything, retried on every order forever.

**The converse matters as much.** A push that merely _failed_ — the service is
down, rate-limiting us, or the network blipped — keeps its row. A status code
says nothing about whether the browser still exists, and deleting on failure
would silently unsubscribe every customer during an outage, permanently.

An error carrying no status code at all is a failure, not a gone: reading
"no status" as gone would empty the table the first time the network hiccupped.

---

## One row per browser

`endpoint` is unique, and registration is an **upsert** on it.

The endpoint _is_ the identity of a subscription. Browsers re-issue the same one
on every page load and a service worker update can re-send it at any moment. An
insert-only endpoint would either collide on the unique index — a 500 on a
routine page load — or duplicate the row, which means **every notification
arriving twice on one device**.

`customerId` is part of the update, so a shared or handed-down device follows
whoever subscribed last instead of pushing a stranger's orders to whoever is
holding it now.

Deleting a customer cascades. A row left behind is an address we would keep
pushing to on behalf of an account that no longer exists.

---

## Which events push

| Event               | Email | Push |
| ------------------- | ----- | ---- |
| Order placed        | ✅    | ❌   |
| Order status change | ✅    | ✅   |

Order confirmation is deliberately email-only: the customer is looking at the
checkout response when it fires, so the order id is already on their screen and
buzzing the device in their hand to report what it just did is noise. The scope
map agrees — push sits under `Notify Customer With Order Status`, while
confirmation is `Order Confirmation by email / SMS`.

**The two channels are wrapped separately.** A dead SMTP host cannot stop the
push and an unreachable push service cannot stop the email. Wrapping them
together would make either failure silence both, which is the opposite of the
reason for having two.

Neither can fail an order. Both run **after** the transaction commits, like the
mailer always has.

---

## Trying it

Push cannot be demonstrated from a backend alone — something has to subscribe
and receive. `public/demo/` is a page and a service worker that do, served at
`/demo/` **only when `NODE_ENV` is not `production`**. It covers Google
sign-in too, because that is the other feature with the same problem, and one
page that signs you in and then registers the device is the order you actually
do it in.

Service workers need a secure origin, and `localhost` counts, which is why the
page is served by the API itself rather than opened from disk.

1. Set the VAPID keys and start the server.
2. Open `http://localhost:$PORT/demo/` and sign in (the subscribe endpoint is
   customer-only).
3. Press **Enable notifications**.
4. Change one of that customer's orders to a new status.

The notification arrives with the tab closed. That is the part polling cannot
do, and the reason the service worker exists.

---

## Testing

- **Unit** (`tests/push/`) — the transport's gone-versus-failed distinction
  across 404, 410, 429, 500, 503 and a status-less network error; the service's
  fan-out, pruning, and that the keys never leave.
- **Integration** (`tests/integration/http.push.integration.test.ts`) — the
  unique index (a browser re-registering does not duplicate), the customer
  cascade, ownership on unsubscribe, and an order status change reaching both
  of a customer's devices. Delivery is stubbed: these tests must never reach a
  real push service.

A throwaway VAPID pair is **generated per run** in the integration config
rather than committed. Push has to be genuinely on or the suite asserts
nothing, and a key called "private" does not belong in a repository even when
it signs nothing.

Mutation-tested: ten mutations, each making one of the invisible faults above —
a gone subscription kept, a failed one pruned, an unscoped unsubscribe, a
duplicate registration, the keys returned. All ten were caught, with a no-op
control surviving as designed.
