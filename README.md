# Group-2-Team-1

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
- [Adding a New Feature](#adding-a-new-feature)
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

### The 23 entities

Each entity from the Prisma schema has its own module folder:

```
src/modules/
├── address/                        ├── orderStatus/
├── auditingEvent/                  ├── orderTracking/
├── cart/                           ├── paymentIntegrationType/
├── cartItem/                       ├── paymentTypeConfiguration/
├── customer/                       ├── preferredPaymentSetting/
├── menu/                           ├── restaurant/
├── menuItem/                       ├── restaurantDetails/
├── order/                          ├── role/
├── orderItem/                      ├── transaction/
                                    ├── transactionDetails/
                                    ├── transactionStatus/
                                    ├── user/
                                    ├── userRole/
                                    └── userType/
```

Currently each module contains only `{entity}.model.ts` and `{entity}.repository.ts` —
the other files are created per-entity as feature branches implement them.

### BaseRepository

All repositories extend a generic, fully type-safe `BaseRepository<TDelegate>` at
`src/shared/repositories/base.repository.ts`. It provides:

- `findUnique`, `findMany`, `findFirst`, `count`
- `create`, `update`, `delete`, `upsert`
- `findPaginated({ page, limit, where?, include?, orderBy? })`

The base class is generic over a Prisma delegate (e.g., `PrismaClient["user"]`), so
every method returns correctly typed results with full IDE autocomplete — no `any`,
no manual type assertions needed in repositories.

**Entity-specific queries** (beyond basic CRUD) belong in the individual repository
classes. For example, `CartRepository.findByUserId(userId)` or more complex joins that
warrant a dedicated method.

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

   // Note: Auth middleware is not yet implemented — examples showing `authenticate`
   // are aspirational and will apply once auth lands.
   router.post(
     "/items",
     authenticate,
     validate({ body: AddToCartRequestSchema }),
     controller.addItem,
   );

   // Document the route for OpenAPI
   routeRegistry.push({
     path: "/api/v1/carts/items",
     pathItem: {
       post: {
         tags: ["Cart"],
         security: [{ BearerAuth: [] }],
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

## Available Scripts

### Development

| Script        | Description                         |
| ------------- | ----------------------------------- |
| `npm run dev` | Start the server with hot reload    |
| `npm start`   | Start the server in production mode |
| `npm test`    | Run tests (not yet configured)      |

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

| What changed | Commands to run |
|---|---|
| Added / removed a field | `db:migrate` → `db:generate` → restart |
| Added a new model | `db:migrate` → `db:generate` → restart |
| Renamed a field | `db:migrate` → `db:generate` → restart |
| Schema only (no DB yet) | `db:generate` → restart |

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
    "customerLogin": { "email": "test@example.com", "password": "Password123!" },
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
