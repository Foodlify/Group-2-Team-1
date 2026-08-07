# خطة مشتركة — قرارات شاملة تؤثر على الموديولات الثلاثة (User / Customer / Restaurant-Menu)

> هذا الملف يجمع القرارات «العابرة للموديولات» (Cross-cutting) لأن إجابتها تُغيّر تصميم
> الملفات الثلاثة دفعةً واحدة. **اقرأه أولاً** قبل ملفات الموديولات، وأجب على الأسئلة
> الموجودة هنا لأنها أساس باقي التخطيط.
>
> **طريقة الإجابة:** اكتب إجابتك أسفل كل سؤال في سطر يبدأ بـ `> ✅ القرار:` — وأنا
> سأحدّث باقي الملفات بناءً عليها.

---

## ملخص الوضع الحالي (مأخوذ من الكود فعليًا)

| العنصر                                                                         | الحالة الحالية في المشروع                                                                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| المعمارية                                                                      | Layered Modular — كل موديول 6 ملفات: `routes / validation / controller / service / repository / model`                                            |
| الـ Repository                                                                 | يرث من [`BaseRepository`](../../src/shared/repositories/base.repository.ts) ويُمرّر الـ delegate في الـ constructor — CRUD فقط بلا business logic |
| الـ Service                                                                    | كل الـ business logic + الـ authorization، يرمي [`AppError`](../../src/middlewares/error.middleware.ts) للأخطاء المعروفة                          |
| الـ Controller                                                                 | HTTP فقط (`asyncHandler`)، لا يلمس Prisma ولا الـ repository مباشرة                                                                               |
| الـ Validation                                                                 | Zod schemas مع `.meta({ id })` ومُسجَّلة في `schemaRegistry`                                                                                      |
| الـ Routes                                                                     | تُسجِّل توثيق OpenAPI عبر `routeRegistry.push(...)`                                                                                               |
| شكل الـ Response                                                               | نجاح: `{ success: true, data }` — خطأ: `{ success: false, message }`                                                                              |
| الأخطاء المشتركة                                                               | تُجمَّع في [`src/shared/exceptions/`](../../src/shared/exceptions/) (مثل `cart.errors.ts`)                                                        |
| الـ Auth                                                                       | `auth.middleware.ts` (JWT) **موجود لكن غير مُفعَّل**. الموديولات الحالية (cart/order) تقرأ `customerId` من `process.env.TEST_CUSTOMER_ID` مؤقتًا  |
| الموديولات المُفعَّلة فعليًا في [`routes/index.ts`](../../src/routes/index.ts) | `cart`, `order` فقط                                                                                                                               |

### ⚠️ ملاحظة جوهرية على الـ schema الحالي

نموذج `User` في [`schema.prisma`](../../prisma/schema.prisma) حاليًا **بسيط جدًا**:

```prisma
model User {
  id    String @id @default(cuid())
  name  String
  email String @unique
  customer Customer?
  ...
}
```

- **لا يوجد حقل `password`** → لا يمكن عمل login حقيقي دون تعديل الـ schema.
- **لا يوجد حقل `role`** → لكن `auth.middleware.ts` يتوقّع `JwtPayload { id, email, role }`،
  و `authorize(...roles)` يعتمد على دور غير موجود في قاعدة البيانات.
- نماذج `userType` / `userRole` / `role` المذكورة في `ARCHITECTURE.md` **غير موجودة فعليًا**
  في الـ schema (طموحات توثيقية فقط).

هذا يعني أن أي قرار يخص الـ auth/roles سيتطلب **migration على الـ schema**.

---

## ❓ سؤال مشترك #1 — نطاق المصادقة (Authentication Scope)

هذا أهم قرار، ويحدد شكل موديول User بالكامل.

- **الخيار A — تنفيذ Auth كامل الآن:**
  إضافة حقل `password` (مُشفَّر بـ bcrypt/argon) إلى `User` + endpoints لـ
  `register` و `login` تُصدر JWT، ثم تفعيل `authenticate` middleware على كل المسارات
  المحمية، واستبدال `TEST_CUSTOMER_ID` بـ `req.user.id`.
  - ✔️ يجعل النظام واقعيًا وقابلًا للاستخدام الحقيقي.
  - ✖️ أكبر حجمًا، يلمس cart/order الحاليين (استبدال `TEST_CUSTOMER_ID`)، يحتاج
    مكتبة hashing جديدة (`bcrypt`/`argon2` غير موجودة في `package.json`).

- **الخيار B — CRUD فقط بدون Auth (المتوافق مع النمط الحالي):**
  بناء User/Customer/Restaurant-Menu كـ CRUD endpoints، والإبقاء على نمط
  `TEST_CUSTOMER_ID` كما هو في cart/order، وتأجيل الـ login/JWT لمرحلة لاحقة.
  - ✔️ متّسق مع ما هو قائم، أصغر، لا يكسر cart/order.
  - ✖️ يبقى النظام بلا تسجيل دخول حقيقي.

- **الخيار C — حل وسط:** تنفيذ `register` + `login` + `authenticate` فقط (auth أساسي)
  دون أدوار (roles)، وتفعيله تدريجيًا على الموديولات الجديدة فقط مع إبقاء cart/order
  على `TEST_CUSTOMER_ID` مؤقتًا حتى لا نكسرهما في نفس الـ PR.

> 🟡 **التوصية المبدئية:** الخيار C (auth أساسي بدون أدوار) لأنه يوازن بين الواقعية وعدم
> كسر الموجود. لكن القرار لك.
>
> ✅ القرار: A

---

## ❓ سؤال مشترك #2 — نظام الأدوار (Roles / Authorization)

موديول Restaurant/Menu يحتاج تمييزًا بين «من يتصفّح» (customer) و«من يُدير» (admin/owner).
لا يوجد حقل `role` حاليًا.

- **الخيار A — إضافة `enum Role { CUSTOMER, ADMIN }` (أو `RESTAURANT_OWNER`) إلى `User`:**
  يتيح حماية endpoints الإدارة بـ `authorize("ADMIN")`.
- **الخيار B — بدون أدوار الآن:** جعل endpoints الإدارة (إنشاء/تعديل المطاعم والقوائم)
  مفتوحة مؤقتًا أو مؤجَّلة، وكشف القراءة (GET) فقط للعملاء.
- **الخيار C — أدوار مبسّطة عبر `isAdmin Boolean @default(false)` على `User`** بدل enum.

> 🟡 **التوصية المبدئية:** الخيار A بـ `enum Role { CUSTOMER, ADMIN }` — أنظف وأكثر قابلية
> للتوسعة، ومتوافق مع `authorize()` الموجود.
>
> ✅ القرار: A

---

## ❓ سؤال مشترك #3 — هل ننشئ موديول `auth` منفصل أم ندمجه في `user`؟

- **الخيار A — موديول `auth` مستقل** (`src/modules/auth/`) يحوي `register/login/me`،
  ويبقى `user` للـ CRUD الإداري. أوضح فصلًا للمسؤوليات (`/api/v1/auth/*`).
- **الخيار B — كل شيء داخل `user`** تحت مسارات `/api/v1/users/auth/*` أو ما شابه.

> 🟡 **التوصية المبدئية:** الخيار A (موديول auth منفصل) — متوافق مع وصف الـ OpenAPI
> الحالي الذي يذكر «JWT obtained from /auth/login». _(يُطبَّق فقط لو اخترت Auth في سؤال #1)_
>
> ✅ القرار: A → ⚠️ **عُدِّل لاحقًا** (راجع «🎓 تحديثات المعلم»): لا موديول auth مستقل — **كل الـ auth داخل موديول `user`**.

---

## ❓ سؤال مشترك #4 — هوية «المستخدم الحالي» في الموديولات الجديدة

طالما قد نبقى بلا auth كامل، كيف يحصل الـ controller على هوية المستخدم؟

- **الخيار A —** الإبقاء على `getCurrentCustomerId()` التي تقرأ `TEST_CUSTOMER_ID`
  (نفس نمط cart/order الحالي) حتى يجهز الـ auth.
- **الخيار B —** استخدام `req.user.id` من `authenticate` middleware مباشرة (يتطلب اختيار
  Auth في سؤال #1).

> ✅ القرار: B _(عادةً يتبع قرار سؤال #1)_

---

## ❓ سؤال مشترك #5 — توحيد شكل الـ Response

يوجد نمطان في المشروع:

1. الـ controllers الحالية تكتب `res.json({ success: true, data })` يدويًا.
2. يوجد helper غير مُستخدَم [`sendSuccess` / `sendError`](../../src/utils/response.ts).

- **الخيار A —** اتّباع النمط السائد فعليًا (كتابة `res.status().json({ success, data })` يدويًا)
  للاتساق مع cart/order.
- **الخيار B —** البدء باستخدام `sendSuccess/sendError` في الموديولات الجديدة.

> 🟡 **التوصية:** الخيار A للاتساق مع الكود القائم.
>
> ✅ القرار: B

---

## ملاحظات فنية صغيرة (للتأكيد فقط، أولوية منخفضة)

1. **`cuid()` مقابل `z.cuid2()`:** الـ schema يستخدم `@default(cuid())` بينما الـ validation
   تستخدم `z.cuid2()`. الموديولات الحالية تعمل بهذا، لكن يُفضَّل التأكد أن صيغة الـ IDs المولّدة
   تمر فعلًا عبر `z.cuid2()` قبل الاعتماد عليها في الموديولات الجديدة. (إن لم تمر، نستخدم
   `z.string().min(1)` للـ params.)
2. **تسجيل الـ validation في OpenAPI:** أي ملف `*.validation.ts` جديد يجب إضافته كـ
   side-effect import في [`src/openapi/document.ts`](../../src/openapi/document.ts) وإلا لن تظهر
   مخططاته في `/openapi.json`.
3. **تفعيل الموديول:** أي موديول جديد يجب ربطه في [`src/routes/index.ts`](../../src/routes/index.ts)
   عبر `router.use("/<entities>", <entity>Router)`.

---

## قائمة الالتزام بقواعد المشروع (Checklist تُطبَّق على كل موديول)

- [ ] الـ 6 ملفات كاملة لكل موديول مكشوف.
- [ ] الـ repository يرث `BaseRepository` ولا يحوي business logic.
- [ ] الـ controller لا يستدعي الـ repository/Prisma مباشرة — فقط عبر الـ service.
- [ ] كل خطأ معروف عبر `AppError(message, statusCode)` مع كتالوج في `shared/exceptions`.
- [ ] كل Zod schema لها `.meta({ id })` ومُسجَّلة في `schemaRegistry` (بدون تكرار اسم).
- [ ] كل route موثَّق في `routeRegistry`.
- [ ] إضافة side-effect import للـ validation في `document.ts`.
- [ ] ربط الـ router في `routes/index.ts`.
- [ ] شكل الـ response موحّد `{ success, data }` / `{ success, message }`.
- [ ] أي تعديل schema يتبعه `db:migrate` ثم `db:generate`.

---

## 🔍 مراجعة مقابل مشروع Group-1-Team-1 (تنفيذ فعلي لنفس النطاقات)

> راجعنا فروع `feature/user-management` / `feature/customer-management` /
> `feature/restaurant-menu-management` في `Foodlify/Group-1-Team-1`. هي **تنفيذ كامل**
> (وليست تخطيطًا)، ونقتبس منها **قرارات الأعمال** فقط — لا معماريتها (هم: `Int autoincrement`،
> `prisma-client-js`، مجلدات PascalCase، classes؛ نحن: `cuid`، نمط 6 ملفات، `BaseRepository`،
> Zod/OpenAPI). الفروق المعمارية مقصودة ولا نغيّرها.

**كيف أجاب Group-1 على أسئلتنا المشتركة:**

| سؤالنا           | قرارهم الفعلي                                                                                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1 نطاق الـ Auth | Auth **كامل** مع **access + refresh tokens**؛ الـ refresh مخزَّن في `User.refreshToken`، يُدوَّر ويُلغى عند logout/revoke. + forgot/reset/change password عبر إيميل                                                                            |
| #3 موديول auth   | **فصل حسب الجمهور**: مصادقة العميل (storefront) داخل موديول customer، ومصادقة الموظفين/الإدارة (dashboard) داخل موديول user — **لا موديول `auth` واحد**                                                                                        |
| #2 الأدوار       | **RBAC بجداول**: `UserType` (customer/admin) + `Role` (enum: SUPER_ADMIN, ADMIN, RESTAURANT_OWNER, CUSTOMER_SERVICE) + `UserRole` + middleware `requireRole(...)`. التمييز: **UserType** يفصل العميل عن الموظف، و**Role** للأدوار الإدارية فقط |
| #4 هوية المستخدم | مصادقة حقيقية (`authValidator` للعميل، `authDashboard` للوحة) — بلا `TEST_CUSTOMER_ID`                                                                                                                                                         |

### قرارات جديدة ظهرت من مراجعتهم (تحتاج حسمًا):

❓ **سؤال مشترك #6 — Access token فقط أم Access + Refresh؟**
Group-1 اعتمد **access قصير + refresh مخزَّن بالـ DB** (logout/revoke حقيقي). خطتنا الحالية
افترضت JWT واحدًا فقط.

- **الخيار A —** access token واحد فقط (أبسط، بلا حقل refresh، بلا logout حقيقي).
- **الخيار B —** access + refresh (مثل Group-1): يضيف حقل `refreshToken String?` إلى `User`،
  و endpoints لـ `refresh` و`logout`/`revoke`.
  > 🟡 التوصية: الخيار A لهذه الجولة (أصغر وكافٍ)، والترقية لـ B لاحقًا — إلا إن أردت تكافؤ ميزات Group-1.
  > ✅ القرار: B

❓ **سؤال مشترك #7 — فصل مصادقة العميل عن مصادقة الإدارة (نموذج Group-1)؟**
بدل سؤالنا #3 (موديول auth واحد)، نموذج Group-1 يفصل: customer-auth داخل موديول customer،
staff/admin-auth داخل موديول user. هذا يلائم وجود لوحتين (storefront مقابل dashboard).

- **الخيار A —** نتبنّى الفصل (customer register/login داخل customer، وuser للإدارة) — يلائم مشروعنا (Customer منفصل عن User).
- **الخيار B —** موديول `auth` موحّد (سؤال #3 الأصلي).
  > 🟡 التوصية: الخيار A — أنظف ويستفيد من فصل `User`/`Customer` الموجود في schema مشروعنا.
  > ✅ القرار: B → ⚠️ **عُدِّل لاحقًا** (راجع «🎓 تحديثات المعلم»): الـ auth بقسميه (customer + admin) **داخل موديول `user`**، وموديول customer بلا auth.

❓ **سؤال مشترك #8 — هيكل الأدوار: enum على User أم جداول RBAC؟**
سؤالنا #2 اقترح `enum Role` على `User`. Group-1 فضّل **جداول** (`UserType`/`Role`/`UserRole`).

- **الخيار A —** `enum Role` بسيط على `User` (يكفي لتمييز ADMIN، أقل migrations).
- **الخيار B —** جداول RBAC كاملة (أقوى وأكثر توسعًا، أثقل).
  > 🟡 التوصية: الخيار A الآن (يكفي حاجتنا: حماية endpoints الإدارة)، والترقية لجداول عند الحاجة لأدوار متعددة.
  > ✅ القرار: A

### ميزات عند Group-1 خارج نطاقنا الحالي (للعلم فقط — قد تكون أعمالًا لاحقة):

refresh tokens، forgot/reset password بالإيميل، مخزون (`MenuItem.stock`)، Redis لكاش
العربة/المطاعم، loyalty points، support tickets، restaurant rates، Stripe.

---

## ✅ القرارات النهائية المعتمدة (بعد المراجعة التفاعلية — 2026-05-31)

> هذه هي **مصدر الحقيقة**. تُلغي أي تفسير سابق متضارب في أسطر `> ✅ القرار` الفردية أعلاه.
> حُسم تعارض ظهر بين «فصل admin-auth» و«بدون أدوار» بإعادة إدخال `enum Role`.

| #                     | القرار النهائي                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#1 نطاق Auth**      | **Auth كامل** — `password` على `User` (hashed) + register/login + تفعيل `authenticate` على المسارات المحمية                                                                                                     |
| **#2 / #8 الأدوار**   | **`enum Role { CUSTOMER, ADMIN }`** على `User` (`@default(CUSTOMER)`) — لا جداول RBAC                                                                                                                           |
| **#3 / #7 هيكل auth** | ⚠️ **عُدِّل بإجابة المعلم** ↓ (راجع قسم «🎓 تحديثات بناءً على إجابات المعلم»): **كل الـ auth — customer + admin — داخل موديول `user`** («User Management»). لا موديول `auth` منفصل، وموديول `customer` بلا auth |
| **#6 Tokens**         | **Access + Refresh** — حقل `refreshToken String?` على `User` + endpoints لـ refresh و logout/revoke                                                                                                             |
| **#4 الهوية**         | **`req.user.id`** من `authenticate` middleware (لا `TEST_CUSTOMER_ID` في الجديد)                                                                                                                                |
| **#5 Response**       | **`sendSuccess` / `sendError`** — مع **توسعة الـ helper بباراميتر `meta` اختياري** لدعم القوائم المُرقّمة                                                                                                       |

### تعديل لازم على الـ schema (migration واحد يجمعها):

```prisma
enum Role { CUSTOMER  ADMIN }

model User {
  id           String  @id @default(cuid())
  name         String
  email        String  @unique
  password     String          // ← جديد (hashed)
  role         Role    @default(CUSTOMER)   // ← جديد
  refreshToken String?         // ← جديد (للـ refresh/revoke)
  customer     Customer?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

### consequences / متابعات لازمة (نتيجة Auth الكامل + req.user.id):

1. ⚠️ **cart & order يتأثران:** يجب تعديل `getCurrentCustomerId()` في
   [`cart.controller.ts`](../../src/modules/cart/cart.controller.ts) و
   [`order.controller.ts`](../../src/modules/order/order.controller.ts) لقراءة العميل من
   `req.user` بدل `TEST_CUSTOMER_ID`. (يخالف تحذير «عدم كسر cart/order» السابق — لكنه نتيجة
   مقصودة لاختيار Auth الكامل.) يُنفَّذ ضمن نفس مسار العمل ويُختبر.
2. **توسعة `sendSuccess`:** إضافة باراميتر `meta?` ليُخرج `{ success, message, data, meta }`
   (القوائم المُرقّمة في users/customers/restaurants تحتاجه).
3. **بنية auth مشتركة:** helpers الـ JWT (sign/verify access+refresh) وتجزئة كلمة المرور
   (hash/compare) توضع في مكان مشترك (مثل `src/shared/auth/` أو `src/utils/`) ويستخدمها
   موديولا customer و user معًا. مكتبة hashing (`bcrypt`/`argon2`) **تحتاج إضافة** لـ `package.json`.
4. **`authenticate` middleware** الموجود يُفعَّل؛ و `authorize("ADMIN")` يحمي مسارات الإدارة.
   الـ `JwtPayload { id, email, role }` الحالي متوافق مع القرار.

### توزيع المسؤوليات (مُحدَّث بعد إجابات المعلم):

- **موديول `user`** → **كل الـ Auth** (customer-auth: register/login/logout/forgot/reset، و admin-auth: login/refresh/logout)
  **+** إدارة المستخدمين (CRUD محميّ بـ `authorize("ADMIN")`). الـ register يُنشئ `User(role=CUSTOMER)` + `Customer` في transaction.
- **موديول `customer`** → بيانات العميل فقط: ملفه الشخصي (`me`) + عناوينه + سجل طلباته. **بلا auth**.
- **لا موديول `auth` مستقل** — الـ auth داخل موديول user (نموذج «User Management» الذي حدّده المعلم).

---

## 🎓 تحديثات بناءً على إجابات المعلم (2026-05-31)

> هذه الإجابات **تُعدِّل** بعض القرارات أعلاه. الأولوية لها.

| الموضوع                      | إجابة المعلم               | الأثر على التخطيط                                                                                              |
| ---------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **توصيل التوكنات**           | **Cookie** (لا `res.json`) | ❌ كان مخططًا في الـ body — يُصحَّح إلى **httpOnly cookies** عبر `res.cookie` لكلا التوكنين (access + refresh) |
| **مكان الـ Auth**            | في **User Management**     | ❌ كان customer-auth مخططًا في موديول customer — **يُنقَل كله إلى موديول `user`**                              |
| **أقسام الـ Auth**           | Customer + Admin           | ✅ مطابق (لكن كلاهما الآن داخل موديول user)                                                                    |
| **أدوار User**               | الأدوار ليست شأن customer  | ✅ يبقى `enum Role { CUSTOMER, ADMIN }`، لكن إدارتها في user لا customer                                       |
| **Order History / Tracking** | المكتملة / حالة الطلب      | ✅ في موديول `order` الحالي — لا يمسّ الملفات الثلاثة                                                          |

### consequences إضافية للكوكيز (يجب تنفيذها):

1. **`res.cookie`** لإصدار access + refresh كـ **httpOnly** (و`secure` في production، `sameSite`).
2. **تعديل `authenticate` middleware** ([`auth.middleware.ts`](../../src/middlewares/auth.middleware.ts)):
   يقرأ الـ access token من **الكوكي** بدل `Authorization: Bearer` (أو يدعم الاثنين).
3. **`cookie-parser`** — مكتبة **غير موجودة** في `package.json` → تحتاج إضافة + تفعيلها في [`app.ts`](../../src/app.ts).
4. **CORS** بـ `credentials: true` + ضبط الـ origin (لو الفرونت على نطاق مختلف).
5. **logout** = مسح الكوكيز (`res.clearCookie`) + تصفير `User.refreshToken`.
6. الـ response body لم يعد يحمل التوكنات — يكتفي بـ `{ success, message, data: { user } }` والتوكنات في الكوكيز.
