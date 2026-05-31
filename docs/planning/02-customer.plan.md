# خطة موديول: Customer

> اقرأ أولًا [`00-shared-concerns.plan.md`](./00-shared-concerns.plan.md) و
> [`01-user.plan.md`](./01-user.plan.md) — موديول Customer يعتمد على قرارات الـ Auth وعلى User.
>
> **طريقة الإجابة:** ضع قرارك أسفل كل سؤال في سطر `> ✅ القرار:`.

---

## 1. الغرض والنطاق

`Customer` هو الوجه «الشرائي» للمستخدم. مرتبط **1:1** بـ `User`، ويملك:
`cart?` (عربة واحدة)، `addresses[]` (عناوين)، `orders[]` (طلبات).

```prisma
model Customer {
  id        String   @id @default(cuid())
  userId    String   @unique
  cart      Cart?
  addresses Address[]
  orders    Order[]
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  ...
}
```

**الوضع الحالي في الكود:**
- [`customer.service.ts`](../../src/modules/customer/customer.service.ts) — فيه `findById` فقط (يستخدمه cart/order للتحقق من وجود العميل).
- [`customer.repository.ts`](../../src/modules/customer/customer.repository.ts) — `findById` فقط.
- [`customer.model.ts`](../../src/modules/customer/customer.model.ts) — فارغ.
- لا يوجد `controller / routes / validation`، والموديول غير مكشوف في `routes/index.ts`.

> ملاحظة: الموديول يُستخدَم حاليًا **داخليًا فقط** (من cart/order). كشفه عبر HTTP هو الجديد.

> 🎓 **مُحدَّث بعد إجابات المعلم:** هذا الموديول **بلا auth**. كل الـ auth (بما فيها register/login
> العميل) انتقل إلى موديول [`user`](./01-user.plan.md) («User Management»). يبقى هنا: **ملف العميل
> (`me`) + عناوينه + سجل طلباته**. الهوية تأتي من `req.user.id` بعد المصادقة في موديول user.

---

## 2. هل نحتاج تعديل schema؟

- نموذج `Customer` الحالي كافٍ للحقول الأساسية.
- بيانات «الملف الشخصي» الإضافية (هاتف، صورة...) غير موجودة حاليًا.

❓ **سؤال C-1:** هل نضيف حقولًا للعميل مثل `phone` / `avatarUrl`؟ أم نكتفي بالحالي ونعرض
بيانات `User` (name/email) عبر الـ relation؟
- **الخيار A —** بدون إضافة؛ ملف العميل = `Customer` + `User` المرتبط (name/email) + ملخص.
- **الخيار B —** إضافة `phone String?` (وربما غيره) إلى `Customer` (يتطلب migration).
> 🟡 التوصية: الخيار A الآن (أبسط، بلا migration). نضيف الحقول عند الحاجة الفعلية.
> ✅ القرار: B AND PHONE IS REQUIRED AND UNIQE

**تبعات قرار C-1 (phone مطلوب + فريد) — يجب تنفيذها:**
```prisma
model Customer {
  // ...
  phone String @unique   // ← جديد: مطلوب + فريد
}
```
1. **`RegisterRequestSchema`** (في موديول user) يجب أن يحمل `phone` **مطلوبًا** (لا `phone?`) — يُمرَّر
   لإنشاء `Customer` داخل نفس الـ transaction.
2. **تكرار phone → `409`** (نضيف `PHONE_ALREADY_EXISTS` لكتالوج أخطاء user/customer).
3. ⚠️ **`seed.ts` يجب تحديثه** — حاليًا يُنشئ Customer بلا phone، وسيفشل بعد أن يصير مطلوبًا+فريدًا.
   نضيف phone ثابتًا للعميل المزروع (مثال `"+201000000000"`).
4. ⚠️ **migration:** عمود مطلوب+فريد — سليم على DB نظيفة (`db:migrate`/`db:reset`)؛ على DB فيه عملاء
   حاليون يحتاج backfill قبل فرض `NOT NULL`.
5. `UpdateCustomerRequestSchema` يسمح بتعديل `phone?` مع التحقق من التفرّد.

---

## 3. الـ Endpoints (مُعتمدة) — بلا auth (الهوية من `req.user.id`)

> مُزامَن مع الإجابات: **C-2=1** (me فقط، بلا CRUD إداري للعملاء) · **C-3=A** (العناوين sub-resource) ·
> **C-5** (سجل الطلبات يبقى في موديول order، لا يُكشف هنا).

| Method | Path | الوصف | الحماية |
|---|---|---|---|
| GET | `/api/v1/customers/me` | ملف العميل الحالي (Customer + User + ملخص: عدد الطلبات/العناوين، وجود عربة) | مُصادَق (`req.user.id`) |
| PATCH | `/api/v1/customers/me` | تعديل بيانات العميل (name/phone) | صاحب الحساب |
| GET | `/api/v1/customers/me/addresses` | قائمة عناوين العميل | مُصادَق |
| POST | `/api/v1/customers/me/addresses` | إضافة عنوان | مُصادَق |
| PATCH | `/api/v1/customers/me/addresses/:addressId` | تعديل عنوان | صاحب العنوان |
| DELETE | `/api/v1/customers/me/addresses/:addressId` | حذف عنوان | صاحب العنوان |

> **مؤجَّل (C-2=1):** `GET /customers` و`GET /customers/:id` (إداري) — تُضاف في PR لاحق عند الحاجة.
> **سجل الطلبات (C-5):** لا يُكشف هنا — يبقى في موديول `order` (`GET /orders?status=DELIVERED`).
> **Tracking:** حالة الطلب من موديول order (حقل `status`) — أكّده المعلم.
> **العناوين (C-3=A):** routes/controller/validation في موديول customer، تعيد استخدام
> `addressRepository`/`addressService` الموجودة. تذكّر أن `Order.addressId` يحتاج عنوانًا صالحًا يخص العميل.

❓ **سؤال C-2:** ما نطاق الكشف المطلوب؟
- (1) `me` فقط (الملف الشخصي للعميل الحالي) — الأبسط والأكثر فائدة فورية.
- (2) `me` + CRUD إداري كامل (قائمة + عميل بالـ id).
> 🟡 التوصية: (1) أولًا، وإضافة الإداري لاحقًا مع نظام الأدوار.
> ✅ القرار: 1

❓ **سؤال C-3 — إدارة العناوين (Addresses):**
يوجد موديول مستقل [`address`](../../src/modules/address/) (فيه repository/service/model فقط، بلا routes).
العناوين منطقيًا تابعة للعميل (`Customer.addresses[]`). أين نكشف عمليات العناوين؟
- **الخيار A —** ضمن موديول customer كـ sub-resource: `GET/POST /api/v1/customers/me/addresses`،
  `PATCH/DELETE /api/v1/customers/me/addresses/:addressId`.
- **الخيار B —** موديول address مستقل بمساره الخاص `/api/v1/addresses` (يحتاج ملف تخطيط منفصل).
- **الخيار C —** خارج نطاق هذه الجولة تمامًا (نخطط له لاحقًا).
> 🟡 التوصية: الخيار A (sub-resource تحت customer) لأنه أقرب للنموذج الذهني، أو C لو
> أردت تقليل النطاق الآن. (Order بالفعل يحتاج `addressId` صالحًا، فالعناوين مهمة قريبًا.)
> ✅ القرار: A

❓ **سؤال C-5 — سجل الطلبات (Order History):** هل نكشفه تحت `/customers/me/orders` (غلاف يستدعي
`orderService`) أم نتركه في موديول `order` فقط (`GET /orders?status=DELIVERED`)؟
> 🟡 التوصية: تركه في موديول `order` (مسؤوليته)، وإضافة فلتر `status` هناك — لتجنّب التكرار.
> ✅ القرار: ممتازة التوصية

---

✅ **سؤال C-4 (مكان register/login للعميل):** مُحسوم بعد إجابة المعلم → **في موديول `user`، لا هنا**.
موديول customer **بلا auth**.

## 4. تفصيل ملفات الموديول

### `customer.validation.ts`
- `UpdateCustomerRequestSchema` (الحقول حسب قرار C-1، مثل `{ name?, phone? }`).
- `CustomerIdParamsSchema` { id }، `CustomerQuerySchema` = `PaginationQuerySchema`.
- **Responses:** `CustomerResponseSchema` { id, userId, user: { name, email }, addressesCount, ordersCount, hasCart, createdAt, updatedAt }،
  + `CustomerSuccessResponseSchema`، `CustomerListSuccessResponseSchema`.
- **لا مخططات auth هنا** (انتقلت لموديول user).
- (لو اخترنا C-3 خيار A: مخططات `AddressResponse` / `CreateAddressRequest` / `UpdateAddressRequest`.)

### `customer.repository.ts` (إضافات فوق الموجود)
- `findByUserId(userId)` — لجلب العميل من `req.user.id`.
- `findByIdWithRelations(id)` — `include`/`_count` لعدّ `addresses`/`orders` ووجود `cart`.

### `customer.service.ts` (توسيع الحالي — بلا auth)
- `getMe(userId)` → `findByUserId` → جلب مع العلاقات → `404` → `toCustomerResponse`.
- `updateMe(customerId, input)` → تحديث (وقد يحدّث `User.name`).
- `list(query)` → `findPaginated`. `findById` (موجود، يُبقى لاستخدام cart/order الداخلي — **لا يتغيّر توقيعه**).
- `toCustomerResponse(customer)` helper (computed: addressesCount/ordersCount/hasCart).

### `customer.controller.ts`
- `getMe / updateMe / list / getById` — `asyncHandler`، عبر `sendSuccess/sendError`. (بلا register/login.)

### `customer.routes.ts`
- `validate` + handlers + `authenticate` (يقرأ الكوكي) على `me` + `authorize("ADMIN")` على القوائم + `routeRegistry.push(...)`.

### `customer.model.ts`
- `CustomerWithRelations` (نوع مشتق من Prisma مع `_count` أو الـ includes).

---

## 5. كتالوج الأخطاء — `src/shared/exceptions/customer.errors.ts`

```ts
export const customerErrors = {
  CUSTOMER_NOT_FOUND: { message: "Customer not found", statusCode: 404 },
  FORBIDDEN:          { message: "You are not allowed to access this customer", statusCode: 403 },
} as const;
```

> ملاحظة: حاليًا cart يستخدم `cartErrors.CUSTOMER_NOT_FOUND`. لا نكرّر بلا داعٍ —
> نُبقي رسائل cart كما هي، ونضيف `customer.errors.ts` لاستخدام موديول customer نفسه.

---

## 6. قواعد العمل

- `me` يعتمد على هوية المستخدم الحالي (`req.user.id` → `findByUserId`، أو `TEST_CUSTOMER_ID` مؤقتًا).
- لا يجوز لعميل رؤية/تعديل ملف عميل آخر (عدا ADMIN).
- الحقول المحسوبة (`addressesCount` / `ordersCount` / `hasCart`) تُحسب وقت القراءة (مثل نمط cart's computed fields)، لا تُخزَّن.

---

## 7. نقاط الالتزام / المخاطر

- ⚠️ تماسك مع cart/order: كلاهما يستدعي `customerService.findById` — يجب **عدم تغيير توقيع هذه الدالة**، فقط الإضافة فوقها.
- إضافة side-effect import للـ `customer.validation` في `document.ts`.
- ربط `router.use("/customers", customerRouter)` في `routes/index.ts`.
- لو فُعِّل خيار العناوين (C-3 A): الانتباه أن `Order.addressId` يعتمد على عنوان صالح يخص العميل
  (الـ order service يتحقق غالبًا من ملكية العنوان — يجب مراجعته عند التنفيذ).

---

## 8. 🔍 مراجعة مقابل Group-1-Team-1 (فرع `feature/customer-management`)

عند Group-1، **مصادقة العميل بالكامل تعيش داخل موديول customer** (storefront)، وهذا أهم درس:

- **الـ endpoints لديهم:**
  - `POST /register` — { name, email, password, **phone (مطلوب)**, dob?, gender? } → يُنشئ User+Customer ويُصدر tokens.
  - `POST /login`, `POST /refresh-token`, `POST /forgot-password`,
    `POST /reset-password-from-link`, `POST /change-password`, `POST /logout`,
    `DELETE /refresh-token` (revoke).
  - `POST /log-address` (محمي) — إضافة عنوان.
- **قرارات تؤثر على خطتنا:**
  1. **C-1 (حقول العميل):** Group-1 اختار الإضافة فعليًا → `phone` **فريد ومطلوب** + `dob?` + `gender?`.
     يرجّح تعديل توصيتنا من «بدون إضافة» إلى **إضافة `phone` على الأقل** لو أردنا تكافؤًا واقعيًا.
     ⚠️ لكن `phone` مطلوب/فريد يعني أن `register` يجب أن يجمعه، ويؤثر على seed وعلى migration.
  2. **C-3 (العناوين) — فرق جوهري في الـ schema:** عند Group-1 العنوان **1:1** (`Address.customerId @unique`،
     `Customer.address Address?`) — عنوان واحد لكل عميل عبر `/log-address`. أما schema **مشروعنا**
     فيعرّف `Customer.addresses Address[]` (**متعدد**). إذًا قرارنا في C-3 يجب أن يحترم تعدّد العناوين
     لدينا (CRUD لعناوين متعددة)، لا نسخ نموذجهم الأحادي.
  3. **مكان مصادقة العميل:** Group-1 وضعها داخل customer، لكن **المعلم حسم خلاف ذلك** →
     register/login العميل في موديول **user** («User Management»). لذا هذا الملف **بلا auth**.

### تحديث توصياتنا (بعد إجابات المعلم):
- **C-1:** التوصية → إضافة `phone String?` (اختياريًا أولًا لتفادي كسر seed، أو مطلوبًا+فريدًا
  لمطابقة Group-1). ملاحظة: لو register يجمع `phone`، فهو في موديول user الآن. ✅ القرار: ____________
- **C-3:** نُبقي تعدّد العناوين (`addresses[]`) — CRUD كامل تحت `/customers/me/addresses`، بخلاف نموذج Group-1 الأحادي.
- **register/login:** ليست هنا — في موديول [`user`](./01-user.plan.md) (راجع C-4 المحسوم أعلاه).
