# Auth & Authorization — Architecture Plan

## Current State

- `User`, `Role`, `UserRole`, `UserType` models exist in Prisma schema
- `jsonwebtoken` and `JWT_SECRET` already configured
- OpenAPI spec has `BearerAuth` security scheme defined
- `auth.middleware.ts` is a placeholder (4 comment lines)
- **Missing:** `password` field on User (not yet in schema), `bcrypt` not installed
- **Placeholder:** Controllers use `getCurrentUserId(req)` reading `TEST_USER_ID` env var

---

## Module Structure

```
src/modules/auth/
  ├── auth.controller.ts    # HTTP handlers: login, register, refresh, me, logout
  ├── auth.service.ts       # Business logic: hash, compare, generate tokens
  ├── auth.routes.ts        # Route definitions + OpenAPI docs
  ├── auth.validation.ts    # Zod schemas for request/response
  └── auth.model.ts         # Token payload type, req.user extension

src/middlewares/
  ├── auth.middleware.ts     # authenticate() — verify JWT, attach req.user
  └── authorize.middleware.ts # authorize(...roles) — role-based guard

src/types/
  └── express.d.ts          # Express Request extension for req.user
```

---

## Three Options

### Option A — JWT Access Token Only (simplest)

- `POST /auth/login` → validate email+password → sign JWT (24h expiry) → return token
- Protected routes use `authenticate` middleware → reads `Authorization: Bearer <token>` → decodes → attaches `req.user`
- Role check via `authorize("admin", "owner")`

**Pros:** Simple, fast to implement
**Cons:** No refresh mechanism, token can't be revoked

### Option B — Access + Refresh Token (recommended)

- Access token: 15min expiry, sent in `Authorization: Bearer` header
- Refresh token: 7d expiry, stored in httpOnly cookie
- `POST /auth/refresh` → validate refresh token → issue new access token
- `POST /auth/logout` → invalidate refresh token

**Pros:** Short-lived access tokens limit damage, refresh allows seamless re-auth
**Cons:** More complex, need refresh token storage

### Option C — Access + Refresh with Refresh Token Table

Add `RefreshToken` model to DB for persisted refresh tokens that can be revoked per-session.

**Pros:** Can revoke specific sessions, track active sessions, audit trail
**Cons:** Extra DB query per refresh

---

## Security Layers

| Layer | Recommendation |
|---|---|
| Password hashing | bcrypt (rounds=12) |
| JWT secret | 256-bit random string in `.env` |
| Access token expiry | 15 minutes |
| Refresh token expiry | 7 days |
| Rate limiting | `POST /auth/login` — 5 attempts/min |
| Input validation | Zod on all auth endpoints |
| JWT payload | Only `{ id, email, role }` — never password |
| Refresh token storage | httpOnly cookie (prevents XSS theft) |
| Ownership checks | Every protected route verifies `req.user.id` matches resource |
| Password reset | Reset tokens with 24h expiry |

---

## Middleware Chain

```
Request → authenticate → authorize("admin") → validate → controller → service → repository
```

---

## Route Design

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Create account (User + Customer) |
| `POST` | `/auth/login` | Public | Get access + refresh tokens |
| `POST` | `/auth/refresh` | Public (cookie) | Refresh access token |
| `POST` | `/auth/logout` | Authenticated | Revoke refresh token |
| `GET` | `/auth/me` | Authenticated | Current user profile |

---

## Migration Path

1. Add `password` field to `User` model in Prisma schema
2. Install `bcrypt`
3. Create auth module files
4. Implement `authenticate` + `authorize` middlewares
5. Replace all `getCurrentUserId()` / `TEST_USER_ID` with `req.user.id`
6. Remove `TEST_USER_ID` from `.env`
