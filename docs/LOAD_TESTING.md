# Load Testing — Apache JMeter

Session 18 task: two test plans, 1000 requests, 500 concurrent users, against
login / add-to-cart / place-order.

Everything below is a measurement taken on this codebase, not an estimate. The
plans, the seed and the analyser are in [`perf/`](../perf) and re-runnable.

---

## Summary

|                                       | Result                                          |
| ------------------------------------- | ----------------------------------------------- |
| Order flow, 500 concurrent            | **1000/1000 succeeded**, p95 249 ms, ~102 req/s |
| Stock contention, 500 racing for 50   | **exactly 50 sold**, 450 clean 409s, 0 × 5xx    |
| Reproduced on a second fresh database | identical correctness, same order of magnitude  |
| **Login, 500 concurrent**             | **collapsed — 23.6% success, p50 35.5 s**       |

The headline is the last row: the order path is comfortably fast, and **login
is the system's ceiling**, by roughly two orders of magnitude. The cause is
measured below.

---

## Environment

|            |                                                        |
| ---------- | ------------------------------------------------------ |
| App        | Built output (`npm run build` → `node dist/server.js`) |
| Node       | 22.14.0                                                |
| PostgreSQL | 17.4, local, `max_connections=200`                     |
| JMeter     | 5.6.3 (non-GUI), Java 21                               |
| `NODE_ENV` | `test`                                                 |

**`NODE_ENV=test` is not a convenience — the run is meaningless without it.**
[`rateLimit.middleware.ts`](../src/middlewares/rateLimit.middleware.ts) allows
20 auth attempts per IP per 15 minutes and 120 API requests per IP per minute.
JMeter drives everything from one IP, so under the normal settings 480 of 500
customers would receive `429` and the numbers would describe the rate limiter
rather than the application. The limiter is skipped under `NODE_ENV=test`,
which is exactly what makes the measurement possible — and worth stating,
because "we disabled a protection to get these numbers" belongs in the report,
not in a footnote.

---

## Finding 1 — Login is the ceiling, and bcrypt is why

The first version of the plans logged each virtual user in before ordering.
The result, at 500 concurrent users:

| Endpoint    | n   | ok %  | p50       | p95       | max       |
| ----------- | --- | ----- | --------- | --------- | --------- |
| Login       | 500 | 23.6% | 35 556 ms | 45 816 ms | 46 329 ms |
| Add to cart | 500 | 17.4% | 3 281 ms  | 9 090 ms  | 22 158 ms |
| Place order | 500 | 1.6%  | 600 ms    | 5 222 ms  | 20 045 ms |

**Eight orders out of 500 completed.** 181 requests never reached the server at
all (`HttpHostConnectException` — the accept queue was full), and the server
logged 499 × `timeout exceeded when trying to connect` from `pg-pool`.

The pool looked like the culprit, so `max` was raised from 10 to 20 and the run
repeated. It barely moved: 11.9% success, login p50 38 768 ms, and now
337 pool timeouts plus 152 × `Unable to start a transaction in the given time`.
Raising the pool did not help because **the pool was a symptom**.

### The measurement that settled it

```
bcryptjs compare @cost 12 : 249 ms
10 concurrent compares    : 2467 ms   (max event-loop lag 1000 ms)
=> 500 logins would need  : 124.5 s of CPU on one thread
```

Two things in that output matter:

1. **249 ms per password check.** That is bcrypt working as designed — cost 12
   is a deliberate, correct security setting.
2. **Ten "concurrent" compares took 2467 ms — exactly ten sequential ones.**
   `bcryptjs` is a pure-JavaScript implementation with no native binding, so it
   runs _on the event loop_. It does not use libuv's thread pool, and `await`
   buys nothing. While it hashes, the process serves no one: the measured
   event-loop stall was a full second.

That explains every other symptom. A blocked event loop cannot run the
callbacks that release pooled connections, so connections time out; it cannot
accept sockets, so the OS queue overflows. 500 simultaneous logins demand
**124 seconds of single-threaded CPU** — the 35-second p50 is what queueing for
that looks like.

### What this means

This is a capacity limit, not a bug. Login is **CPU-bound by design**, so the
honest conclusion is a number rather than a fix: **one instance sustains roughly
4 logins per second per core.** Options, in order of preference:

1. **Scale horizontally.** Login cost is CPU, and CPU is what more instances
   buy. This is the standard answer and needs no code change.
2. **Move hashing off the event loop** — the native `bcrypt` binding runs in
   libuv's thread pool and produces hashes compatible with the existing ones,
   so stored passwords keep working. It adds a native build step, which is why
   it is a recommendation here and not a change made in passing.
3. **Do not lower the cost factor** to make a graph look better. 12 is a
   security decision; trading it for throughput should be a deliberate,
   separate conversation.

### Why the plans were then redesigned

Because of the above, a plan that logs in first measures bcrypt and reveals
nothing about the cart or the order path. The final plans issue each virtual
user a signed access token from the seed and send it as `Authorization: Bearer`,
so the 500 concurrent users exercise **the endpoints under test**. Real users
log in once and then order repeatedly; the redesigned plans model that, and
login capacity is reported separately above.

---

## Finding 2 — The connection pool was set to 10

Chasing Finding 1 surfaced a genuine misconfiguration:
[`config/prisma.ts`](../src/config/prisma.ts) hard-coded `max: 10` with a
5-second acquisition timeout. Ten concurrent database operations is a low
ceiling for an API, and every request past it waits and then fails with a 500.

It is now `DATABASE_POOL_MAX`, defaulting to **20**, with the constraint written
down: `instances × DATABASE_POOL_MAX` must stay below the server's
`max_connections` (100 by default).

Being honest about the evidence: raising it from 10 to 20 produced **no
measurable improvement in these runs**, because bcrypt was saturating the
process long before the pool mattered. The change stands on its own reasoning —
once login is off the critical path, the order flow moves ~100 req/s through
that pool without a single timeout — but this test did not isolate its benefit.

---

## Plan 1 — Order flow under load

500 concurrent customers, each adding an amply-stocked item to their cart and
checking out: 1000 requests. Ample stock is deliberate — it isolates the
variable, so any error is the system under load rather than stock exhaustion.

| Run | Endpoint    | n   | ok %   | p50  | p95    | p99    | max    |
| --- | ----------- | --- | ------ | ---- | ------ | ------ | ------ |
| 1   | Add to cart | 500 | 100.0% | 7 ms | 152 ms | 286 ms | 388 ms |
| 1   | Place order | 500 | 100.0% | 9 ms | 249 ms | 466 ms | 692 ms |
| 2   | Add to cart | 500 | 100.0% | 7 ms | 198 ms | 370 ms | 449 ms |
| 2   | Place order | 500 | 100.0% | 9 ms | 266 ms | 538 ms | 721 ms |

**Throughput:** 102.4 and 102.5 req/s. **Errors: zero, in both runs.**

Note the shape: a 9 ms median against a 249 ms p95. That gap is the 500 users
arriving over a 10-second ramp and queueing behind each other — it is queueing
delay, not slow work. The median is what a request costs; the p95 is what
contention costs. Reporting only the 29 ms average would have hidden both.

---

## Plan 2 — Stock contention

500 concurrent customers racing for an item with **50 units**. This is the
overselling guard under real HTTP concurrency, rather than the simulated kind
in the integration suite.

| Run | Endpoint    | n   | 201    | 409     | 5xx   | p95    |
| --- | ----------- | --- | ------ | ------- | ----- | ------ |
| 1   | Add to cart | 500 | 500    | 0       | 0     | 253 ms |
| 1   | Place order | 500 | **50** | **450** | **0** | 414 ms |
| 2   | Add to cart | 500 | 500    | 0       | 0     | 124 ms |
| 2   | Place order | 500 | **50** | **450** | **0** | 260 ms |

`50 + 450 = 500`, in both runs. Verified against the database afterwards:

```
scarce stock:       0        (not negative, not left over)
scarce units sold:  50
total orders:       550      = 500 (plan 1) + 50 (plan 2)
transactions:       550      = one per order
carts left:         450      = the losers kept their carts
server errors:      0
```

Three of those lines are worth pausing on:

- **Stock is exactly 0.** Not negative — nothing was oversold. Not positive —
  nothing was needlessly refused.
- **450 carts survived.** Every losing checkout rolled back completely and left
  the customer able to retry. A partial commit would show up here as a missing
  cart.
- **Zero 5xx.** The 450 rejections were the application's own `409`, a clean
  domain response. Losing a race is not a server error.

### Why it was run twice

Thread scheduling is non-deterministic, and a race condition can hide when the
timing doesn't happen to trigger it. Independent runs against freshly seeded
databases — different cuids, different interleaving — produced the identical
50/450 split every time. A third run, driven through the packaged
`npm run perf:plan2` rather than a hand-typed command, produced it again and
left stock at 0. Response times moved between runs (p95 414 → 260 → 473 ms,
ordinary variance); the correctness numbers did not move at all. That is the
difference between "it passed" and "it holds".

This is the same invariant the integration suite proves
([Testing](../README.md#testing)), reached independently through HTTP: the
atomic conditional `UPDATE` in
[`menuItem.repository.reserveStock`](../src/modules/menuItem/menuItem.repository.ts)
is what makes it true.

---

## Reproducing

```bash
# 1. A database (any PostgreSQL; the name is arbitrary here)
export DATABASE_URL=postgresql://postgres@localhost:5455/foodlify_load
npx prisma migrate deploy

# 2. Seed 500 customers, their carts' items, and their access tokens
npm run perf:seed

# 3. The app, built, with the rate limiter skipped
npm run build
NODE_ENV=test PORT=4444 node dist/server.js

# 4. The plans (itemId comes from perf/data/items.csv)
npm run perf:plan1
npm run perf:plan2

# 5. Read the results
node perf/analyze.js perf/results/plan1-run1.jtl
```

`perf/data/` and `perf/results/` are gitignored: both are regenerated per run,
and the numbers that matter are in this document.

### On the analyser

`perf/analyze.js` exists because JMeter's `.jtl` is RFC4180 CSV whose failure
messages contain commas and are therefore quoted. The first version of this
analysis split on `","` and produced confident nonsense — phantom endpoints
named `247` with 986 ms percentiles — because every column after the first
quoted field was misaligned. It parses quotes properly now. Worth knowing
before anyone writes a quick one-liner against these files.
