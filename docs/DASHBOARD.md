# Dashboard & Reports

The seventh official module: system counters and transaction reports for
administrators. Three read-only endpoints, no new tables, no migration.

| Endpoint                                 | What it answers                                  |
| ---------------------------------------- | ------------------------------------------------ |
| `GET /api/v1/dashboard/overview`         | How big is the platform, and what has it earned? |
| `GET /api/v1/dashboard/transactions`     | Daily or monthly money, over a window            |
| `GET /api/v1/dashboard/restaurants/{id}` | The same, for one restaurant                     |

All three are **ADMIN-only**. The guard is on the router rather than each
route, so a report added later is locked down by default instead of by
remembering.

---

## Four rules that decide whether these numbers are true

A report is trusted precisely because nobody checks it by hand. That makes a
quietly wrong figure worse here than almost anywhere else in the system.

### 1. Refunds are subtracted, never added

The ledger records **what moved, not which direction** — a `REFUND` row carries
a positive amount, same as a payment. Summing every transaction together turns
a day of refunds into a record day.

```
net = payments − (REFUND + PARTIAL_REFUND)
```

`PARTIAL_REFUND` is included via a set, not a `type === "REFUND"` check, which
is the version that silently misses it. A day can legitimately net **negative**
(refunding yesterday's orders today) and is reported that way; clamping it at
zero would stop the books adding up across periods.

### 2. Only `SUCCESS` counts

A `PENDING` card payment is a customer who has been shown a checkout page. A
`FAILED` refund is money that never left. Counting either as revenue invents
it. Every money query is scoped to `status: "SUCCESS"`.

> Note the one deliberate exception: `counters.transactions` counts **all**
> transaction rows regardless of status, because it answers "how much activity
> is there", not "how much money is there". The revenue block is the money.

### 3. Money is summed in SQL, as `Decimal`

Nothing is loaded into JavaScript to be added up. Prisma returns `_sum` over a
`Decimal` column as a `Decimal`, and the raw series query does the same, so
exactness survives to the response boundary — where `.toNumber()` is called
once, matching what the order and cart responses already do.

This is not theoretical. The order module had to be fixed for exactly this:
`8.15 × 3` served as `24.450000000000003`. Verified live on this module too —
three payments of `19.99` less a `19.99` refund returns **`39.98`**, where the
float path gives `39.980000000000004`.

### 4. Deleted things are not counted

`isDeleted` restaurants are excluded from the counters and cannot be reported
on (`404`), or the dashboard describes a catalog bigger than the one being
served. Customers are split into `customers` and `activeCustomers`, because
`isActive` lives on `User` and a disabled account still has its `Customer` row.

---

## Time is UTC, and that is a real limitation

Buckets and the "today"/"this month" counters use **UTC** boundaries. The
response says so (`"timezone": "UTC"`) rather than leaving the caller to guess.

`createdAt` is `timestamp(3)` **without** a time zone, so there is no offset
stored to convert from. For a business operating in Cairo (UTC+2/+3) this means
"today" starts at 02:00 or 03:00 local. Orders placed late at night land in the
next day's bucket.

That is a known trade-off, not an oversight — see `todo.md`. Fixing it properly
means either storing `timestamptz` or taking a timezone parameter and
converting; both are real changes, and neither should be faked by shifting
numbers around after the fact.

> **A trap worth knowing.** Because the column has no zone, _whatever writes it
> decides what it means_. Prisma writes UTC, and every query here binds UTC, so
> the application is self-consistent. But a `psql` script using `now()` writes
> **local wall-clock time** — which is exactly how the first live check of this
> module came back empty: seeded rows said `16:12` (Cairo) while the query
> asked for `13:12` (UTC). The application was right and the seed was wrong.
> Anything writing these columns outside Prisma must write UTC
> (`now() at time zone 'UTC'`).

---

## The one piece of raw SQL

`date_trunc` cannot be expressed through Prisma, and doing the bucketing in
JavaScript would mean pulling every transaction in the window across the wire
to group it here. So `transactionSeries` is a `$queryRaw`.

Two things keep that safe:

- The `date_trunc` unit comes from a **fixed lookup table**
  (`DATE_TRUNC_UNIT`), never from the request — even though the request is
  already validated against the same list. A validated enum is still not a
  safe source for a SQL fragment.
- Every other value is a bound parameter, including the optional restaurant
  filter, which is composed with `Prisma.sql`.

`COUNT(*)` is cast with `::int`. Postgres returns `bigint` otherwise, which
arrives as a JavaScript `BigInt` and makes `JSON.stringify` throw at the
response boundary — a failure that only appears once real rows exist.

---

## Windows

`from` is inclusive, `to` is **exclusive**. Adjacent windows therefore never
both count the transaction that lands exactly on the boundary. Defaults to the
last 30 days ending now.

The response echoes the window and granularity it actually used, so a caller
can tell what period the numbers describe rather than assuming.

Totals are re-summed from the returned buckets rather than queried separately —
the header can never disagree with the rows underneath it.

---

## Testing

- **Unit** (`tests/dashboard/`) — the arithmetic: refund subtraction, decimal
  exactness, UTC boundaries, empty-status handling, window resolution.
- **Integration** (`tests/integration/dashboard.reports.integration.test.ts`) —
  runs against a real PostgreSQL, because the raw `date_trunc` query is the one
  part `tsc` never checks and no mock ever executes. It covers day and month
  bucketing, the exclusive upper bound, the `Order` join that scopes a
  restaurant's money, `SUCCESS`-only filtering, and that `count` arrives as a
  number rather than a `BigInt`.

Every assertion was checked against a deliberately broken copy of the source.
One gap showed up only that way: the float-drift test used amounts in
_different_ buckets, so mutating the accumulation _inside_ a bucket to floats
still passed. Two same-bucket cases were added.
