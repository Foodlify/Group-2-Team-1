# مراجعة المشروع - النسخة الثانية

تاريخ المراجعة: 2026-04-30

## نطاق المراجعة

تمت مراجعة التغييرات الحالية في إعدادات البيئة، Docker/Compose، seed، ومسار السلة. حسب طلبك تم استبعاد نقطتين من الحكم في هذه المراجعة:

- مشاكل TypeScript build.
- تفعيل المصادقة/حماية المسارات.

## نتيجة الفحوصات

| الفحص | النتيجة |
| --- | --- |
| `npm run db:generate` | ناجح |
| `npx prisma validate` | ناجح |
| `npm run db:migrate:deploy -- --schema prisma/schema.prisma` | ناجح محلياً ولا توجد migrations معلقة |
| `npx prisma db seed` | ناجح، لكن اسم الحقل في الـ output مضلل |
| فحص `TEST_CUSTOMER_ID` الحالي في قاعدة البيانات | فاشل: القيمة الحالية في `.env` لا توجد في جدول `Customer` |
| `npm test` | فاشل لأن سكربت الاختبار غير مفعّل |

## ملاحظات إيجابية بعد التغييرات

- `src/modules/cart/cart.controller.ts:9-16` أصبح يقرأ `TEST_CUSTOMER_ID` بدلاً من `TEST_USER_ID`.
- `prisma/seed.ts:36-40` أصبح يحتفظ بنتيجة إنشاء/تحديث `Customer` في `testCustomer`.
- أوامر Prisma الأساسية تعمل: generate, validate, migrate deploy.

## الملاحظات حسب الأولوية

### 1. عالي: قيمة `TEST_CUSTOMER_ID` المحلية غير صحيحة

في `.env:14` القيمة الحالية هي:

```env
TEST_CUSTOMER_ID="cmo8k38lv0001iiapczjj7phv"
```

تم فحصها مباشرة عبر Prisma وكانت النتيجة أن `customerExists = false`. بعد تشغيل `npx prisma db seed` خرجت قيمة محلية صحيحة مختلفة للـ `Customer.id`:

```text
cmokc9lkd000124ap0i1men3u
```

الأثر:

- `GET /api/v1/carts` قد يرجع سلة فارغة وهمية حتى لو كان `customerId` غير موجود.
- `POST /api/v1/carts` سيفشل غالباً عند إنشاء السلة بسبب foreign key على `Cart.customerId`.

التوصية: تحديث `.env` بالقيمة التي يخرجها seed فعلياً، والأفضل أن يطبع seed الحقل باسم `customerId` حتى لا يتم نسخ قيمة خاطئة.

### 2. عالي: الـ seed يطبع `Customer.id` تحت اسم `userId`

في `prisma/seed.ts:87-89` يتم تنفيذ:

```ts
logger.info("✅ Seed complete", {
  userId: testCustomer.id,
  menuItemIds: ...
});
```

القيمة هنا ليست `User.id`، بل `Customer.id`. هذا يصلح من ناحية القيمة المستخدمة للسلة، لكنه مضلل في الاسم.

الأثر: أي شخص يقرأ الـ output أو README سيظن أنه ينسخ `userId`، بينما النظام الحالي يحتاج `customerId`.

التوصية: تغيير الحقل إلى:

```ts
customerId: testCustomer.id
```

وتحديث README و `.env.example` بنفس الاسم.

### 3. عالي: التوثيق و `.env.example` ما زالا يستخدمان الاسم القديم

رغم أن الـ controller يستخدم `TEST_CUSTOMER_ID`، لا تزال الملفات التالية تشير إلى `TEST_USER_ID`:

- `.env.example:12`
- `README.md:125`
- `README.md:174`
- `README.md:710-721`
- `docs/troubleshooting.md:175-192`
- `docs/ARCHITECTURE.md:288-321`

الأثر: مطور جديد سيتبع README وينشئ متغيراً لا يقرأه التطبيق أصلاً، أو سينسخ قيمة تحت اسم خاطئ.

التوصية: توحيد الاسم في كل مكان إلى `TEST_CUSTOMER_ID`، وتحديث مثال seed output ليعرض `customerId`.

### 4. عالي: خدمة السلة لا تتحقق من وجود العميل قبل إنشاء السلة

في `src/modules/cart/cart.service.ts:86-99` يتم إنشاء Cart مباشرة باستخدام `customerId` القادم من البيئة. إذا كانت القيمة غير موجودة، يتم الاعتماد على قاعدة البيانات كي تفشل بالـ foreign key.

كذلك `getMyCart` في `src/modules/cart/cart.service.ts:15-27` يرجع سلة فارغة حتى لو كان `customerId` غير موجود أصلاً.

الأثر: الأخطاء تتحول إلى 500 عبر `src/middlewares/error.middleware.ts:36-40` بدلاً من رسالة واضحة مثل `Customer not found`.

التوصية: إضافة تحقق واضح في الخدمة قبل عمليات السلة:

- البحث عن `Customer` بالـ id.
- رمي `AppError("Customer not found", 404)` إذا لم يوجد.
- عدم الاعتماد على خطأ قاعدة البيانات كسلوك business logic.

### 5. عالي: يمكن تجاوز حد الكمية 100 عند إضافة نفس العنصر

الـ validation في `src/modules/cart/cart.validation.ts:17` و `src/modules/cart/cart.validation.ts:32` يفرض أن الطلب الواحد لا يتجاوز 100. لكن عند وجود العنصر مسبقاً، `src/modules/cart/cart.service.ts:114-117` يجمع الكمية القديمة والجديدة بدون فحص الناتج:

```ts
quantity: existing.quantity + input.quantity
```

الأثر: يمكن الوصول لكمية أكبر من 100 بإرسال أكثر من طلب.

التوصية: حساب `nextQuantity` ورفض العملية إذا تجاوزت 100.

### 6. متوسط: استجابة السلة الفارغة لا تطابق Schema المعلنة

عند عدم وجود سلة، `src/modules/cart/cart.service.ts:17-27` يرجع:

```ts
id: "",
restaurantId: "",
```

لكن `CartResponseSchema` في `src/modules/cart/cart.validation.ts:79-84` يتوقع `cuid2` لهذه الحقول.

الأثر: OpenAPI والـ runtime response غير متطابقين، وأي client يتحقق من schema قد يرفض الاستجابة.

التوصية: إما جعل `data: null` عند عدم وجود سلة، أو تعريف schema منفصلة للسلة الفارغة.

### 7. متوسط: السعر المخزن في `CartItem` لا يستخدم في حساب الإجمالي

`CartItem` يحتوي على `price` و `name` في `prisma/schema.prisma:117-123`، ويتم حفظهما عند الإضافة في `src/modules/cart/cart.service.ts:120-128`. لكن الحساب والاستجابة يستخدمان `item.menuItem.price` و `item.menuItem.name` في `src/modules/cart/cart.service.ts:157-179`.

الأثر: إذا تغير سعر عنصر القائمة بعد إضافته للسلة، سيتغير إجمالي السلة بأثر رجعي رغم وجود snapshot محفوظ.

التوصية: تحديد السياسة:

- استخدم `CartItem.price/name` إذا كان المطلوب تثبيت السعر وقت الإضافة.
- أو احذف snapshot غير المستخدم إذا كان المطلوب دائماً السعر الحالي.

### 8. متوسط: migrations فيها عمليات مدمرة ومخاطر على قواعد بيانات بها بيانات

آخر migration يحتوي تحذيرات واضحة عن حذف أعمدة وجداول وإضافة أعمدة مطلوبة بدون default في `prisma/migrations/20260429173414_add_restaurant_id_to_cart/migration.sql:4-29`.

كذلك يحذف جداول كاملة في `prisma/migrations/20260429173414_add_restaurant_id_to_cart/migration.sql:117-160`.

الأثر: قد يكون الأمر مقبولاً لقاعدة محلية جديدة، لكنه خطر على أي قاعدة تحتوي بيانات حقيقية.

التوصية: إذا كان المشروع سيُسلّم أو يُنشر على قاعدة بها بيانات، يجب تحويل هذه migration إلى خطوات backfill آمنة أو توثيق أنها تتطلب reset كامل للقاعدة.

### 9. متوسط: لا توجد اختبارات قابلة للتشغيل

`package.json:15` ما زال يحتوي:

```json
"test": "echo \"Error: no test specified\" && exit 1"
```

الأثر: لا يوجد ضمان آلي لمسارات السلة، خصوصاً الحالات التالية:

- إضافة عنصر جديد.
- إضافة نفس العنصر أكثر من مرة.
- رفض تجاوز كمية 100.
- منع خلط عناصر من مطاعم مختلفة.
- التعامل مع `customerId` غير موجود.
- السلة الفارغة.

التوصية: إضافة Vitest أو Jest، والبدء باختبارات `CartService` لأنها تحمل أغلب منطق العمل.

## الأولوية المقترحة للإصلاح

1. توحيد `TEST_CUSTOMER_ID` في `.env.example`, README, docs, و seed output.
2. تحديث `.env` المحلية بقيمة `Customer.id` صحيحة من آخر seed.
3. إضافة تحقق صريح من وجود `Customer` داخل خدمة السلة.
4. إصلاح تجاوز حد الكمية عند add لنفس العنصر.
5. ضبط شكل استجابة السلة الفارغة مع OpenAPI schema.
6. إضافة اختبارات خدمة السلة.
