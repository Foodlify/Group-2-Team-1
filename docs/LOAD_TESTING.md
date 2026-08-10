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
| Login, 500 concurrent — **before**    | collapsed — 23.6% success, p50 35.5 s           |
| Login, 500 concurrent — **after**     | **500/500 succeeded**, p50 786 ms, ~46 logins/s |
| Dashboard reports, 100 admins         | **100% ok**, ~160 req/s, no pool exhaustion     |

Login used to be the system's ceiling by roughly two orders of magnitude, and
the last two rows are the same test either side of the fix. Diagnosing it is
Finding 1; the short version is that hashing ran on the event loop, so every
other request queued behind it. The 23.6% row is kept because it is the
measurement that found the problem — deleting it would hide the only evidence
that any of this mattered.

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

**Run the order plans with `SMTP_HOST=` blank.** Every placed order sends a
confirmation email, so a 500-customer run is 500 real SMTP deliveries to
`load0@example.com` … `load499@example.com` — addresses that cannot receive
mail. This was found the hard way during the pool sweep, in a run that produced
405 `Sending email failed` lines: with real credentials in `.env`, the harness
quietly turns into a bulk sender of undeliverable mail through the developer's
own account, which is a good way to get that account rate-limited. Blanking
`SMTP_HOST` puts the mailer back on its log-only fallback. It also removes 500
outbound connections from inside the measurement.

`NODE_ENV=test` alone does **not** do this: the mailer only falls back to
logging when it has no host configured, and it is configured from `.env` like
everything else.

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
4 logins per second per core.**

But there were two problems tangled together, and only one of them is capacity:

- **Login costs CPU.** Unavoidable — that is what a password hash is for.
- **Login froze everything else.** Avoidable, and the real damage. The 35-second
  p50 was not slow hashing; it was every other request queueing behind it.

### The fix applied — `bcryptjs` → `bcrypt` (2026-08-09)

Hashing now runs in libuv's thread pool instead of on the event loop. Measured
on the same machine, cost 12:

|                          | `bcryptjs`  | `bcrypt` (native) |
| ------------------------ | ----------- | ----------------- |
| One compare              | 246 ms      | 217 ms            |
| Ten concurrent compares  | 2443 ms     | **657 ms**        |
| **Max event-loop stall** | **1000 ms** | **6 ms**          |

The last row is the point. A single login still costs the same CPU; it no longer
takes the process down with it while it spends it.

### Re-measured under JMeter — the same 500 concurrent logins

`perf/plans/03-login.jmx`, 500 threads, same machine, same seed. The plan is new:
the original login-included plan was replaced when the order plans were
redesigned, so login had no re-runnable plan of its own until now.

| Run                                  | ok %      | p50        | max       | req/s    |
| ------------------------------------ | --------- | ---------- | --------- | -------- |
| **Before** (`bcryptjs`, on the loop) | **23.6%** | 35 556 ms  | 46 329 ms | —        |
| After (`bcrypt`, default 4 threads)  | **100%**  | 9 106 ms   | 17 907 ms | 18.1     |
| Reproduced                           | 100%      | 9 025 ms   | 17 730 ms | 18.2     |
| After, `UV_THREADPOOL_SIZE=12`       | **100%**  | **786 ms** | 1 131 ms  | **46.0** |
| Same, 1-second ramp-up               | 100%      | 5 289 ms   | 10 039 ms | 46.5     |

And in the server's own log, across 2000 logins: **0 pool timeouts, 0 transaction
failures, 0 errors.** The earlier run logged 499 pool timeouts and had 181
requests refused at the socket before they reached the application at all.

**`UV_THREADPOOL_SIZE` is the second half of the fix and costs nothing.** libuv
defaults its thread pool to 4 threads regardless of the machine, so on the
12-core host used here the native binding was hashing on a third of the
available cores. Raising it to the core count took throughput from 18 to 46
logins/second and the p50 from 9 seconds to under one.

That 46/s is the real ceiling, not the test's arrival rate: a 1-second ramp-up
delivers all 500 at once and produces the same 46.5 req/s, with the p50 rising
to 5.3 s purely because everything queues at the start. It also lands almost
exactly where the arithmetic predicts — ~4 logins/second/core × 12 cores.

Set it as a real environment variable on the container or service, alongside
`NODE_ENV`; libuv reads it as the process starts, which is earlier than any
`.env` file is loaded.

**No password migration was needed.** Both libraries emit `$2b$` hashes and each
verifies the other's — checked in both directions, and pinned by a committed
`bcryptjs` hash in `tests/auth/password.helper.unit.test.ts` so a future upgrade
cannot break it silently.

**It needs no build step**, contrary to the caution in the earlier version of
this document. `bcrypt@6` ships N-API prebuilds inside its own npm tarball,
including a musl build for the Alpine image. Verified here: it installs in about
a second with no compiler, resolves the binary at `require` time even under
`npm ci --ignore-scripts` (which the Dockerfile's production stage uses), and
being N-API it does not need rebuilding across Node versions.

### Still true

1. **Scale horizontally** for capacity. CPU is what more instances buy, and
   ~4 logins/second/core is still the number per core.
2. **Do not lower the cost factor** to make a graph look better. 12 is a
   security decision; trading it for throughput should be a deliberate,
   separate conversation. For reference, both sibling teams hash at cost 10 —
   a quarter of the work per attempt.

### A separate problem the same investigation found

bcrypt reads at most **72 bytes** of a password and discards the rest without
error. Registration had no maximum, so a longer password was accepted and then
authenticated on its first 72 bytes alone — verified against this codebase: a
92-character password matched both its own 72-byte prefix and a completely
different 20-character tail.

This is a property of the algorithm, not of either library — the native binding
truncates identically — so the move above did not fix it. It is now capped at
the validation layer, in **bytes rather than characters**: 40 Arabic letters are
under any character limit and over 72 bytes, which is exactly the case a
`.max(72)` on string length would wave through.

The cap covers **every** path, login included. Leaving login open is the usual
choice, because rejecting a long password there would lock out an account
created before the rule existed. That trade-off does not apply here: there is no
production data, the accounts were rebuilt under the new rules, and every path
that sets a password now enforces the limit — so a stored password longer than
72 bytes cannot exist, and refusing one at the door costs nobody an account.
Login keeps a minimum of 1 character rather than 8: restating the registration
policy there would tell an attacker which candidates are not worth trying.

### Why the plans were then redesigned

Because of the above, a plan that logs in first measures bcrypt and reveals
nothing about the cart or the order path. The final plans issue each virtual
user a signed access token from the seed and send it as `Authorization: Bearer`,
so the 500 concurrent users exercise **the endpoints under test**. Real users
log in once and then order repeatedly; the redesigned plans model that, and
login capacity is reported separately above.

---

## Finding 2 — The connection pool, and where its cliff actually is

Chasing Finding 1 surfaced a genuine misconfiguration:
[`config/prisma.ts`](../src/config/prisma.ts) hard-coded `max: 10` with a
5-second acquisition timeout. Ten concurrent database operations is a low
ceiling for an API, and every request past it waits and then fails with a 500.

It is now `DATABASE_POOL_MAX`, defaulting to **20**, with the constraint written
down: `instances × DATABASE_POOL_MAX` must stay below the server's
`max_connections` (100 by default).

At the time, raising it from 10 to 20 produced **no measurable improvement**,
because bcrypt was saturating the process long before the pool mattered. The
default stood on reasoning rather than evidence, and this is the measurement
that was owed.

### Swept, now that login is off the critical path (2026-08-10)

Plan 1, 500 customers, 10-second ramp-up. One variable: the seed is re-run and
the server restarted for every size, so each faces identical data.

| `DATABASE_POOL_MAX` | ok %     | req/s | place-order p95 | p99    | pool timeouts |
| ------------------- | -------- | ----- | --------------- | ------ | ------------- |
| 5                   | 30.3%    | 44.9  | 5 192 ms        | —      | 732           |
| 6                   | 30.7%    | 44.9  | 5 221 ms        | —      | 705           |
| 8                   | 31.6%    | 45.0  | 5 294 ms        | —      | 735           |
| **10**              | **100%** | 102.2 | **102 ms**      | 209 ms | **0**         |
| 12                  | 100%     | 102.2 | 120 ms          | 236 ms | 0             |
| 16                  | 100%     | 102.2 | 180 ms          | 378 ms | 0             |
| 20 (current)        | 100%     | 102.3 | 193 ms          | 339 ms | 0             |
| 40                  | 100%     | 102.2 | 337 ms          | 632 ms | 0             |
| 80                  | 100%     | 102.3 | 329 ms          | 710 ms | 0             |

Three things fall out of it, and the middle one was a surprise.

**1. There is a cliff between 8 and 10, and it is nearly binary.** Not a
gradual slope: 8 connections serve 31% of requests, 10 serve 100%. Everything
below the cliff behaves identically to everything else below it — same
throughput, same duration, same failure count.

The obvious explanation is wrong, which is worth recording. Little's Law on the
healthy run gives `102 req/s × 22.3 ms ≈ 2.3` connections — the app needs about
two to keep up on average, nowhere near nine. So this is not average capacity.
The likeliest reading is congestion collapse: once a burst outruns the pool,
every waiting request occupies a queue slot for the full 5-second
`connectionTimeoutMillis` before giving up, so the pool stops turning over fast
enough to drain the backlog and the run never recovers. That is a hypothesis
about the mechanism; the cliff itself is measured.

**2. Above 10, a bigger pool is not free — it makes the tail worse.** Throughput
is identical from 10 upward (the plan's 10-second ramp-up sets the pace at ~100
req/s), but place-order p95 rises steadily: 102 ms at 10, 193 ms at 20, 329 ms
at 80. Reproduced across two independent sweeps. More concurrent connections
means more contention inside PostgreSQL, and every query pays for it.

**3. The default stays at 20 — now for a measured reason.** 10 is enough and has
the best latency, but it sits directly on the edge of a cliff whose far side is
a 31% success rate. 20 buys a 2× margin over the measured cliff for about 90 ms
of p95, which is the right trade for a default. Going past 20 buys nothing at
all, so the guidance is a range: **do not go below 12, and do not bother going
above 20.**

This also closes Finding 1 from the other direction. The original run blamed
`max: 10` for 499 pool timeouts; the same pool size now serves the same order
flow with zero. The pool was never the problem — the blocked event loop was, and
it could not run the callbacks that hand connections back.

---

## Finding 3 — The dashboard reports, and why they have no cliff

The sweep above covers cart and checkout only, so the range it produced was not
safe to assume for the reports: `dashboard/overview` fans out to **13 queries in
parallel** (11 when this was first measured), and on paper two concurrent admins
would ask for 26 connections against a pool of 20. `perf/plans/04-dashboard.jmx` (`npm run perf:dashboard`)
exists to settle that. It needs history to be meaningful, so
`npm run perf:seed-dashboard` bulk-loads **50 000 orders and transactions across
90 days** on top of the usual seed.

**The worry was unfounded, and the reason is worth keeping.** Thirteen queries
in parallel is not thirteen connections held: each acquires a connection, runs
for a millisecond or two, and releases it. They queue _through_ the pool rather
than occupying it. Measured at 50 concurrent admins:

| `DATABASE_POOL_MAX` | req/s     | overview p50 | restaurant p50 | ok % | pool timeouts |
| ------------------- | --------- | ------------ | -------------- | ---- | ------------- |
| 5                   | 114.2     | 327 ms       | 540 ms         | 100% | 0             |
| 10                  | 152.3     | 244 ms       | 371 ms         | 100% | 0             |
| **12**              | **156.9** | 244 ms       | 356 ms         | 100% | 0             |
| 20                  | 156.4     | 237 ms       | 367 ms         | 100% | 0             |
| 40                  | 151.5     | 252 ms       | 377 ms         | 100% | 0             |

**The 12–20 range transfers.** Below it costs throughput — a pool of 5 gives up
27% — and above it gives nothing back, the same shape as the checkout sweep.

**But there is no cliff here, and that is the interesting part.** A pool of 5
took checkout down to a 31% success rate; the same pool serves every report
successfully, just 27% slower. The difference is how long a connection is held.
Checkout runs an _interactive transaction_ — one connection held for the whole
request, with Prisma's own 2-second `maxWait` on top — so once demand outruns
the pool, waiters pile up and the pool stops turning over. The reports hold
nothing across await points, so they simply queue. **Short queries degrade;
held transactions collapse.**

### Scaling, and the cold-start trap

| Concurrent admins | req/s | overview p50 | ok % |
| ----------------- | ----- | ------------ | ---- |
| 5                 | 70.6  | 17 ms        | 100% |
| 20                | 144.6 | 75 ms        | 100% |
| 50                | 156.7 | 240 ms       | 100% |
| 100               | 160.9 | 500 ms       | 100% |

Throughput plateaus around **160 req/s** and latency then grows linearly with
concurrency — a saturated server queueing politely, with no errors at any point.
For a back-office dashboard that is comfortable: 100 simultaneous admins is far
beyond what this system will see.

**Measure warm.** The first `overview` after a restart took **307 ms**; warm it
is **17 ms**. That is PostgreSQL planning and cache, not the application, but it
is a real cost paid once per deployment — and it is an easy way to publish a
number that is 18× too pessimistic.

### Re-measured when the daily counters were added

The official `Daily / Monthly Cancelled Orders` and
`Daily Orders not Delivered Count` counters took `overview` from 11 parallel
queries to 13, and the per-restaurant report from 5 to 10 — so the finding above
was re-run rather than assumed to still hold. Same machine, same 50 000-order
seed, same plan, 50 concurrent admins, pool 20, warmed first; only the commit
differs:

| Endpoint           | before p50 | after p50 | before p95 | after p95 |
| ------------------ | ---------- | --------- | ---------- | --------- |
| Overview           | 33 ms      | 32 ms     | 49 ms      | 49 ms     |
| Transaction report | 21 ms      | 21 ms     | 33 ms      | 32 ms     |
| Restaurant report  | 68 ms      | 67 ms     | 89 ms      | 90 ms     |

100% ok on both runs, ~141 req/s. **Doubling the per-restaurant report's query
count cost nothing measurable**, which is the same mechanism this finding
started with: short queries queue through the pool instead of holding it.

Two caveats on these numbers, so nobody reads them as a contradiction of the
table above. They are **not** comparable to the 244 ms / 356 ms figures there —
that run sustained 50 concurrent admins, while this one finishes in 5.3 s with a
5 s ramp-up, so real concurrency never builds. They are only good for the
before/after comparison they were run for.

### What is still not covered

The reports are uncached and recomputed per request, which is fine at 160 req/s
and 50 000 transactions. Neither this nor the sweep above says anything about
the same reports over years of data, where the `date_trunc` scan grows without
an index to help it.

---

## Finding 4 — Switching the rate limiter on

Every measurement above runs with `NODE_ENV=test`, which skips the limiter
entirely. That is what makes the numbers meaningful, but it also meant the
limiter had never executed — not in a test, not in a load run, nowhere.

Turning it on found two things, and only one of them was the limiter.

### The limiter itself is correct

Twenty-five logins from one address against a real server:

```
200 x20, then 429 x5
RateLimit-Policy: 20;w=900
RateLimit: limit=20, remaining=0, reset=895
Retry-After: 895
{"success":false,"message":"Too many authentication attempts. Please try again later."}
```

Exactly the configured budget, the standard draft-7 headers, a `Retry-After` a
client can obey, and the same error envelope as the rest of the API.
`tests/middleware/rateLimit.unit.test.ts` now covers this by stubbing the
environment to production, since the suite's own `NODE_ENV=test` would
otherwise skip it.

### But it could not tell customers apart

The limiter keys on `req.ip`, and nothing set `trust proxy`. Behind any reverse
proxy — nginx, a cloud load balancer, anything — `req.ip` is the _proxy's_
address for every request, so all customers share one bucket. Measured: twenty
different client addresses exhaust the auth limit, and the twenty-first
unrelated customer is refused.

In other words, deployed behind a load balancer this was not a per-customer
limit but **a global cap of 20 logins per 15 minutes for the entire service** —
a protection that becomes the outage.

The fix is `TRUST_PROXY`, defaulting to **0** (directly exposed). It is a hop
count rather than a boolean on purpose: trusting blindly is the opposite
failure, letting a client prepend its own `X-Forwarded-For` and mint a fresh
bucket per request. Set it to the number of proxies actually in front.

### And a 500 that had nothing to do with rate limiting

Driving 20 logins at **one account** returned `200, 500, 500, 200, 500, 500,
500, …` — 14 of 20 failed. The limiter was working; the login was not.

`RefreshToken.tokenHash` is unique, and a refresh JWT's only varying claim was
`iat`, which has one-second resolution. Two logins in the same second therefore
produced byte-identical tokens, identical hashes, and a unique-constraint
violation surfaced as a 500. A customer double-clicking Sign in was enough.

Fixed by giving the refresh token a random `jti`. The same 25 requests now
return `200 x20, 429 x5, zero 500s`.

Worth noting where this came from: the 500-concurrent login plan never caught
it, because every virtual user is a different account by design. It took the
opposite shape of test — one account, many attempts — which is exactly the
shape a rate-limit test has.

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
