# Authentication Implementation Guide

## Current State

- `jsonwebtoken` is installed
- `auth.middleware.ts` has `authenticate` (decodes Bearer token → `req.user`) and `authorize` (role check)
- OpenAPI spec already has bearer auth configured
- **Missing:** User has no `password` field, no login/signup endpoints, `bcrypt` not installed
- **Placeholder:** Controllers use `getCurrentUserId(req)` which reads `TEST_USER_ID` env var

---

## Step 1 — Schema: Add password to User

```prisma
model User {
  id       String @id @default(cuid())
  typeId   String
  name     String
  email    String @unique
  password String  // ← add this

  userType          UserType
  roles             UserRole[]
  customer          Customer?
  addresses         Address[]
  cart              Cart?
  preferredPayments PreferredPaymentSetting[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Then run:

```bash
npm run db:migrate
npm run db:generate
```

**Best practice:** Store hashed passwords only. Never store plain text.

---

## Step 2 — Install bcrypt

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

---

## Step 3 — Create auth module

`src/modules/auth/auth.validation.ts`:

```typescript
import { z } from "zod";
import { schemaRegistry } from "../../openapi/registry";

export const LoginRequestSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(6),
  })
  .meta({ id: "LoginRequest" });

export const RegisterRequestSchema = z
  .object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
  })
  .meta({ id: "RegisterRequest" });

export const AuthResponseSchema = z
  .object({
    token: z.string(),
    user: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      role: z.string(),
    }),
  })
  .meta({ id: "AuthResponse" });

schemaRegistry.register("LoginRequest", LoginRequestSchema);
schemaRegistry.register("RegisterRequest", RegisterRequestSchema);
schemaRegistry.register("AuthResponse", AuthResponseSchema);

export type LoginInput = z.infer<typeof LoginRequestSchema>;
export type RegisterInput = z.infer<typeof RegisterRequestSchema>;
```

`src/modules/auth/auth.service.ts`:

```typescript
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../../config/prisma";
import env from "../../config/env";
import { AppError } from "../../middlewares/error.middleware";
import type { LoginInput, RegisterInput } from "./auth.validation";

export class AuthService {
  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { roles: { include: { role: true } } },
    });

    if (!user) {
      throw new AppError("Invalid email or password", 401);
    }

    const valid = await bcrypt.compare(input.password, user.password);
    if (!valid) {
      throw new AppError("Invalid email or password", 401);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.roles[0]?.role.name || "user" },
      env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.roles[0]?.role.name || "user",
      },
    };
  }

  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new AppError("Email already in use", 409);
    }

    const hashedPassword = await bcrypt.hash(input.password, 12);

    // Create user + customer in one transaction
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password: hashedPassword,
        typeId: "default-type-id", // adjust based on your seed data
        customer: { create: {} },
      },
      include: { customer: true },
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: "user" },
      env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: "user" },
    };
  }
}

export const authService = new AuthService();
```

`src/modules/auth/auth.controller.ts`:

```typescript
import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { authService } from "./auth.service";
import type { LoginInput, RegisterInput } from "./auth.validation";

export const login = asyncHandler(
  async (req: Request<unknown, unknown, LoginInput>, res: Response) => {
    const result = await authService.login(req.body);
    res.status(200).json({ success: true, data: result });
  },
);

export const register = asyncHandler(
  async (req: Request<unknown, unknown, RegisterInput>, res: Response) => {
    const result = await authService.register(req.body);
    res.status(201).json({ success: true, data: result });
  },
);
```

`src/modules/auth/auth.routes.ts`:

```typescript
import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import { routeRegistry } from "../../openapi/registry";
import * as controller from "./auth.controller";
import { LoginRequestSchema, RegisterRequestSchema } from "./auth.validation";

const router = Router();

router.post("/login", validate({ body: LoginRequestSchema }), controller.login);
router.post("/register", validate({ body: RegisterRequestSchema }), controller.register);

// OpenAPI docs
routeRegistry.push({
  path: "/api/v1/auth/login",
  pathItem: {
    post: {
      tags: ["Auth"],
      summary: "Login with email and password",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/LoginRequest" },
          },
        },
      },
      responses: {
        "200": {
          description: "Login successful",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuthResponse" },
            },
          },
        },
        "401": { description: "Invalid credentials" },
      },
    },
  },
});

routeRegistry.push({
  path: "/api/v1/auth/register",
  pathItem: {
    post: {
      tags: ["Auth"],
      summary: "Register a new user",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/RegisterRequest" },
          },
        },
      },
      responses: {
        "201": {
          description: "User registered",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuthResponse" },
            },
          },
        },
        "409": { description: "Email already in use" },
      },
    },
  },
});

export default router;
```

Register the routes in `src/routes/index.ts`:

```typescript
import authRouter from "../modules/auth/auth.routes";
router.use("/auth", authRouter);
```

---

## Step 4 — Replace TEST_USER_ID with req.user

**Before** (in every controller):

```typescript
const userId = getCurrentUserId(req); // reads TEST_USER_ID from env
```

**After**:

```typescript
const userId = req.user.id; // from JWT token decoded by authenticate
```

Add `authenticate` middleware to your routes:

```typescript
import { authenticate } from "../../middlewares/auth.middleware";

router.get("/me", authenticate, controller.getMyCart);
router.post("/me/items", authenticate, controller.addItem);
```

Once all routes use `authenticate`, remove `getCurrentUserId` and `TEST_USER_ID` from `.env`.

---

## Step 5 — Role-based authorization

For admin-only endpoints:

```typescript
import { authenticate, authorize } from "../../middlewares/auth.middleware";

router.get("/admin/settings", authenticate, authorize("admin"), controller.getSettings);
```

---

## Best Practices Summary

| Practice | Why |
|---|---|
| Hash passwords with bcrypt (rounds: 12) | Slow to brute-force |
| Never store plain-text passwords | One leak = all accounts compromised |
| Use JWT with expiry (7d or less) | Limits damage from token theft |
| Always validate inputs with Zod | Prevents injection and type errors |
| Use transactions for related creates | Prevents partial writes (user without customer) |
| Return 401 for bad credentials | Don't reveal if email exists or not |
| Add `authenticate` to every protected route | Don't rely on frontend to gatekeep |
| Remove `TEST_USER_ID` after migration | Eliminates the placeholder bypass |
