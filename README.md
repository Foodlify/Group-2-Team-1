# Group-2-Team-1

[![CI](https://github.com/Foodlify/Group-2-Team-1/actions/workflows/ci.yml/badge.svg)](https://github.com/Foodlify/Group-2-Team-1/actions/workflows/ci.yml)

A Node.js + Express 5 + TypeScript backend using Prisma 7 with PostgreSQL,
featuring OpenAPI 3.1 documentation via Scalar and Swagger UI.

## Tech Stack

- **Runtime:** Node.js 25.8.1
- **Framework:** Express 5
- **Language:** TypeScript 6
- **ORM:** Prisma 7 (with `@prisma/adapter-pg`)
- **Database:** PostgreSQL 17
- **Validation:** Zod 4
- **API Docs:** OpenAPI 3.1 via Scalar + Swagger UI
- **Auth:** JWT (`jsonwebtoken`)

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Database Setup](#database-setup)
- [Running the App](#running-the-app)
- [API Documentation](#api-documentation)
- [Architecture](#architecture)
- [Soft Delete & Auditing](#soft-delete--auditing)
- [Testing](#testing)
- [Load Testing](#load-testing)
- [Payments](#payments)
- [Email](#email)
- [Dashboard & Reports](#dashboard--reports)
- [Adding a New Feature](#adding-a-new-feature)
- [Continuous Integration](#continuous-integration)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, make sure you have:

| Tool               | Version  | Required | Notes                                      |
| ------------------ | -------- | -------- | ------------------------------------------ |
| **Node.js**        | `25.8.1` | Yes      | Use `nvm` to match the version in `.nvmrc` |
| **Git**            | any      | Yes      | For cloning                                |
| **Docker Desktop** | latest   | Optional | Only if using Option A (recommended)       |
| **PostgreSQL**     | `17.x`   | Optional | Only if using Option B                     |

### Installing Node.js with nvm

**Windows (nvm-windows):**

```powershell
# Install nvm-windows from: https://github.com/coreybutler/nvm-windows
nvm install 25.8.1
nvm use 25.8.1
```

**macOS / Linux (nvm):**

```bash
# Install nvm from: https://github.com/nvm-sh/nvm
nvm install 25.8.1
nvm use 25.8.1
```

If you're in the project directory, `nvm use` alone will read `.nvmrc`.

---

## Setup

### Step 1 — Clone the repository

```bash
git clone <repository-url>
cd Group-2-Team-1
```

### Step 2 — Install dependencies

```bash
npm install
```

This will automatically run `prisma generate` afterwards to create the Prisma Client in
`src/generated/prisma/`. If for any reason the client isn't generated (e.g., schema errors),
you can run it manually:

```bash
npm run db:generate
```

> **Why this matters:** The Prisma Client is generated code that's specific to your schema.
> It's not committed to git (too large and changes per schema). Every machine must generate
> its own copy.

### Step 3 — Configure environment variables

Copy the example file:

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux:**

```bash
cp .env.example .env
```

Open `.env` and adjust values as needed. Defaults work for local development:

```env
PORT=4444
NODE_ENV=development
JWT_SECRET=<generate-a-random-string>

POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=G2T1M
POSTGRES_PORT=5432

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/G2T1M

# Optional auth/CORS overrides (sensible defaults applied) — see .env.example
# JWT_ACCESS_EXPIRES=15m
# JWT_REFRESH_EXPIRES=7d
# CORS_ORIGIN=http://localhost:3000
```

> **Generate a JWT secret:**
>
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## Database Setup

Choose **one** of the following options.

### Option A — Docker (recommended)

**Requirements:** Docker Desktop installed and running.

1. Start the PostgreSQL container:

   ```bash
   docker compose up -d
   ```

2. Verify the container is healthy (wait ~10 seconds first):

   ```bash
   docker compose ps
   ```

   Expected output should show `STATUS: Up X seconds (healthy)`.

3. Apply database migrations:

   ```bash
   npm run db:migrate
   ```

   When prompted for a migration name, press Enter to accept the default.

4. **(Optional, for development) Seed test data**:

   The project includes a seed script that creates a test user, a restaurant, a menu, and 3 menu items for local development.

   ```bash
   npx prisma db seed
   ```

   The seed creates ready-to-use accounts (printed in the output):
   - **Customer:** `test@example.com` / `Password123!`
   - **Admin:** `admin@example.com` / `Admin123!`

   > **Note:** Auth is implemented — log in via `POST /api/v1/auth/login` (customer) or
   > `POST /api/v1/auth/admin/login` (admin); tokens are returned as httpOnly cookies.

5. (Optional) Open Prisma Studio to inspect your tables:
   ```bash
   npm run db:studio
   ```

**Common Docker commands:**

```bash
docker compose up -d             # Start the database
docker compose stop              # Stop (keeps data)
docker compose down              # Stop and remove container (keeps data volume)
docker compose down -v           # Stop and wipe all data
docker compose logs -f postgres  # View database logs
```

---

### Option B — Local PostgreSQL

**Requirements:** PostgreSQL 17 installed on your machine.

1. Install PostgreSQL:
   - **Windows / macOS:** Download from [postgresql.org/download](https://www.postgresql.org/download/)
   - **Ubuntu / Debian:**
     ```bash
     sudo apt update
     sudo apt install postgresql-17 postgresql-contrib
     sudo systemctl start postgresql
     ```

2. Create the database and user:

   ```bash
   # Connect as the default superuser
   sudo -u postgres psql     # Linux
   psql -U postgres          # Windows / macOS
   ```

   Then run:

   ```sql
   CREATE DATABASE "G2T1M";
   -- The default 'postgres' user usually already exists with password 'postgres'.
   -- If not, set one:
   ALTER USER postgres WITH PASSWORD 'postgres';
   \q
   ```

3. Update `.env` if your credentials differ:

   ```env
   DATABASE_URL=postgresql://<user>:<password>@localhost:5432/G2T1M
   ```

4. Apply migrations:

   ```bash
   npm run db:migrate
   ```

5. **(Optional, for development) Seed test data**:

   The project includes a seed script that creates a test user, a restaurant, a menu, and 3 menu items for local development.

   ```bash
   npx prisma db seed
   ```

   The seed creates ready-to-use accounts (printed in the output):
   - **Customer:** `test@example.com` / `Password123!`
   - **Admin:** `admin@example.com` / `Admin123!`

   > **Note:** Auth is implemented — log in via `POST /api/v1/auth/login` (customer) or
   > `POST /api/v1/auth/admin/login` (admin); tokens are returned as httpOnly cookies.

---

## Running the App

### Development mode (with hot reload)

```bash
npm run dev
```

### Production mode

```bash
npm start
```

The server will start on the port defined in `.env` (`PORT=4444` by default).

### Verify it works

Open a browser or run:

```bash
curl http://localhost:4444/health
```

Expected response:

```json
{
  "status": "OK",
  "database": "connected",
  "timestamp": "2026-04-21T..."
}
```

If you see `"status": "DEGRADED"` or the server won't start, see
[`docs/troubleshooting.md`](docs/troubleshooting.md).

---

## API Documentation

The API ships with two documentation UIs, both generated from the same OpenAPI 3.1 spec.

### Available endpoints

| URL                     | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `GET /api-docs`         | **Scalar UI** — modern 3-column layout (recommended) |
| `GET /api-docs/swagger` | **Swagger UI** — classic interface                   |
| `GET /openapi.json`     | Raw OpenAPI 3.1 spec as JSON                         |
| `GET /health`           | Liveness + DB connectivity check                     |

**Available features:** Authentication (customer + admin), user management, catalog browsing (restaurants/menus/items), cart, and orders are live. Visit `/api-docs` to explore them interactively with full request/response schemas.

### How documentation is generated

The OpenAPI spec is built at server startup from:

- **Route definitions** contributed by each module's `routes.ts` file via `routeRegistry`
- **Reusable component schemas** (error responses, pagination) registered in
  `src/shared/schemas/` via `schemaRegistry`
- **Security scheme** (`BearerAuth` / JWT) defined centrally in `src/openapi/document.ts`

No manual YAML writing — all documentation comes from Zod schemas inline with your code,
and types, validation, and docs stay in sync automatically.

### Adding a shared schema

Shared schemas live under `src/shared/schemas/`. To add a new one:

```typescript
// src/shared/schemas/example.schema.ts
import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";

export const ExampleSchema = z
  .object({
    field: z.string().meta({ description: "A field", example: "hello" }),
  })
  .meta({
    id: "Example", // becomes `components.schemas.Example`
    description: "Example schema",
  });

schemaRegistry.register("Example", ExampleSchema);

export type Example = z.infer<typeof ExampleSchema>;
```

Then add a side-effect import to `src/openapi/document.ts`:

```typescript
import "../shared/schemas/example.schema";
```

Restart the server — the schema appears in `/openapi.json` under `components.schemas`.

---

## Architecture

The project follows a **layered modular architecture** where each entity owns a folder
under `src/modules/` containing all files related to that entity.

### Layers (outside-in)

```
┌─────────────────────────────────────────────────────────┐
│                  HTTP Layer                             │
│  routes.ts  →  controller.ts  →  validation.ts (Zod)    │
│                      ↓                                  │
└──────────────────────┼──────────────────────────────────┘
                       ↓
┌──────────────────────┼──────────────────────────────────┐
│                  Business Layer                         │
│                  service.ts                             │
│                      ↓                                  │
└──────────────────────┼──────────────────────────────────┘
                       ↓
┌──────────────────────┼──────────────────────────────────┐
│                  Data Layer                             │
│       repository.ts extends BaseRepository              │
│                      ↓                                  │
│                  Prisma Client → PostgreSQL             │
└─────────────────────────────────────────────────────────┘
```

### What lives where

| Layer          | Responsibility                                                | Example                                                           |
| -------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Routes**     | Define HTTP paths, attach middlewares                         | `router.post("/carts", validate(CreateCart), controller.create)`  |
| **Validation** | Zod schemas for request body/query/params and response shapes | `CreateCartRequestSchema`, `CartResponseSchema`                   |
| **Controller** | Parse request → call service → format response                | `const cart = await cartService.create(req.body); res.json(cart)` |
| **Service**    | Business logic, orchestration, authorization                  | `if (!user.canCreateCart) throw new AppError(...)`                |
| **Repository** | Database CRUD, thin wrapper on Prisma                         | `return this.findUnique({ where: { userId } })`                   |
| **Model**      | Entity-specific type aliases (only if needed)                 | `type CartWithItems = Cart & { items: CartItem[] }`               |

### The modules

17 module folders under `src/modules/`, each owning one slice of the domain:

```
address/     cartItem/    menuItem/       order/       otp/                rating/       support/
cart/        customer/    notification/   orderItem/   payment/            restaurant/   transaction/
             menu/                                     preferredPayment/                 user/
```

A fully built module has six files — `.model.ts`, `.repository.ts`, `.service.ts`,
`.controller.ts`, `.routes.ts`, `.validation.ts` — plus the occasional helper
(`order.status.ts`). See [Module Anatomy](docs/ARCHITECTURE.md) for what each does.

> **Not one folder per table.** The official mindmap lists 23 entities; the schema has
> 18 tables and the code has 17 modules. Lookup tables (`orderStatus`, `role`,
> `userType`, `transactionStatus`, …) became Postgres enums, and `orderTracking` became
> the `timeline` JSON column on `Order`. The mapping is spelled out in
> [ARCHITECTURE.md § 9](docs/ARCHITECTURE.md).

**Database ERD:** [docs/ERD.md](docs/ERD.md) — every table, every relationship, and the
delete behaviour (Cascade / Restrict / SetNull) that a diagram alone can't show.

### BaseRepository

All repositories extend a generic, fully type-safe `BaseRepository<TDelegate>` at
`src/shared/repositories/base.repository.ts`. It provides:

- `findUnique`, `findMany`, `findFirst`, `count`
- `create`, `update`, `delete`, `upsert`
- `findPaginated({ page, limit, where?, include?, orderBy? })`

The base class is generic over a Prisma delegate (e.g., `PrismaClient["user"]`), so
every method returns correctly typed results with full IDE autocomplete — no `any`
and no manual type assertions needed **in repositories (the subclasses)**. The base
class itself uses a few localized `as unknown as` casts internally to call across the
generic delegate; these are a deliberate implementation detail and never leak past it.

**Entity-specific queries** (beyond basic CRUD) belong in the individual repository
classes. For example, `CartRepository.findByUserId(userId)` or more complex joins that
warrant a dedicated method.

---

## Soft Delete & Auditing

### Why

`Restaurant`, `Menu` and `MenuItem` carry `isDeleted Boolean @default(false)`. Deleting
one of them flips the flag instead of removing the row.

The problem this solves is concrete: `MenuItem` is referenced by `OrderItems` with
`onDelete: Restrict`, so **any item that had ever been ordered could not be deleted at
all** — the request came back 409 and the item stayed on the menu forever. Now it
disappears from the catalog while the order history keeps resolving.

The three catalog tables are the same ones Group-1-Team-2 flagged, using the same
column name.

### The rule that keeps it correct

**Every read filters `isDeleted: false` in the repository.** Not in the service, not in
the controller — one layer, so there is exactly one place to check. `findUnique` cannot
express the filter (its `where` only takes unique fields), which is why the lookups use
`findFirst`; dropping back to `findUnique` silently resurrects deleted rows.

Three consequences worth knowing:

| Where                              | What happens                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `menuItem.repository.reserveStock` | Filters on the flag, so an item pulled from the menu can't be sold out of an existing cart |
| `menuItem.repository.releaseStock` | Deliberately does **not** filter — cancelling an order returns its units either way        |
| `rating.repository.topRated…`      | Excludes deleted restaurants **inside** the `groupBy`, not after, or `take` returns short  |

Deleting cascades down (restaurant → menus → items) in a single transaction. Without
the cascade a deleted restaurant's items would keep surfacing in the catalog-wide
search, which filters on the item's own flag.

### Restore

| Endpoint                                 | Notes                                        |
| ---------------------------------------- | -------------------------------------------- |
| `PATCH /api/v1/restaurants/{id}/restore` | Brings the whole catalog back with it        |
| `PATCH /api/v1/menus/{id}/restore`       | Fails 409 if the restaurant is still deleted |
| `PATCH /api/v1/menu-items/{id}/restore`  | Fails 409 if the menu is still deleted       |

To find a deleted id, pass `?includeDeleted=true` to `GET /restaurants`,
`GET /restaurants/{id}/menus` or `GET /menus/{id}/items`. Those routes use
`optionalAuthenticate`: they stay public, but the flag is honoured **only** for an ADMIN
token and silently ignored otherwise.

**One asymmetry to know about:** restore cascades the same way delete does, and the flag
doesn't record which delete set it. So an item you deleted on its own _before_ deleting
its restaurant comes back when you restore the restaurant. Delete it again afterwards.

### Auditing columns

The same three tables carry `createdBy` / `updatedBy` (the id of the `User` behind the
write), and `MenuChangeLog` carries `changedBy`. All nullable — rows that predate
auditing have no actor, and inventing one would be worse than admitting we don't know.
A soft delete writes `updatedBy`, so "who deleted this" is answerable without a separate
`deletedBy` column.

`createdBy` / `updatedBy` are **not** returned by the API: the catalog endpoints are
public and the columns hold internal admin ids. The audit trail is read through
`GET /api/v1/menus/{menuId}/history` (ADMIN), which reports `changedBy` per entry and
covers `CREATED` / `UPDATED` / `DELETED` / `RESTORED`.

---

## Testing

Two suites, deliberately separate.

| Suite           | Command                    | Needs a database |
| --------------- | -------------------------- | ---------------- |
| **Unit**        | `npm test`                 | No               |
| **Integration** | `npm run test:integration` | Yes              |

`npm test` runs with **no external service at all** — no PostgreSQL, no Redis,
no SMTP. That is a property worth protecting: it is why a new contributor can
clone the repo and get a green suite before configuring anything. Integration
tests live in `tests/integration/` and are excluded from that config.

### What belongs where

Anything a mock can answer is a unit test. Integration tests are for the
things mocks structurally _cannot_ reach:

- **Real concurrency.** Two checkouts racing for the last unit in stock. A
  read-then-write reservation passes every unit test and still oversells —
  the integration suite catches it selling one unit to two customers.
- **Constraints written in SQL.** The two CHECK constraints added by hand to
  migrations (a cart has exactly one owner; stock is never negative), the
  unique indexes the services lean on instead of a racy pre-check, and the
  `Cascade` / `Restrict` / `SetNull` referential actions.
- **Raw SQL.** `appendTimelineEntry` appends to a `jsonb` column and mirrors
  the status in one statement; there is no way to unit-test that.
- **`Decimal` round-tripping.** That money survives the trip out to a
  `Decimal` column and back.
- **The migrations themselves.** `globalSetup` runs `prisma migrate deploy`,
  so a broken migration fails the suite.
- **The HTTP layer.** Routing, `validate`, `authenticate` / `authorize`, the
  body parsers, the 404 handler, the error middleware and the security headers
  only exist on a real request. Supertest drives the real Express app in
  `http.auth.*` and `http.contract.*`; a service test calls past all of them.

### Running the integration suite

Copy [`.env.test.example`](.env.test.example) to `.env.test` and point
`DATABASE_URL_TEST` at a database whose name contains `test` — the suite
refuses to start otherwise, because it truncates every table between tests.
The example file lists three ways to get one, including a throwaway `initdb`
instance if you have no server running.

```bash
npm run test:integration
```

### A convention worth keeping

Every assertion in these suites was checked against a **deliberately broken
copy of the code** before being committed — the atomic stock UPDATE swapped
for a read-then-write, the `tx` dropped from `clearCart`, the `Decimal`
subtotal reverted to float multiplication. A test that passes either way is
worse than no test, because it advertises safety it doesn't provide. One
assertion was vacuous on the first attempt and only revealed it this way.

---

## Load Testing

Two Apache JMeter plans in [`perf/`](perf), driving 500 concurrent customers
through 1000 requests each. Full write-up with all measurements:
**[docs/LOAD_TESTING.md](docs/LOAD_TESTING.md)**.

| Plan                     | What it measures                  | Result                               |
| ------------------------ | --------------------------------- | ------------------------------------ |
| `01-baseline-order-flow` | Add to cart + checkout under load | 1000/1000 ok, p95 249 ms, ~102 req/s |
| `02-stock-contention`    | 500 customers racing for 50 units | exactly 50 sold, 450 × 409, 0 × 5xx  |

```bash
npm run perf:seed     # 500 customers + their access tokens
npm run perf:plan1
npm run perf:plan2
```

Two findings came out of it. The pool in `config/prisma.ts` was capped at 10
connections and is now `DATABASE_POOL_MAX` (default 20). And **login was the
system's ceiling**: at 500 concurrent logins the success rate was 23.6% with a
35-second p50, because `bcryptjs` is pure JavaScript and hashes _on the event
loop_ — while it worked, the process served nobody.

Fixed by moving to the native `bcrypt` binding, which hashes in libuv's thread
pool. Ten concurrent compares went from 2443 ms to 657 ms, and the **event-loop
stall from 1000 ms to 6 ms**. A login still costs the same ~250 ms of CPU —
roughly 4 logins per second per core is still the capacity number, and scaling
that is horizontal — but it no longer freezes every other request. Stored
passwords were unaffected: both libraries emit `$2b$` hashes and read each
other's, which a committed fixture now pins.

The same investigation found that bcrypt silently ignores everything past
**72 bytes** of a password, so registration now caps there — in bytes, not
characters. Details of both in the document.

Two things the plans depend on, both explained there: they run with
`NODE_ENV=test` so the rate limiter doesn't turn 480 of 500 customers into
`429`s, and virtual users arrive pre-authenticated so the plans measure the
order path instead of bcrypt.

---

## Payments

Two methods behind one strategy interface. Full write-up:
**[docs/PAYMENTS.md](docs/PAYMENTS.md)**.

| Method        | Gateway | Settles when                          | Available                      |
| ------------- | ------- | ------------------------------------- | ------------------------------ |
| `CASH`        | none    | order reaches `DELIVERED`             | always                         |
| `CREDIT_CARD` | Stripe  | Stripe's webhook confirms the payment | only when Stripe is configured |

Placing a card order returns a `paymentUrl` — Stripe's hosted checkout page, so
no card data ever reaches this server. The order stays `PENDING` until
`POST /api/v1/payments/stripe/webhook` receives `checkout.session.completed`;
the customer's browser reaching the success page confirms nothing. An unpaid
session expiring cancels the order and releases the stock it was holding.

```bash
STRIPE_SECRET_KEY=sk_test_...      # unset ⇒ CREDIT_CARD is not offered at all
STRIPE_WEBHOOK_SECRET=whsec_...    # required alongside it, or the app won't boot
```

Three things worth knowing before touching this code, each explained in the
document: the gateway call runs **after** the checkout transaction commits (an
HTTPS round-trip inside it would hold the cart's row lock and a pooled
connection); stock is reserved at checkout rather than at payment; and every
webhook handler is idempotent, because Stripe redelivers events for three days.

Cancelling a paid card order **refunds it through Stripe**. The `REFUND` ledger
row starts `PENDING` and only becomes `SUCCESS` when the gateway confirms, so
the ledger never claims money moved before it did. A refund that fails does not
fail the cancellation — it is recorded as `FAILED` with its reason, because that
row is money still owed and someone has to see it.

Two ADMIN endpoints chase those: `GET /api/v1/payments/refunds/outstanding`
lists what has not reached the customer, and
`POST /api/v1/payments/refunds/{id}/retry` sends one again. **Retrying cannot
double-refund** — the gateway is asked what it already holds for that ledger row
before anything is created, because Stripe's idempotency keys expire after 24
hours and a retry is always later than that.

> Verified end-to-end against a live Stripe test account on 2026-08-09 — real
> Checkout Sessions, real card payments, real refunds confirmed against Stripe's
> own records, plus replayed events, an expired session releasing its stock, and
> the failed-refund path. See `docs/PAYMENTS.md`.

---

## Email

Verification codes and order notifications go out over SMTP. Full write-up:
**[docs/EMAIL.md](docs/EMAIL.md)**.

| Message             | Sent when                    | If it fails           |
| ------------------- | ---------------------------- | --------------------- |
| Verification code   | registration, password reset | request fails (`503`) |
| Order confirmation  | checkout commits             | logged, order stands  |
| Order status change | any transition, incl. cancel | logged, change stands |

With `SMTP_HOST` unset the mailer logs messages instead of sending them, so the
suite and a fresh clone work with no credentials; in production it refuses
rather than silently swallowing a verification code.

> Verified end-to-end against a real mailbox on 2026-08-09 — a registration code
> that arrived and verified the account, an order confirmation with the right
> items and total, and the unreachable-server path (orders still placed, reason
> logged, `503` instead of `500`).

> **A personal Gmail account is not a production email channel.** Gmail answered
> `250 OK` and then silently discarded a large share of a test burst — nothing
> in spam or trash, and nothing the application can detect. Use a transactional
> provider on a verified domain for real traffic; see `docs/EMAIL.md`.

---

## Dashboard & Reports

The seventh official module — three ADMIN-only read endpoints, no new tables.
Full write-up: **[docs/DASHBOARD.md](docs/DASHBOARD.md)**.

| Endpoint                                 | Answers                                          |
| ---------------------------------------- | ------------------------------------------------ |
| `GET /api/v1/dashboard/overview`         | Restaurant / customer / order counters + revenue |
| `GET /api/v1/dashboard/transactions`     | Daily or monthly money over a window             |
| `GET /api/v1/dashboard/restaurants/{id}` | The same, scoped to one restaurant               |

Four rules decide whether these numbers are true, each explained in the
document: **refunds are subtracted, never added** (the ledger stores what moved,
not which direction); **only `SUCCESS` counts** (a pending payment is a checkout
page, not money); **money is summed in SQL as `Decimal`** (three payments of
`19.99` less a `19.99` refund returns `39.98`, where floats give
`39.980000000000004`); and **soft-deleted restaurants are excluded**.

> Buckets and the "today"/"this month" counters are **UTC** — `createdAt` has no
> stored time zone. The response says so explicitly. For Cairo that means a day
> starts at 02:00/03:00 local; the trade-off is recorded in `todo.md`.

---

## Adding a New Feature

Features are developed in isolation on their own branches. This keeps the setup branch
stable and lets features merge independently.

### Step-by-step workflow

1. **Branch off main:**

   ```bash
   git checkout main
   git pull
   git checkout -b feat/cart-management
   ```

2. **Write Zod schemas** for the feature in the relevant module's `validation.ts`:

   ```typescript
   // src/modules/cart/cart.validation.ts
   import { z } from "zod";
   import { schemaRegistry } from "../../openapi/registry";

   export const AddToCartRequestSchema = z
     .object({
       menuItemId: z.string().cuid(),
       quantity: z.number().int().positive(),
     })
     .meta({ id: "AddToCartRequest" });

   schemaRegistry.register("AddToCartRequest", AddToCartRequestSchema);

   export type AddToCartInput = z.infer<typeof AddToCartRequestSchema>;
   ```

3. **Implement the service** in `service.ts`:

   ```typescript
   // src/modules/cart/cart.service.ts
   import { cartRepository } from "./cart.repository";
   import { cartItemRepository } from "../cartItem/cartItem.repository";

   class CartService {
     async addItem(userId: string, input: AddToCartInput) {
       const cart =
         (await cartRepository.findUnique({ where: { userId } })) ??
         (await cartRepository.create({ data: { userId } }));
       return cartItemRepository.create({
         data: { cartId: cart.id, ...input },
       });
     }
   }

   export const cartService = new CartService();
   ```

4. **Write the controller** in `controller.ts`:

   ```typescript
   // src/modules/cart/cart.controller.ts
   import { asyncHandler } from "../../utils/asyncHandler";
   import { cartService } from "./cart.service";

   export const addItem = asyncHandler(async (req, res) => {
     const item = await cartService.addItem(req.user!.id, req.body);
     res.status(201).json({ success: true, data: item });
   });
   ```

5. **Register routes** in `routes.ts` and contribute to the OpenAPI registry:

   ```typescript
   // src/modules/cart/cart.routes.ts
   import { Router } from "express";
   import { routeRegistry } from "../../openapi/registry";
   import { validate } from "../../middlewares/validate.middleware";
   import { authenticate } from "../../middlewares/auth.middleware";
   import * as controller from "./cart.controller";
   import { AddToCartRequestSchema } from "./cart.validation";

   const router = Router();

   // Auth middleware reads the httpOnly access-token cookie (Bearer header as a
   // fallback). Mount it per-route or once for the whole router via router.use.
   router.post(
     "/",
     authenticate,
     validate({ body: AddToCartRequestSchema }),
     controller.addItem,
   );

   // Document the route for OpenAPI
   routeRegistry.push({
     path: "/api/v1/carts",
     pathItem: {
       post: {
         tags: ["Cart"],
         security: [{ cookieAuth: [] }, { BearerAuth: [] }],
         requestBody: {
           content: { "application/json": { schema: AddToCartRequestSchema } },
         },
         responses: {
           /* ... */
         },
       },
     },
   });

   export default router;
   ```

6. **Wire up in the main router** (`src/routes/index.ts`):

   ```typescript
   import cartRouter from "../modules/cart/cart.routes";
   router.use("/carts", cartRouter);
   ```

7. **Test, commit, push, PR → main.**

---

## Continuous Integration

Every push and pull request targeting `main` or `develop` runs
[`.github/workflows/ci.yml`](.github/workflows/ci.yml), in two parallel jobs.

**`verify`** — the same checks as `npm run verify`, no database:

| Step       | Command                  | Catches                                               |
| ---------- | ------------------------ | ----------------------------------------------------- |
| Install    | `npm ci`                 | lockfile drift (also generates the Prisma client)     |
| Formatting | `npm run format:check`   | unformatted code                                      |
| Lint       | `npm run lint`           | ESLint violations                                     |
| Typecheck  | `npm run typecheck`      | type errors in `src` **and** `tests`                  |
| Unit tests | `npm test`               | behaviour regressions                                 |
| Build      | `npm run build`          | anything that compiles under `--noEmit` but not to JS |
| OpenAPI    | `npm run verify:openapi` | broken route registration, dangling schema `$ref`s    |

**`integration`** — a real `postgres:17-alpine` service container:

| Step              | Catches                                                         |
| ----------------- | --------------------------------------------------------------- |
| Migration drift   | a `schema.prisma` edited without a matching migration           |
| Integration tests | everything under [Testing](#testing) that needs a real database |

**Run the whole thing locally before pushing:** `npm run verify` (and
`npm run test:integration` if you touched the schema or the checkout path).

The `verify` job needs no secrets: `DATABASE_URL` and the JWT secrets are
placeholders defined in the workflow, present only because
`prisma.config.ts` resolves `DATABASE_URL` eagerly and `postinstall` runs
`prisma generate` — so `npm ci` itself would fail without it. Nothing in that
job connects to a database.

### Migration drift

`prisma migrate diff --from-migrations` replays the whole `prisma/migrations`
folder into a scratch database and compares the result against
`schema.prisma`. If someone edits the schema and forgets the migration, this
fails in CI instead of on someone's deploy.

It needs that scratch database, supplied through `datasource.shadowDatabaseUrl`
in [`prisma.config.ts`](prisma.config.ts) — Prisma 7 does not accept the
`--shadow-database-url` flag its own error message suggests. Outside CI the
variable is unset and the check simply isn't run.

---

## Available Scripts

### Development

| Script                     | Description                                                            |
| -------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`              | Start the server with hot reload                                       |
| `npm start`                | Start the server in production mode                                    |
| `npm test`                 | Run the unit-test suite (Vitest, no database)                          |
| `npm run test:integration` | Run the integration suite (needs PostgreSQL — see [Testing](#testing)) |
| `npm run verify`           | Run every CI check locally, in the same order                          |

### Database (Prisma)

| Script                      | Description                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| `npx prisma db seed`        | Seed the database with test data (user, restaurant, menu, items) |
| `npm run db:generate`       | Regenerate the Prisma Client from the schema                     |
| `npm run db:migrate`        | Create and apply a new migration (development)                   |
| `npm run db:migrate:deploy` | Apply existing migrations (production — no new ones created)     |
| `npm run db:studio`         | Open Prisma Studio at `http://localhost:5555`                    |
| `npm run db:reset`          | ⚠️ Drop the database and re-apply all migrations                 |
| `npm run db:format`         | Auto-format `schema.prisma`                                      |

---

## Project Structure

```
src/
├── config/                      # Environment, logger, Prisma client
│   ├── env.ts
│   ├── logger.ts
│   └── prisma.ts
│
├── generated/                   # Auto-generated Prisma Client (git-ignored)
│   └── prisma/
│
├── middlewares/                 # Express middlewares
│   ├── auth.middleware.ts
│   ├── error.middleware.ts
│   └── validate.middleware.ts   # Zod request validation
│
├── openapi/                     # OpenAPI spec generation
│   ├── registry.ts              # Central route & schema registry
│   ├── document.ts              # Builds the OpenAPI document
│   └── serve.ts                 # Mounts Scalar + Swagger UI
│
├── shared/
│   ├── schemas/                 # Reusable Zod schemas
│   │   ├── error.schema.ts
│   │   └── pagination.schema.ts
│   └── repositories/
│       └── base.repository.ts   # Generic type-safe CRUD base class
│
├── modules/                     # One folder per entity (23 total)
│   ├── cart/
│   │   ├── cart.model.ts
│   │   ├── cart.repository.ts
│   │   ├── cart.service.ts      # (added per feature branch)
│   │   ├── cart.controller.ts   # (added per feature branch)
│   │   ├── cart.routes.ts       # (added per feature branch)
│   │   └── cart.validation.ts   # (added per feature branch)
│   └── ... (22 more entities)
│
├── routes/                      # Route aggregation
│   └── index.ts
│
├── utils/                       # Shared utilities
│   ├── asyncHandler.ts
│   └── response.ts
│
├── app.ts                       # Express app configuration
└── server.ts                    # Server entry point

prisma/
├── migrations/                  # Migration history (committed to git)
└── schema.prisma                # Database schema

docs/
└── troubleshooting.md           # Common issues + solutions
```

---

## Troubleshooting

If you run into issues during setup — authentication errors, port conflicts,
Prisma Client generation issues, etc. — see:

**[`docs/troubleshooting.md`](docs/troubleshooting.md)**

It covers the specific problems encountered during development and their solutions.

---

---

## After Changing the Schema

Every time you modify `prisma/schema.prisma`, run these steps in order:

### Step 1 — Create a new migration

```bash
npm run db:migrate
```

When prompted, enter a short name describing your change (e.g. `add-restaurant-id-to-cart`).

This will:

- Generate a new SQL file under `prisma/migrations/`
- Apply it to your local database immediately

> **Do not skip this step.** The database won't reflect your schema changes until a migration is applied.

### Step 2 — Regenerate the Prisma Client

```bash
npm run db:generate
```

This regenerates the TypeScript client in `src/generated/prisma/` to match your updated schema. Your IDE autocomplete and type safety won't reflect the new fields until this runs.

> **Note:** `db:migrate` usually triggers `db:generate` automatically, but it's good practice to run it explicitly after any schema change.

### Step 3 — Restart the dev server

```bash
npm run dev
```

The server picks up the new Prisma Client on restart.

---

### Quick Reference

| What changed            | Commands to run                        |
| ----------------------- | -------------------------------------- |
| Added / removed a field | `db:migrate` → `db:generate` → restart |
| Added a new model       | `db:migrate` → `db:generate` → restart |
| Renamed a field         | `db:migrate` → `db:generate` → restart |
| Schema only (no DB yet) | `db:generate` → restart                |

---

### Seed Output Example

After running `npx prisma db seed`, you'll see output similar to:

```json
{
  "level": "info",
  "message": "✅ Seed complete",
  "timestamp": "2026-04-21T11:44:19.057Z",
  "data": {
    "customerId": "cmokc9lkd000124ap0i1men3u",
    "userId": "cmokc9lk6000024ap6ogg7t7j",
    "userEmail": "test@example.com",
    "addressId": "cmok...",
    "customerLogin": {
      "email": "test@example.com",
      "password": "Password123!"
    },
    "adminLogin": { "email": "admin@example.com", "password": "Admin123!" },
    "menuItemIds": [
      { "id": "cmo8k38mk0006iiapa4wdjh7j", "name": "Margherita Pizza" },
      { "id": "cmo8k38mm0007iiapvytskboq", "name": "Pepperoni Pizza" },
      { "id": "cmo8k38mn0008iiap87bk5byr", "name": "Caesar Salad" }
    ]
  }
}
```

Use the printed `customerLogin` / `adminLogin` credentials to log in via `POST /api/v1/auth/login` (or `/auth/admin/login`); the API sets httpOnly auth cookies.

---

## License

ISC
