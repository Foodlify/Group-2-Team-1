---
name: add-module
description: |
  Create a new feature module following the 3-layer architecture pattern.
  Use when: adding a new API resource (e.g., cart, order, user, payment).
---

# Add Module

Scaffolds a complete new feature module with controller, service, repository, routes, and validation.

## Usage

```bash
/add-module payment
/add-module notification
```

## Generated Structure

The command creates:

```
src/modules/{moduleName}/
  ├── {name}.model.ts          # TypeScript types
  ├── {name}.validation.ts     # Zod request/response schemas
  ├── {name}.repository.ts     # Data access layer
  ├── {name}.service.ts        # Business logic
  ├── {name}.controller.ts     # HTTP handlers
  └── {name}.routes.ts         # Route definitions + OpenAPI docs
```

## What You Need to Do After

1. **Update Prisma schema** (`prisma/schema.prisma`):
   - Add the data model
   - Run `npm run db:migrate` to generate migration
   - Run `npm run db:generate` to regenerate Prisma Client

2. **Implement logic** in service and repository:
   - Add business logic to service
   - Add custom queries to repository if needed

3. **Register routes** in `src/routes/index.ts`:

   ```typescript
   import { {name}Routes } from "@/modules/{name}/{name}.routes";
   app.use("/api/v1/{name}s", {name}Routes);
   ```

4. **Test:**
   - Start dev server: `npm run dev`
   - Visit `/api-docs` to see OpenAPI documentation

## Template Files

### {name}.model.ts

```typescript
export interface {PascalName}Model {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### {name}.validation.ts

```typescript
import { z } from "zod";

export const Create{PascalName}Schema = z.object({
  // Define required fields
});

export const {PascalName}ResponseSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

### {name}.repository.ts

```typescript
import { BaseRepository } from "@/shared/repositories/base.repository";
import { prisma } from "@/config/prisma";

export class {PascalName}Repository extends BaseRepository {
  constructor() {
    super(prisma.{camelName});
  }

  // Add custom queries here
}

export const {camelName}Repository = new {PascalName}Repository();
```

### {name}.service.ts

```typescript
import { AppError } from "@/utils/response";
import { {camelName}Repository } from "./{name}.repository";

export const {camelName}Service = {
  create: async (data: any) => {
    // Validate + business logic
    try {
      return await {camelName}Repository.create(data);
    } catch (error) {
      throw new AppError("Creation failed", 500);
    }
  },
};
```

### {name}.controller.ts

```typescript
import { asyncHandler } from "@/utils/asyncHandler";
import { {camelName}Service } from "./{name}.service";

export const {camelName}Controller = {
  create: asyncHandler(async (req, res) => {
    const result = await {camelName}Service.create(req.body);
    res.status(201).json({ success: true, data: result });
  }),
};
```

### {name}.routes.ts

```typescript
import { Router } from "express";
import { validate } from "@/middlewares/validate.middleware";
import { Create{PascalName}Schema } from "./{name}.validation";
import { {camelName}Controller } from "./{name}.controller";

const router = Router();

router.post("/", validate({ body: Create{PascalName}Schema }), {camelName}Controller.create);

export const {camelName}Routes = router;
```
