# مراجعة إضافية بدون النقاط السابقة

تاريخ المراجعة: 2026-04-30

## نطاق هذا الملف

هذا ملف جديد لملاحظات إضافية فقط. تم استبعاد النقاط التي تمت مناقشتها سابقاً، ومنها: TypeScript build، المصادقة، `TEST_CUSTOMER_ID`/`TEST_USER_ID`، seed output الخاص بالـ customer، التوثيق المرتبط بهذا المتغير، حد كمية السلة، استجابة السلة الفارغة، سعر `CartItem`، migrations المدمرة، والاختبارات.

## ملاحظات إضافية

### 1. سكربت `start` غير مناسب لتشغيل production package

في `package.json:13`:

```json
"start": "ts-node src/server.ts"
```

لكن `ts-node` موجود في `devDependencies` في `package.json:47`. إذا تم تثبيت الحزم بإعداد إنتاجي مثل `npm ci --omit=dev` فلن يعمل `npm start`.

التوصية: اجعل `start` يشغل النسخة المبنية:

```json
"start": "node dist/server.js"
```

وأضف سكربت منفصل للتطوير مثل `start:dev` أو استخدم `dev` الموجود حالياً.

### 2. إعدادات البيئة لا يتم التحقق منها بشكل صارم

في `src/config/env.ts:12-16` يتم تحويل `PORT` بهذه الطريقة:

```ts
PORT: Number(process.env.PORT) || 3000
```

إذا كانت القيمة غير رقمية، أو فارغة، أو `0`، سيتم استخدام `3000` بصمت. كذلك `NODE_ENV` يقبل أي string بدون حصر للقيم المتوقعة.

الأثر: أخطاء إعدادات البيئة قد تمر بدون تنبيه، وقد يعمل التطبيق على port مختلف عن المتوقع.

التوصية: استخدام Zod أو دالة تحقق صريحة للبيئة، ورفض القيم غير الصالحة برسالة واضحة عند startup.

### 3. سكربتات Prisma تعتمد على إعدادات التطبيق كلها

`src/config/prisma.ts:1-4` يستورد `env` الكامل من `src/config/env.ts`. لذلك أي سكربت يستخدم Prisma عبر هذا الملف يحتاج كل متطلبات التطبيق، حتى لو كان السكربت يحتاج `DATABASE_URL` فقط.

الأثر: seed أو migration helpers قد تفشل بسبب متغيرات غير مرتبطة بقاعدة البيانات. هذا يزيد الترابط بين database tooling وHTTP app configuration.

التوصية: فصل إعداد اتصال Prisma عن إعدادات التطبيق العامة، أو جعل `config/prisma.ts` يعتمد فقط على `DATABASE_URL`.

### 4. `docker-compose.yml` يشغل قاعدة البيانات فقط

في `docker-compose.yml:1-22` يوجد service واحد فقط لـ `postgres`. لا يوجد service لتشغيل التطبيق نفسه.

الأثر: من يقرأ المشروع قد يتوقع أن `docker compose up` يشغل النظام كاملاً، لكنه يشغل قاعدة البيانات فقط. هذا ليس خطأ إذا كان مقصوداً، لكنه يحتاج تسمية أو توثيق واضح.

التوصية: إما إضافة service للتطبيق، أو توضيح أن compose مخصص لقاعدة البيانات المحلية فقط.

### 5. اسم الحاوية ثابت وقد يسبب تعارضات

في `docker-compose.yml:4`:

```yml
container_name: g2t1_postgres
```

الأثر: تشغيل أكثر من نسخة من المشروع، أو فرع آخر بنفس compose، قد يفشل بسبب تعارض اسم الحاوية.

التوصية: حذف `container_name` وترك Docker Compose يولد الاسم، أو جعله قابلاً للتخصيص عبر متغير بيئة.

### 6. التطبيق لا يتعامل صراحة مع فشل `listen`

في `src/server.ts:11-13` يتم تشغيل الخادم عبر `app.listen`. إذا كان المنفذ مستخدماً (`EADDRINUSE`) أو حدث خطأ على server socket، لا يوجد handler واضح لـ `server.on("error", ...)`.

الأثر: رسائل الفشل قد تكون أقل وضوحاً، وقد لا تمر عبر logger الموحد.

التوصية: إضافة handler:

```ts
server.on("error", (error) => {
  logger.error("HTTP server error", { error });
  process.exit(1);
});
```

### 7. مسار الإغلاق graceful shutdown يمكن استدعاؤه أكثر من مرة

في `src/server.ts:16-48` نفس دالة `shutdown` يمكن أن تُستدعى من `SIGTERM`, `SIGINT`, `unhandledRejection`, و `uncaughtException` بدون guard يمنع الاستدعاء المتكرر.

الأثر: في بعض الحالات يمكن تنفيذ `server.close` أو `process.exit` أكثر من مرة، مما يصعّب قراءة السجلات وقت الأعطال.

التوصية: إضافة flag مثل `let isShuttingDown = false` داخل `startServer`، وتجاهل أي استدعاء لاحق بعد بدء الإغلاق.

### 8. `/health` يخلط بين liveness و readiness

في `src/app.ts:26-45` مسار `/health` ينفذ query على قاعدة البيانات. هذا يجعله readiness check أكثر من liveness check.

الأثر: إذا تعطلت قاعدة البيانات مؤقتاً، قد تعتبر منصة التشغيل أن التطبيق نفسه ميت وتعيد تشغيله، رغم أن المشكلة في dependency خارجية.

التوصية: فصل المسارات:

- `/live` يرجع نجاحاً إذا كان process يعمل.
- `/ready` يتحقق من قاعدة البيانات والخدمات الخارجية.

### 9. سجل الطلبات لا يحتوي status code أو duration

في `src/app.ts:14-18` يتم تسجيل بداية الطلب فقط:

```ts
logger.info(`${req.method} ${req.url}`);
```

الأثر: عند التحقيق في مشكلة، لا يظهر هل الطلب انتهى بـ 200 أو 500، ولا كم استغرق.

التوصية: التسجيل بعد `finish` على response، مع `statusCode` ومدة الطلب وربما request id.

### 10. OpenAPI builder يعتمد على ترتيب side effects

`src/openapi/document.ts:5-8` يسجل schemas فقط، ولا يستورد ملفات routes التي تضيف `routeRegistry.push(...)`. حالياً `app.ts` يستورد `router` قبل تشغيل `serveOpenApi`، لذلك يعمل في هذا المسار. لكن استدعاء `buildOpenApiDocument()` مباشرة من سكربت أو اختبار قد ينتج `paths` فارغة.

التوصية: اجعل `document.ts` يستورد routes المطلوبة صراحة، أو اجعل التسجيل مركزياً في ملف واضح لا يعتمد على ترتيب imports في `app.ts`.

### 11. توثيق OpenAPI يعلن قدرات غير موجودة فعلياً

في `src/openapi/document.ts:28-29` وصف الـ API يقول إنه يحتوي على users, restaurants, menus, carts, orders, payments. فعلياً `src/routes/index.ts:7` يركب مسارات `carts` فقط.

الأثر: مستهلك الـ API قد يتوقع endpoints غير موجودة.

التوصية: جعل الوصف يعكس السطح المتاح حالياً، أو إضافة placeholder واضح في التوثيق بأن بقية الموارد غير منشورة بعد.

### 12. أدوات response الموحدة غير مستخدمة

`src/utils/response.ts:8-31` يوفر `sendSuccess` و `sendError`، لكن controllers الحالية تبني JSON يدوياً. هذا يخلق أكثر من نمط للاستجابة داخل المشروع.

الأثر: مع توسع المشروع قد تختلف الاستجابات بين controllers، خصوصاً في وجود `message`, `data`, و `error`.

التوصية: إما اعتماد helper موحد في controllers، أو حذف الملف إذا لم يكن جزءاً من النمط المعتمد.

## أولوية التعامل المقترحة

1. إصلاح سكربت `start` وفصل تشغيل production عن development.
2. تشديد تحقق متغيرات البيئة.
3. تحسين lifecycle للـ server: خطأ `listen` و shutdown guard.
4. فصل health checks إلى liveness/readiness.
5. توحيد طريقة توليد OpenAPI بعيداً عن side effects.
6. تنظيف نمط الاستجابات أو اعتماد `response.ts` فعلياً.
