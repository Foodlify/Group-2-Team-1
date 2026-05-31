# خطة موديول: User

> اقرأ أولًا [`00-shared-concerns.plan.md`](./00-shared-concerns.plan.md) — قرارات الـ Auth
> والـ Roles هناك تحكم هذا الموديول بالكامل.
>
> **طريقة الإجابة:** ضع قرارك أسفل كل سؤال في سطر `> ✅ القرار:`.

---

## 1. الغرض والنطاق

> 🎓 **مُحدَّث بعد إجابات المعلم:** هذا الموديول («User Management») يستضيف **كل الـ Auth**
> (customer-auth **و** admin-auth) **+** إدارة المستخدمين (CRUD). موديول `customer` **بلا auth**
> (بيانات فقط). التوكنات تُسلَّم عبر **httpOnly cookies** لا في الـ body.

`User` هو هوية الحساب (identity) في النظام. علاقته بـ `Customer` هي **1:1**
(`User.customer?` ↔ `Customer.userId @unique`). كل `User` يحمل `role` (`CUSTOMER` افتراضيًا، أو `ADMIN`).
العميل = `User(role=CUSTOMER)` + سجل `Customer`. الأدمن = `User(role=ADMIN)` بلا `Customer` بالضرورة.

**الوضع الحالي في الكود:**
- [`user.model.ts`](../../src/modules/user/user.model.ts) — فارغ (placeholder).
- [`user.repository.ts`](../../src/modules/user/user.repository.ts) — `findById` فقط، يرث `BaseRepository`.
- لا يوجد `service / controller / routes / validation` بعد.
- موديول User **مُعلَّق** في `routes/index.ts` (`// router.use("/users", userRouter)`).

---

## 2. تعديلات الـ schema (مُعتمدة)

> ✅ **القرار النهائي:** Auth كامل + `enum Role` + access/refresh → تُضاف 3 حقول إلى `User`.

```prisma
enum Role { CUSTOMER  ADMIN }

model User {
  id           String  @id @default(cuid())
  name         String
  email        String  @unique
  password     String          // ← جديد: hash فقط، لا يُعاد أبدًا في أي response
  role         Role    @default(CUSTOMER)   // ← جديد
  refreshToken String?         // ← جديد: للـ refresh/revoke (قرار #6)

  customer  Customer?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- بعد التعديل: `npm run db:migrate` ثم `npm run db:generate` ثم إعادة التشغيل.

✅ **سؤال U-1 (حقل `password`):** نعم — مُعتمد.
✅ **سؤال U-2 (حقل `role`):** نعم — `enum Role { CUSTOMER, ADMIN }` مُعتمد.
✅ **إضافي:** حقل `refreshToken String?` مُعتمد (قرار #6).

---

## 3. الـ Endpoints (مُعتمدة) — كل الـ Auth + إدارة المستخدمين

> **كل التوكنات تُسلَّم عبر httpOnly cookies** (`res.cookie`) لا في الـ body. الـ body يرجع
> `{ success, message, data: { user } }` فقط. `logout` يمسح الكوكيز + يصفّر `refreshToken`.

### (أ) مصادقة العميل (customer-auth) — مسارات `/api/v1/auth/*`

| Method | Path | الوصف | الحماية |
|---|---|---|---|
| POST | `/api/v1/auth/register` | إنشاء `User(role=CUSTOMER)` + `Customer` (transaction) → set cookies | عام |
| POST | `/api/v1/auth/login` | دخول العميل → set cookies | عام |
| POST | `/api/v1/auth/refresh-token` | تجديد access من refresh cookie | عام (refresh cookie) |
| POST | `/api/v1/auth/logout` | مسح الكوكيز + تصفير refreshToken | مُصادَق |
| ~~POST~~ | ~~`/api/v1/auth/forgot-password`~~ | ⏸️ **مؤجَّل (U-6)** — إرسال رمز إعادة التعيين (صامت لمنع enumeration) | عام |
| ~~POST~~ | ~~`/api/v1/auth/reset-password`~~ | ⏸️ **مؤجَّل (U-6)** — تعيين كلمة مرور جديدة عبر الرمز | عام (يحمل token) |

### (ب) مصادقة الإدارة (admin-auth) — مسارات `/api/v1/auth/admin/*`

| Method | Path | الوصف | الحماية |
|---|---|---|---|
| POST | `/api/v1/auth/admin/login` | دخول الإدارة — يتحقق `role === ADMIN` → set cookies | عام |
| POST | `/api/v1/auth/admin/refresh-token` | تجديد access | عام (refresh cookie) |
| POST | `/api/v1/auth/admin/logout` | مسح الكوكيز + تصفير refreshToken | مُصادَق (ADMIN) |

### (ج) إدارة المستخدمين (CRUD) — مسارات `/api/v1/users/*` محميّة بـ `authorize("ADMIN")`

| Method | Path | الوصف | الحماية |
|---|---|---|---|
| GET | `/api/v1/users` | قائمة المستخدمين (paginated) | ADMIN |
| GET | `/api/v1/users/:id` | مستخدم واحد | ADMIN |
| POST | `/api/v1/users` | إنشاء مستخدم (مع تحديد `role`) | ADMIN |
| PATCH | `/api/v1/users/:id` | تعديل `name`/`email`/`role` | ADMIN |
| DELETE | `/api/v1/users/:id` | حذف مستخدم (Cascade على Customer) | ADMIN |

> ✅ **سؤال U-6 (forgot/reset password): مؤجَّل** — لا يُنفَّذ في هذه الجولة (يحتاج بنية بريد).
> يُبنى لاحقًا في PR مستقل (ربما عبر Gmail connector). مساراه أدناه **مؤجَّلة**.
>
> ملاحظة: مسارات الـ auth تحت `/api/v1/auth/*` لكنها **مُعرّفة داخل موديول `user`** (نموذج المعلم)؛
> يُمكن أن يصدّر الموديول راوترين (auth + users) يُربطان في `routes/index.ts`.

✅ **سؤال U-3 (النطاق):** **كل الـ Auth** (customer-auth + admin-auth) **+** إدارة المستخدمين CRUD (ADMIN).
✅ **سؤال U-4 (إنشاء Customer مع register):** نعم — `register` العميل يُنشئ `User(role=CUSTOMER)` + `Customer`
في نفس الـ `prisma.$transaction`. إنشاء أدمن عبر `POST /users` لا يُنشئ `Customer`.

---

## 4. تفصيل ملفات الموديول (نمط الـ 6 ملفات)

> كل الـ auth داخل موديول `user`. JWT/hashing/cookie helpers مشتركة في `src/shared/auth/`.
> **التوكنات تُكتب كـ httpOnly cookies** — راجع consequences الكوكيز في الملف المشترك.

### `user.validation.ts`
- **Customer-auth:** `RegisterRequestSchema` { name, email (`z.email()`), password (min 8), **phone (مطلوب — قرار C-1)** }،
  `LoginRequestSchema` { email, password }، `ForgotPasswordSchema` { email }، `ResetPasswordSchema` { token, newPassword }.
  > `phone` يُمرَّر لإنشاء `Customer` (مطلوب + فريد) داخل نفس الـ transaction؛ تكراره → `409`.
- **Admin-auth:** `AdminLoginRequestSchema` { email, password }.
- **User CRUD:** `CreateUserRequestSchema` { name, email, password, role (`z.enum(["CUSTOMER","ADMIN"])`) }،
  `UpdateUserRequestSchema` { name?, email?, role? }، `UserIdParamsSchema` { id }، `UserQuerySchema` = `PaginationQuerySchema`.
- **Responses:** `UserResponseSchema` { id, name, email, role, createdAt, updatedAt } — **بدون password/refreshToken**.
  ⚠️ **لا `AuthTokensSchema` في الـ body** — التوكنات في الكوكيز؛ ردّ الـ auth =
  `AuthResponseSchema` { success, message, data: { user } }. + `UserSuccessResponseSchema` / `UserListSuccessResponseSchema`.
- كلها `.meta({ id })` + `schemaRegistry.register(...)`.

### `user.repository.ts`
- موجود: `findById`. يُضاف: `findByEmail(email)`، `updateRefreshToken(id, token|null)`، `updatePassword(id, hash)`.
- لا business logic — فقط استعلامات.

### `user.service.ts`
- **register(input)** → تحقق عدم تكرار الإيميل (`409`) → hash → إنشاء `User(CUSTOMER)` + `Customer` في transaction → توليد access+refresh + تخزين refresh.
- **login(input)** / **adminLogin(input)** (الأخير يتحقق `role === ADMIN` وإلا `401`) → مقارنة hash → access+refresh.
- **refresh(token)** → تحقق + مطابقة المخزَّن → access جديد. **logout(userId)** → `updateRefreshToken(null)`.
- **forgot/reset** (لو نُفّذت): إرسال رمز / تعيين كلمة مرور.
- **create/list/findById/update/remove** (إداري) → مع `toUserResponse` (إخفاء password/refreshToken).
- > الخدمة تُرجع التوكنات للـ controller الذي يكتبها كـ cookies (الخدمة لا تلمس `res`).

### `user.controller.ts`
- `register / login / adminLogin / refresh / logout / forgot / reset / getById / list / create / update / remove`.
- **يكتب التوكنات عبر `res.cookie(..., { httpOnly: true, secure, sameSite })`**، و`logout` عبر `res.clearCookie`.
- الجسم عبر `sendSuccess/sendError`.

### `user.routes.ts`
- راوتر `auth` (`/api/v1/auth/*` + `/auth/admin/*`) وراوتر `users` (`/api/v1/users/*`).
- `validate(...)` + `authenticate` (يقرأ الكوكي) + `authorize("ADMIN")` على الإدارة + `routeRegistry.push(...)`.

### `user.model.ts`
- `SafeUser` (User بدون password/refreshToken)، و`UserWithCustomer` عند الحاجة.

---

## 5. كتالوج الأخطاء المقترح — `src/shared/exceptions/user.errors.ts`

```ts
export const userErrors = {
  EMAIL_ALREADY_EXISTS: { message: "Email already registered", statusCode: 409 },
  PHONE_ALREADY_EXISTS: { message: "Phone already registered", statusCode: 409 }, // قرار C-1 (phone فريد)
  INVALID_CREDENTIALS:  { message: "Invalid email or password", statusCode: 401 },
  USER_NOT_FOUND:       { message: "User not found", statusCode: 404 },
  FORBIDDEN:            { message: "You are not allowed to access this user", statusCode: 403 },
} as const;
```

---

## 6. قواعد العمل (Business Rules)

- الإيميل فريد → محاولة تكرار = `409`.
- الـ password يُخزَّن hash فقط، ولا يظهر (ولا `refreshToken`) في أي response إطلاقًا.
- `adminLogin` يرفض من ليس `role === ADMIN` (`401`).
- كل مسارات الإدارة محميّة بـ `authenticate` + `authorize("ADMIN")`.
- `refresh` يطابق الـ token المُرسَل مع `User.refreshToken` المخزَّن؛ `logout` يصفّره.
- حذف User يُسقِط Customer المرتبط (`onDelete: Cascade` قائم في الـ schema).

---

## 7. نقاط الالتزام / المخاطر

- ⚠️ مكتبة hashing (`bcrypt` أو `argon2`) **تحتاج إضافة** إلى `package.json` (قرار Auth الكامل).
- ⚠️ **`cookie-parser` تحتاج إضافة** + تفعيلها في [`app.ts`](../../src/app.ts) (التوكنات في الكوكيز).
- ⚠️ **CORS بـ `credentials: true`** لو الفرونت على نطاق مختلف (لإرسال الكوكيز).
- ⚠️ **تعديل `authenticate`** ليقرأ access token من **الكوكي** بدل `Authorization: Bearer`.
- توليد JWT: `jsonwebtoken` + `JWT_SECRET` موجودان. نحتاج تحديد مدد الصلاحية.
  ❓ **سؤال U-5:** مدتا الـ access والـ refresh؟ (مثال: access `15m`، refresh `7d`).
  > 🟡 التوصية: access `15m` + refresh `7d`. ✅ القرار: ممتازة التوصية
- ⚠️ **cart/order:** سيُستبدل `TEST_CUSTOMER_ID` بـ `req.user.id` فيهما (نتيجة Auth الكامل + #4) —
  يُنفَّذ ويُختبر ضمن نفس مسار العمل (راجع consequences في الملف المشترك).
- helpers الـ JWT/hashing/cookies المشتركة في `src/shared/auth/`.
- إضافة side-effect import للـ `user.validation` في `document.ts`.
- إلغاء تعليق `router.use("/users", userRouter)` + ربط راوتر `auth` في `routes/index.ts`.

---

## 8. 🔍 مراجعة مقابل Group-1-Team-1 (فرع `feature/user-management`)

عند Group-1، موديول user هو فعليًا **لوحة تحكم الموظفين/الإدارة (dashboard auth)**، منفصل عن
مصادقة العميل (التي في موديول customer). ملاحظات مقتبَسة:

- **الـ endpoints لديهم (للإدارة):**
  - `POST /auth/login` — لكن **مقيَّد**: يرفض إن لم يكن `userTypeCode === ADMIN` وله `role`.
  - `POST /auth/refresh-token` — تجديد access عبر refresh مخزَّن بالـ DB.
  - `POST /auth/forgot-password` + `POST /auth/reset-password` — عبر إيميل (reset token).
  - `POST /auth/logout` + `POST /auth/change-password` (محميّة).
  - `GET/POST/PATCH/DELETE /users` — محميّة بـ `requireRole(SUPER_ADMIN[, ADMIN])`؛
    إنشاء/حذف المستخدم لـ SUPER_ADMIN فقط، وإنشاء المستخدم **يُسند له `role`**.
  - `GET/PATCH /profile` — للمستخدم نفسه.
- **قرارات تؤثر علينا:**
  - **forgot-password صامت** (لا يكشف إن كان الإيميل موجودًا) — ممارسة أمان جيدة ضد user enumeration. نتبنّاها لو نفّذنا reset.
  - فصل `UserType` (customer/admin) عن `Role` (أدوار الموظفين) — يفسّر لماذا login الإدارة يتحقق من النوع.
  - **refresh token rotation + تخزينه بالـ DB** → راجع سؤال مشترك #6.
- **ما لا نقتبسه:** بنيتهم (controllers/services كـ classes، Int IDs، `nativeEnum`).
  عندنا نلتزم singletons + `cuid` + Zod `z.enum`.

### تحديث على توصياتنا بناءً على المراجعة:
1. **سؤال U-2 (الأدوار):** يتقاطع مع سؤال مشترك #8 الجديد (enum على User مقابل جداول RBAC).
   توصيتنا تبقى: enum بسيط الآن.
2. **مصادقة الموظفين مقابل العميل:** يُحسم عبر سؤال مشترك #7. لو تبنّينا الفصل، فهذا الملف
   (user) يصبح **للإدارة فقط** (CRUD مستخدمين + ملف شخصي للموظف)، وتنتقل مصادقة العميل
   (register/login) إلى [`02-customer.plan.md`](./02-customer.plan.md).
3. **مدة الـ token (سؤال U-5):** Group-1 يفصل access (قصير) عن refresh — لو اخترنا access-only
   نضبط `expiresIn` معقولًا (مثل `1d`).

❓ **سؤال U-6:** هل ننفّذ forgot/reset/change password في هذه الجولة (كـ Group-1) أم نؤجّلها؟
(تتطلب إرسال بريد — لا توجد بنية بريد في مشروعنا حاليًا، وقد نستخدم Gmail connector لاحقًا.)
> 🟡 التوصية: تأجيلها — نبدأ بـ register/login فقط، وreset لاحقًا عند توفّر إرسال البريد.
> ✅ القرار: تأجيل
