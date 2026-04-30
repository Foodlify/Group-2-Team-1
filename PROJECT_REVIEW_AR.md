# مراجعة المشروع - تحديث بعد الإصلاحات

تاريخ المراجعة: 2026-04-30

## نطاق المراجعة

تمت مراجعة المشروع مرة أخرى بعد إصلاح نقاط `TEST_CUSTOMER_ID`, seed output, التوثيق، تحقق وجود العميل، واستجابة السلة الفارغة. لم أعد أتعامل مع عدم تفعيل المصادقة كنقطة عيب لأنك طلبت سابقاً تجاوزها، لكنني أدرجت مشاكل البناء لأنها تمنع تشغيل المشروع بشكل إنتاجي.

## نتيجة الفحوصات

| الفحص | النتيجة |
| --- | --- |
| `npm run db:generate` | ناجح |
| `npx prisma validate` | ناجح |
| `npm run db:migrate:deploy -- --schema prisma/schema.prisma` | ناجح ولا توجد migrations معلقة |
| `npx prisma db seed` | ناجح ويطبع `customerId` |
| فحص `TEST_CUSTOMER_ID` في قاعدة البيانات | ناجح: القيمة الحالية موجودة في جدول `Customer` |
| `docker compose config` | ناجح |
| `npm run build` | فاشل: لا يوجد سكربت `build` |
| `npx tsc --noEmit --pretty false` | فاشل بسبب repositories لنماذج غير موجودة في Prisma schema |
| `npm test` | فاشل لأن سكربت الاختبار غير مفعّل |

## ما تم إصلاحه

- `TEST_CUSTOMER_ID` في `.env` أصبح يشير إلى `Customer.id` موجود فعلاً في قاعدة البيانات.
- `prisma/seed.ts` أصبح يطبع `customerId` صراحة، مع `userId` و `userEmail` كمعلومات إضافية.
- `README.md`, `docs/troubleshooting.md`, و `docs/ARCHITECTURE.md` لم تعد تشير إلى `TEST_USER_ID` في سياق السلة.
- `CartService` يتحقق الآن من وجود العميل ويرجع `404 Customer not found` بدلاً من الاعتماد على خطأ قاعدة البيانات.
- استجابة السلة الفارغة أصبحت `data: null`، و `CartSuccessResponseSchema` يسمح بذلك.
- شرط `max(100)` أزيل من request validation الخاص بالسلة.

## الملاحظات الحالية حسب الأولوية

### 1. حرج: TypeScript build ما زال مكسوراً بسبب عدم تطابق Prisma schema مع repositories

`prisma/schema.prisma:15-134` يحتوي حالياً على 8 نماذج فقط: `User`, `Customer`, `Address`, `Restaurant`, `Menu`, `MenuItem`, `Cart`, `CartItem`.

لكن توجد repositories تشير إلى Prisma delegates غير موجودة، مثل:

- `src/modules/auditingEvent/auditingEvent.repository.ts:5`
- `src/modules/order/order.repository.ts:5`
- `src/modules/transaction/transaction.repository.ts:5`
- وأيضاً وحدات `OrderItem`, `OrderStatus`, `OrderTracking`, `Payment*`, `PreferredPaymentSetting`, `TransactionDetails`, `TransactionStatus`

الأثر: `npx tsc --noEmit` يفشل، و `Dockerfile:20` سيفشل عند `RUN npx tsc`.

التوصية: إمّا إعادة هذه النماذج إلى `schema.prisma`، أو إخراج repositories غير المدعومة من `src` إلى أن تعود نماذجها.

### 2. حرج: لا يوجد مسار build/start إنتاجي واضح

في `package.json:13-15`:

```json
"start": "ts-node src/server.ts",
"test": "echo \"Error: no test specified\" && exit 1"
```

لا يوجد سكربت `build`، و `start` يعتمد على `ts-node` الموجود في `devDependencies`. هذا لا يناسب تشغيل production install.

الأثر: `npm run build` يفشل مباشرة، و `npm start` لن يعمل إذا تم تثبيت الحزم بـ `npm ci --omit=dev`.

التوصية: إضافة:

```json
"build": "tsc",
"start": "node dist/server.js"
```

مع إبقاء `dev` للتطوير فقط.

### 3. عالي: Dockerfile غالباً سيفشل في build

في `Dockerfile:12-14` يتم تشغيل `npm ci`، و `package.json:16` يشغل `postinstall` الذي ينفذ `prisma generate`. داخل Docker build لا يتم نسخ `.env` بسبب `.dockerignore`، ولا توجد `DATABASE_URL` معرفة في مرحلة `deps`.

حتى لو تم تجاوز هذه النقطة، سيصل البناء إلى `Dockerfile:20` ويفشل بسبب TypeScript errors المذكورة في الملاحظة الأولى.

التوصية: تعريف `DATABASE_URL` dummy وقت build أو تعطيل scripts في مرحلة تثبيت الحزم ثم تشغيل `prisma generate` بعد توفير env مناسب، بالتوازي مع إصلاح TypeScript build.

### 4. عالي: `CartItem.price/name` ما زالا غير مستخدمين في حساب/عرض السلة

`CartItem` يحتفظ بـ `price` و `name` في `prisma/schema.prisma:117-123`، ويتم حفظهما عند الإضافة في `src/modules/cart/cart.service.ts:133-141`.

لكن `toCartResponse` يستخدم السعر والاسم من `menuItem` الحالي في `src/modules/cart/cart.service.ts:170-191`.

الأثر: إذا تغير سعر عنصر القائمة بعد إضافته للسلة، إجمالي السلة سيتغير بأثر رجعي رغم وجود snapshot محفوظ.

التوصية: إذا المطلوب تثبيت السعر وقت الإضافة، استخدم `CartItem.price/name` في response والحساب. إذا المطلوب السعر الحالي، احذف حقول snapshot أو وثق السلوك.

### 5. متوسط: إعدادات البيئة لا تتحقق من القيم بشكل صارم

في `src/config/env.ts:12-16`:

```ts
PORT: Number(process.env.PORT) || 3000
```

لو `PORT` قيمة غير رقمية سيعود التطبيق إلى `3000` بصمت. كذلك `NODE_ENV` يقبل أي string.

الأثر: أخطاء الإعداد قد تمر بدون تنبيه، وقد يعمل التطبيق على port غير متوقع.

التوصية: استخدام Zod للتحقق من `PORT`, `NODE_ENV`, `DATABASE_URL`, و `JWT_SECRET` برسائل startup واضحة.

### 6. متوسط: server lifecycle يحتاج معالجة أوضح للأخطاء

في `src/server.ts:11-13` لا يوجد `server.on("error")` لمعالجة أخطاء مثل `EADDRINUSE`.

وفي `src/server.ts:16-48` يمكن استدعاء `shutdown` أكثر من مرة عبر `SIGTERM`, `SIGINT`, `unhandledRejection`, و `uncaughtException`.

الأثر: رسائل فشل التشغيل أو الإغلاق قد تكون غير واضحة، وقد تتكرر عمليات الإغلاق.

التوصية: إضافة handler لأخطاء server، وإضافة flag مثل `isShuttingDown` لمنع تكرار shutdown.

### 7. متوسط: `docker-compose.yml` يشغل قاعدة البيانات فقط

`docker-compose.yml:1-22` يحتوي service واحد لـ `postgres` فقط. هذا صالح كـ local database compose، لكنه لا يشغل التطبيق.

الأثر: من يتوقع أن `docker compose up` يشغل النظام كاملاً لن يحصل إلا على PostgreSQL.

التوصية: إما إضافة service للتطبيق، أو توثيق أن compose مخصص لقاعدة البيانات المحلية فقط.

### 8. متوسط: OpenAPI description أوسع من المسارات الفعلية

`src/openapi/document.ts:26-29` يصف API يحتوي users, restaurants, menus, carts, orders, payments. لكن `src/routes/index.ts` يركب مسار `/carts` فقط حالياً.

الأثر: التوثيق يعطي توقعات أعلى من السطح الفعلي للـ API.

التوصية: تعديل الوصف ليعكس المتاح حالياً، أو إضافة توضيح أن بقية الموارد مخططة وليست منشورة بعد.

### 9. متوسط: لا توجد اختبارات قابلة للتشغيل

`package.json:15` ما زال يفشل عمداً:

```json
"test": "echo \"Error: no test specified\" && exit 1"
```

ومجلد `tests` لا يحتوي ملفات.

الأثر: لا يوجد ضمان آلي لتدفقات السلة المهمة مثل إنشاء السلة، السلة الفارغة، عميل غير موجود، وإضافة نفس العنصر أكثر من مرة.

التوصية: إضافة Vitest أو Jest، والبدء باختبارات `CartService`.

## الأولوية المقترحة

1. توحيد `schema.prisma` مع repositories أو حذف repositories غير المدعومة.
2. إضافة `build` وتعديل `start` لتشغيل `dist/server.js`.
3. إصلاح Docker build path بعد ضبط build.
4. حسم سياسة سعر السلة: snapshot أم السعر الحالي.
5. تشديد تحقق البيئة وتحسين lifecycle للـ server.
6. إضافة اختبارات خدمة السلة.
