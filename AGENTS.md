---
name: group-2-team-1-instructions
description: |
  Instructions for AI agents working on the Group-2-Team-1 backend project.
  Use when: working with Express/TypeScript/Prisma modules, implementing features, debugging, or extending API routes.
---

# AI Agent Instructions – Group-2-Team-1 Backend

This is an **Express 5 + TypeScript + Prisma 7 + PostgreSQL** backend with OpenAPI documentation and role-based authentication. Agents should follow the conventions below to stay productive.

## Quick Start

**Tech stack:**

- Node.js 25.8.1, Express 5.2, TypeScript 6, Prisma 7.7
- PostgreSQL 17 via `@prisma/adapter-pg`
- Zod 4.3 for validation, JWT for auth, Scalar/Swagger for API docs

**Dev commands:**

```bash
npm run dev              # Start with auto-reload
npm run db:migrate      # Create/apply migrations
npm run db:generate     # Regenerate Prisma client
npm run db:studio       # Visual DB browser
```

---

## Architecture & Patterns

### Module Structure (3-Layer)

Every feature module lives in `/src/modules/{moduleName}/` with these files:

```
cart/
  ├── cart.controller.ts    # HTTP handlers (req/res)
  ├── cart.service.ts       # Business logic + validation
  ├── cart.repository.ts    # Data access (extends BaseRepository)
  ├── cart.routes.ts        # Route definitions + OpenAPI docs
  ├── cart.validation.ts    # Zod schemas for requests/responses
  └── cart.model.ts         # TypeScript type definitions
```

**Reference implementation:** The `cart` module exemplifies all patterns. Copy its structure for new modules.

### Routing & Validation

Routes are defined in `*.routes.ts` and decorated with OpenAPI specs:

```typescript
import { Router } from "express";
import { validate } from "@/middlewares/validate.middleware";
import { AddCartItemRequestSchema } from "./cart.validation";
import { cartController } from "./cart.controller";

const router = Router();

router.post(
  "/me/items",
  validate({ body: AddCartItemRequestSchema }),
  cartController.addItem,
);

export const cartRoutes = router;
```

**Key points:**

- `validate()` middleware enforces Zod schemas _before_ reaching the controller
- Parsed data replaces `req.body`, `req.params`, `req.query`
- Validation schemas self-register to OpenAPI documentation
- Invalid input → 400 with field-level errors (handled by error middleware)

### Controllers

Controllers wrap service calls and handle HTTP responses. Use `asyncHandler` HOF to catch errors:

```typescript
import { asyncHandler } from "@/utils/asyncHandler";

export const cartController = {
  addItem: asyncHandler(async (req, res) => {
    const { userId, quantity } = req.body;
    const result = await cartService.addItem(userId, quantity);
    res.status(201).json({ success: true, data: result });
  }),
};
```

**Patterns:**

- Return `{ success: true, data: T }` on success
- Throw `AppError` for business logic failures (caught by error middleware)
- Never catch errors in the handler — let `asyncHandler` pass to `next()`

### Services (Business Logic)

Services contain validation rules and business logic. Always throw `AppError` for known failures:

```typescript
import { AppError } from "@/utils/response";

export const cartService = {
  addItem: async (userId: string, quantity: number) => {
    if (quantity <= 0) {
      throw new AppError("Quantity must be > 0", 400);
    }
    // ... business logic
    return result;
  },
};
```

**Patterns:**

- Validate inputs and throw `AppError(message, statusCode)` for failures
- Catch Prisma errors and wrap in `AppError` with appropriate status
- Keep logic testable; avoid Express dependencies
- Use repositories for all data access

### Repositories (Data Access)

Repositories extend `BaseRepository<T>` for generic CRUD. Add custom queries for complex operations:

```typescript
import { BaseRepository } from "@/shared/repositories/base.repository";
import { prisma } from "@/config/prisma";

export class CartRepository extends BaseRepository {
  constructor() {
    super(prisma.cart);
  }

  async findByUserIdWithItems(userId: string) {
    return this.delegate.findFirst({
      where: { userId },
      include: { items: true },
    });
  }
}

export const cartRepository = new CartRepository();
```

**BaseRepository methods** (fully type-safe):

- `findUnique(where)`, `findFirst(where)`, `findMany(where, skip, take)`
- `create(data)`, `update(id, data)`, `delete(id)`, `upsert(...)`
- `count(where)`

**Patterns:**

- Subclass and call `super(prisma.modelName)` in constructor
- Add complex queries as class methods (e.g., eager loading, aggregations)
- Export singleton instance: `export const cartRepository = new CartRepository()`
- All queries use Prisma — no raw SQL

---

## Error Handling

### AppError Convention

All operational errors should be `AppError`. Unhandled errors are caught by error middleware:

```typescript
import { AppError } from "@/utils/response";

// In service or repository:
if (!user) throw new AppError("User not found", 404);
if (insufficientBalance) throw new AppError("Insufficient balance", 402);

// Wrap Prisma errors:
try {
  await cartRepository.create(data);
} catch (error) {
  if (error.code === "P2002") {
    throw new AppError("Cart already exists", 409);
  }
  throw new AppError("Database error", 500);
}
```

**Error response format:**

```json
{
  "success": false,
  "message": "User not found",
  "statusCode": 404
}
```

### Validation Errors

Zod validation failures are caught by the `validate` middleware and return structured errors:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "path": "body.quantity", "message": "Expected number" },
    { "path": "body.userId", "message": "Required" }
  ]
}
```

---

## Authentication & Authorization

### JWT Pattern

Auth middleware decodes Bearer tokens and attaches `req.user`:

```typescript
// In controller or service:
const userId = req.user.id; // From decoded JWT payload

// If you need authorization (role-based):
import { authorize } from "@/middlewares/auth.middleware";
router.post("/admin/settings", authorize("admin"), controller.updateSettings);
```

**JWT payload shape:**

```typescript
{ id: string, email: string, role: string }
```

**Note:** Currently some controllers use `TEST_USER_ID` env var as placeholder. This will be replaced once auth module is fully implemented.

---

## Database & Prisma

### Migrations

Create and apply migrations after schema changes:

```bash
# Create new migration (interactive prompt)
npm run db:migrate

# In CI/CD, apply existing migrations:
npm run db:migrate:deploy

# Generate Prisma Client (automatic on npm install):
npm run db:generate
```

### Schema Patterns

The schema follows these conventions:

```prisma
model Cart {
  id        String   @id @default(cuid())
  userId    String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  items CartItem[]

  @@map("carts")
}
```

**Conventions:**

- IDs: `@default(cuid())` for distributed uniqueness
- Timestamps: `@default(now())` for `createdAt`, `@updatedAt` for `updatedAt`
- Relations: Use named `@relation()` only when ambiguous
- Cascade deletes for dependent data; Restrict for critical relationships
- Strategic indexes on foreign keys
- Tables use snake_case in DB (`@@map("table_name")`)

### Generated Types

Prisma types are generated to `/src/generated/prisma/`:

```typescript
import type { Cart, CartItem } from "@prisma/client";
```

Regenerate after schema changes: `npm run db:generate`

---

## API Documentation (OpenAPI 3.1)

### Self-Registering Routes

Routes auto-register with the OpenAPI registry. Schemas must be defined in `*.validation.ts`:

```typescript
// cart.validation.ts
import { z } from "zod";

export const AddCartItemRequestSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

export const CartResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  items: z.array(/* ... */),
});
```

Validation middleware uses these schemas to:

- Parse and transform request data
- Auto-populate OpenAPI documentation

**API docs URLs:**

- `/api-docs` – Scalar (interactive)
- `/api-docs/swagger` – Swagger UI
- `/openapi.json` – Raw spec

---

## Response Envelope

All endpoints return a consistent envelope:

```typescript
// Success (200/201):
{ success: true, data: T, message?: string }

// Validation error (400):
{ success: false, message: "Validation failed", errors: [...] }

// Operational error (custom status):
{ success: false, message: "...", statusCode: 402 }

// Unhandled error (500):
{ success: false, message: "Internal Server Error" }
```

---

## Key Files & References

| File                                                                                     | Purpose                                   |
| ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| [src/modules/cart/](src/modules/cart/)                                                   | Complete working module — use as template |
| [src/shared/repositories/base.repository.ts](src/shared/repositories/base.repository.ts) | Generic CRUD foundation                   |
| [src/middlewares/auth.middleware.ts](src/middlewares/auth.middleware.ts)                 | Authentication & authorization            |
| [src/middlewares/validate.middleware.ts](src/middlewares/validate.middleware.ts)         | Input validation & transformation         |
| [src/middlewares/error.middleware.ts](src/middlewares/error.middleware.ts)               | Global error handler                      |
| [src/utils/asyncHandler.ts](src/utils/asyncHandler.ts)                                   | Error wrapper HOF                         |
| [src/config/prisma.ts](src/config/prisma.ts)                                             | Prisma client setup                       |
| [src/openapi/registry.ts](src/openapi/registry.ts)                                       | Route registration for API docs           |
| [prisma/schema.prisma](prisma/schema.prisma)                                             | Database schema                           |

---

## Common Gotchas

| Issue                             | Context                                 | Solution                                                                            |
| --------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| **Missing Prisma client**         | After schema changes, types are stale   | Run `npm run db:generate`                                                           |
| **Circular dependencies**         | Services importing other services       | Keep services focused; use repositories for cross-module data                       |
| **Unhandled Prisma errors**       | Raw Prisma errors expose internals      | Catch & wrap with `AppError` in services                                            |
| **Placeholder auth**              | Some endpoints use `TEST_USER_ID`       | Will be replaced; use `req.user.id` pattern now                                     |
| **Type-safety in BaseRepository** | Generic types look complex              | Just call `super(prisma.modelName)` — TypeScript handles the rest                   |
| **Express 5 read-only query**     | `req.query` is frozen                   | Validate middleware uses `Object.assign()` to work around this                      |
| **Module loading order**          | Routes must register during module load | Ensure routes export and are imported in [src/routes/index.ts](src/routes/index.ts) |

---

## Adding a New Feature

1. **Create the module directory:** `/src/modules/{feature}/`
2. **Copy cart module as template** (controller, service, repository, routes, validation)
3. **Update Prisma schema** (add model, run `npm run db:migrate`)
4. **Implement logic:**
   - Repository: CRUD + custom queries
   - Service: validation + business logic
   - Controller: async handlers with error wrapping
   - Routes: endpoint definitions + validation schemas
5. **Register routes** in [src/routes/index.ts](src/routes/index.ts)
6. **Test:** `npm run dev` and visit `/api-docs`

---

## Environment Setup

Required `.env` variables:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/db_name
JWT_SECRET=your-secret-key
NODE_ENV=development        # Optional, defaults to 'development'
PORT=3000                   # Optional, defaults to 3000
TEST_USER_ID=test-user-id   # For dev/test until auth is complete
```

Missing required variables will cause startup errors.
