# مراجعة المشروع

تاريخ المراجعة: 2026-04-30

## نطاق المراجعة

تمت مراجعة هيكل المشروع، إعدادات التشغيل، Prisma schema/migrations، طبقات `routes/controller/service/repository` الخاصة بالسلة، وملفات التوثيق الأساسية. لم يتم تعديل منطق التطبيق؛ هذا الملف هو ناتج المراجعة فقط.

## نتيجة الفحوصات

| الفحص | النتيجة |
| --- | --- |
| `npm run db:generate` | ناجح |
| `npx prisma validate` | ناجح |
| `npm run db:migrate:deploy -- --schema prisma/schema.prisma` | ناجح محلياً ولا توجد migrations معلقة |
| `npx tsc --noEmit` | فاشل |
| `npm test` | فاشل لأن سكربت الاختبار غير مفعّل |

## الملاحظات حسب الأولوية

### 1. خطأ حرج: المشروع لا ينجح في TypeScript build

`prisma/schema.prisma:15-134` يحتوي حالياً على 8 نماذج فقط: `User`, `Customer`, `Address`, `Restaurant`, `Menu`, `MenuItem`, `Cart`, `CartItem`. في المقابل توجد repositories ما زالت تشير إلى delegates لم تعد موجودة في Prisma Client، مثل:

- `src/modules/order/order.repository.ts:5` يستخدم `PrismaClient["order"]`
- `src/modules/transaction/transaction.repository.ts:5` يستخدم `PrismaClient["transaction"]`
- نفس النمط موجود في وحدات `Role`, `UserRole`, `UserType`, `OrderItem`, `OrderStatus`, `OrderTracking`, `Payment*`, `RestaurantDetails`, `AuditingEvent`

الأثر: `npx tsc --noEmit` يفشل، وبالتالي `Dockerfile:20` سيفشل أيضاً عند تنفيذ `RUN npx tsc`. كذلك أي استيراد لهذه repositories لاحقاً سيكسر التطبيق.

التوصية: حسم اتجاه واحد فقط:

- إما إعادة النماذج المحذوفة إلى `prisma/schema.prisma` وتحديث migrations والـ generated client.
- أو حذف/تعطيل modules والـ repositories غير المدعومة حالياً من schema، وعدم تضمينها في البناء.

### 2. خطأ حرج: السلة تستخدم `userId` مكان `customerId`

في `src/modules/cart/cart.controller.ts:9-16` يتم قراءة `TEST_USER_ID` ثم تمريره إلى `cartService` كأنه `customerId`. لكن `Cart.customerId` في `prisma/schema.prisma:102-109` يشير إلى `Customer.id` وليس `User.id`.

المشكلة تتأكد من `prisma/seed.ts:36-40` حيث يتم إنشاء `Customer` مستقل مرتبط بـ `User`، ثم في `prisma/seed.ts:87-90` يتم طباعة `userId` فقط. كذلك README يطلب نسخ `userId` إلى `TEST_USER_ID` في `README.md:174` و `README.md:721`.

الأثر: إضافة أول عنصر للسلة غالباً ستفشل بسبب foreign key عند إنشاء `Cart` بـ `customerId` يساوي `User.id`، أو ستظهر السلة فارغة دائماً لأن البحث يتم على `Cart.customerId`.

التوصية: لا تمرر `User.id` إلى خدمة السلة مباشرة. إما:

- تغيير seed والتوثيق ليطبعا ويستخدما `customer.id`.
- أو جعل الـ controller/service يحول `req.user.id` أو `TEST_USER_ID` إلى `Customer.id` عبر `customerRepository` قبل التعامل مع السلة.

### 3. عالي: نقاط السلة غير محمية بمصادقة فعلية

المسارات في `src/modules/cart/cart.routes.ts:15-38` لا تستخدم `authenticate`، والـ controller يعتمد على `TEST_USER_ID` من البيئة في `src/modules/cart/cart.controller.ts:6-16`.

الأثر: كل الطلبات تعمل كمستخدم واحد ثابت، ولا توجد هوية لكل request. هذا مقبول كتجربة محلية مؤقتة فقط، لكنه غير صالح لأي بيئة مشتركة أو إنتاجية.

التوصية: تفعيل `authenticate` على مسارات السلة، ثم اشتقاق المستخدم من `req.user`. بعد ذلك يجب ربط المستخدم بـ `Customer.id` قبل تنفيذ عمليات السلة.

### 4. عالي: حد الكمية `100` يمكن تجاوزه عند إضافة نفس العنصر

التحقق في `src/modules/cart/cart.validation.ts:17` يسمح بإضافة كمية حتى 100 في الطلب الواحد، و`src/modules/cart/cart.validation.ts:32` يطبق نفس الحد عند التحديث. لكن عند إضافة عنصر موجود، `src/modules/cart/cart.service.ts:114-117` ينفذ:

```ts
quantity: existing.quantity + input.quantity
```

بدون التأكد أن الناتج النهائي لا يتجاوز 100.

الأثر: يمكن إرسال طلبين مثل `80 + 80` والحصول على كمية `160` رغم أن الـ validation يعلن أن الحد الأقصى 100.

التوصية: حساب `nextQuantity` داخل الخدمة ورفضه إذا تجاوز 100. الأفضل أيضاً استخدام تحديث ذري مثل `increment` مع شرط منطقي واضح أو transaction بمستوى عزل مناسب لتقليل مشاكل التزامن.

### 5. متوسط: استجابة السلة الفارغة لا تطابق schema الموثق

عند عدم وجود سلة، `src/modules/cart/cart.service.ts:17-27` يرجع:

```ts
id: "",
restaurantId: "",
```

لكن `CartResponseSchema` في `src/modules/cart/cart.validation.ts:79-84` يطلب أن تكون `id`, `customerId`, `restaurantId` من نوع `cuid2`.

الأثر: التوثيق وواجهة API يصفان استجابة لا تطابق الواقع، وأي client يعتمد على schema validation قد يرفض استجابة السلة الفارغة.

التوصية: تغيير شكل الاستجابة الفارغة إلى أحد الخيارين:

- `data: null` مع schema واضحة مثل `CartSuccessResponseSchema` يسمح بـ `null`.
- أو إنشاء Cart فعلي عند أول قراءة، بشرط وجود `customerId` و`restaurantId` منطقيين.

### 6. متوسط: السعر المخزن في `CartItem` لا يستخدم في حساب الإجمالي

`CartItem` يحتوي على snapshot للـ `price` و`name` في `prisma/schema.prisma:117-123`، وعند الإضافة يتم حفظهما في `src/modules/cart/cart.service.ts:120-128`. لكن حساب الإجمالي والرد يستخدمان `item.menuItem.price` و`item.menuItem.name` في `src/modules/cart/cart.service.ts:157-179`.

الأثر: إذا تغير سعر عنصر القائمة بعد إضافته للسلة، سيظهر إجمالي السلة بسعر جديد لا يطابق السعر الذي تم حفظه وقت الإضافة. هذا قد يكون مطلوباً أو غير مطلوب، لكنه حالياً غير متسق مع وجود `CartItem.price`.

التوصية: تحديد سياسة واضحة:

- إذا كانت السلة يجب أن تعكس السعر الحالي، احذف snapshot غير المستخدم أو وثّق السلوك.
- إذا كانت السلة يجب أن تثبت السعر وقت الإضافة، استخدم `CartItem.price` و`CartItem.name` في الاستجابة والحساب.

### 7. متوسط: آخر migration حذفت جداول بينما الكود ما زال يحتوي وحداتها

`prisma/migrations/20260429173414_add_restaurant_id_to_cart/migration.sql:117-160` يحذف جداول مثل `Order`, `Role`, `Transaction`, `PaymentIntegrationType`, وغيرها. لكن ملفات modules الخاصة بها لا تزال موجودة تحت `src/modules`.

الأثر: هذا هو السبب العملي لكسر TypeScript build، كما أنه يخلق عدم وضوح في نطاق النظام: هل الطلبات والمدفوعات جزء من المشروع أم تم تأجيلها؟

التوصية: توحيد حدود المشروع الحالية في schema والكود والتوثيق. إن كانت هذه الوحدات مؤجلة، انقلها خارج `src` أو أزلها إلى أن تعود النماذج.

### 8. متوسط: لا توجد اختبارات قابلة للتشغيل

`package.json:15` يحتوي على:

```json
"test": "echo \"Error: no test specified\" && exit 1"
```

ومجلد `tests` فارغ.

الأثر: لا يوجد ضمان آلي لسلوك السلة، خصوصاً في حالات مهمة مثل:

- إضافة عنصر جديد
- إضافة نفس العنصر أكثر من مرة
- منع خلط مطاعم مختلفة في نفس السلة
- تحديث/حذف عنصر لا يخص المستخدم
- السلة الفارغة
- تجاوز حد الكمية

التوصية: إضافة test runner مثل Vitest أو Jest، وكتابة اختبارات خدمة السلة أولاً لأنها تحمل معظم منطق العمل.

## نقاط جيدة

- فصل الطبقات واضح نسبياً: routes, controller, service, repository.
- استخدام Zod للتحقق من الطلبات جيد ويقلل أخطاء الإدخال.
- استخدام transaction في `addItem` خطوة صحيحة لأنها تجمع قراءة عنصر القائمة وإنشاء السلة/العنصر.
- وجود OpenAPI documentation مفيد، لكنه يحتاج أن يطابق الاستجابات الفعلية بعد معالجة الملاحظات أعلاه.

## أولوية الإصلاح المقترحة

1. إصلاح كسر TypeScript build بتوحيد Prisma schema مع modules الموجودة.
2. إصلاح خلط `userId` و`customerId` في السلة والـ seed/README.
3. تفعيل المصادقة على مسارات السلة أو عزل الوضع التجريبي بوضوح.
4. ضبط قواعد الكمية والاستجابة الفارغة.
5. إضافة اختبارات خدمة السلة ثم اختبارات API للمسارات.
