# خطة تطبيق تعديلات المراجع (Ahmed Emad)

## السياق (Context)

- **المشروع المراجَع** (للقراءة فقط): `/media/beingmomen/Work/Courses/Ahmed Emad/S15/Group-2-Team-1-feat-order-management`
- **المشروع الحالي** (للتعديل): `/media/beingmomen/Code/Mentor/Group-2-Team-1`
- Branch: `order-management-momen`

## مصادر التعديلات

1. **تعليقات داخل الكود** (TODO, FIXME, ملاحظات Ahmed Emad)
2. **محضر اجتماع 1** (`transscript_01.txt`) — نقاش حول concurrency, transactions, taxes, pagination
3. **محضر اجتماع 2** (`transscript_02.txt`) — نقاش حول Design Patterns, Service Abstraction, Order Flow

## أسلوب العمل المتفق عليه

- **نقطة نقطة**: نناقش كل نقطة على حدة قبل التنفيذ
- **بعد الاتفاق**: نُنفِّذ، نراجع، ثم ننتقل للنقطة التالية

---

## ⚠️ ملاحظة: نتائج الفحص الأولي

تم فحص الملفات الحالية ووُجد أن المشروع الحالي **أنظف من المشروع المراجَع**:

| التعديل المقترح في المراجَع | الوضع في المشروع الحالي |
|------------------------------|--------------------------|
| تنظيف commented-out code في `order.service.ts` | ✅ نظيف بالفعل |
| تنظيف pseudocode (`// get order`, `// yes -> update`) | ✅ نظيف بالفعل |
| حذف `// IGNORE` comments | ✅ غير موجود |
| تنظيف `// getOrders`, `// [orderId , createdAt...]` في controller | ✅ غير موجود |

لذا **تم حذف مرحلة التنظيف** من الخطة. النقاط أُعيد ترقيمها.

---

# 📋 قائمة التعديلات الكاملة (مرتبة حسب الأولوية المنطقية)

## ✅ المرحلة الأولى: إعادة التسميات (Renaming) — **مكتملة**

### ✅ 1️⃣ إعادة تسمية `addTracking` إلى `addOrderStatusTracking`
- **السبب من المراجع**: تتبع الطلب أوسع من الحالة (يشمل الموقع والوقت المقدر للتسليم)
- **الملفات المتأثرة**:
  - [src/modules/order/order.controller.ts](src/modules/order/order.controller.ts) — handler name
  - [src/modules/order/order.service.ts](src/modules/order/order.service.ts) — method name
  - [src/modules/order/order.routes.ts](src/modules/order/order.routes.ts) — route binding
- ✅ **تم التنفيذ** — URL يبقى `/tracking` كما هو

### ✅ 2️⃣ توحيد PascalCase لـ Prisma models
- إعادة تسمية model `orderTracking` → `OrderTracking` في [prisma/schema.prisma](prisma/schema.prisma)
- استخدام `@@map("orderTracking")` لحفظ اسم الجدول في DB (لا migration)
- تحديث type في [src/modules/order/order.model.ts](src/modules/order/order.model.ts) من `orderTrackingModel` إلى `OrderTrackingModel`
- **اكتشاف مهم**: `prisma.orderTracking` (delegate) يبقى camelCase تلقائياً (Prisma behavior)
- ✅ **تم التنفيذ**

---

## ✅ المرحلة الثانية: Custom Exceptions — **مكتملة**

### ✅ 3️⃣ إنشاء ملف errors بسيط لكل module
- **النمط المختار**: object بسيط `as const` فيه أسماء الأخطاء + message + statusCode
- **الفائدة**: لا classes، لا inheritance، لا تعقيد — مجرد constants
- **الملف الجديد**:
  - [src/shared/exceptions/order.errors.ts](src/shared/exceptions/order.errors.ts) — `orderErrors` object
- **الملفات المعدَّلة**:
  - [src/modules/order/order.service.ts](src/modules/order/order.service.ts) — استبدال 12 استخدام لـ `AppError` بـ constants من orderErrors
- **AppError** يبقى كما هو بدون تعديل
- **errorMiddleware** يبقى كما هو بدون تعديل
- ✅ **تم التنفيذ**

---

## ✅ المرحلة الثالثة: Service Abstraction — **مكتملة**

### ✅ 4️⃣ منع استخدام Repository الخاصة بـ module آخر مباشرة
- **القاعدة المعتمدة**: داخل نفس الـ module يجوز استخدام الـ repository مباشرة. خارج الـ module يجب المرور بالـ service
- **الـ Services الجديدة** (thin wrappers):
  - [src/modules/customer/customer.service.ts](src/modules/customer/customer.service.ts)
  - [src/modules/address/address.service.ts](src/modules/address/address.service.ts)
  - [src/modules/menuItem/menuItem.service.ts](src/modules/menuItem/menuItem.service.ts)
- **الملفات المُعَدَّلة**:
  - [src/modules/order/order.service.ts](src/modules/order/order.service.ts) — استبدال 3 repositories
  - [src/modules/cart/cart.service.ts](src/modules/cart/cart.service.ts) — استبدال 2 repositories
- ✅ **تم التنفيذ**

### ✅ 5️⃣ تحسين validation الـ menu items باستخدام IN CLAUSE
- **المشكلة الحالية**: `Promise.all(items.map(findById))` = N queries
- **الحل المُطَبَّق**: `menuItemService.findManyByIds(ids[])` = query واحد
- **الملفات المُعَدَّلة**:
  - [src/modules/menuItem/menuItem.repository.ts](src/modules/menuItem/menuItem.repository.ts) — إضافة `findManyByIds`
  - [src/modules/menuItem/menuItem.service.ts](src/modules/menuItem/menuItem.service.ts) — wrapper للـ method
  - [src/modules/order/order.service.ts](src/modules/order/order.service.ts) — استخدام Map للأداء
- ✅ **تم التنفيذ**

---

## ✅ المرحلة الرابعة: Order Flow Optimizations — **مكتملة**

### ✅ 6️⃣ إزالة fetch مكرر بعد update
- **3 methods تم تحسينها** في [order.service.ts](src/modules/order/order.service.ts):
  - `cancelOrder`: حذف fetch ثاني، استخدام result من `updateStatus` + تعديل `order.orderStatus` في الذاكرة
  - `updateOrderStatus`: نفس النهج
  - `addOrderStatusTracking`: تغيير `findById` → `findByIdWithDetails` من الأول، ثم إضافة الـ tracking للـ array في الذاكرة
- **النتيجة**: حذف 3 من 5 AppError 500s ("Order not found after update")
- ✅ **تم التنفيذ**

### ✅ 7️⃣ تحسين `findPaginatedByCustomer`
- **اكتشاف**: Prisma 7.7 الجديد يستخدم `JOIN strategy` كـ **default behavior** (لا حاجة لـ `relationLoadStrategy: "join"` يدوياً)
- **النتيجة**: الـ query الحالي محسَّن تلقائياً بـ JOIN
- ✅ **مكتمل بالـ default**

### ✅ 8️⃣ توثيق Snapshot data في OrderItems
- إضافة Prisma JSDoc (`///`) على حقلي `price` و `name` في [prisma/schema.prisma](prisma/schema.prisma):
  ```prisma
  /// Snapshot of menu item price at order time — never updated even if MenuItem.price changes later
  price      Decimal
  /// Snapshot of menu item name at order time — never updated even if MenuItem.name changes later
  name       String
  ```
- ✅ **تم التنفيذ**

---

## ⏳ المرحلة الخامسة: Cart Locking & Concurrency (من الاجتماع 1)

### 9️⃣ Lock الـ Cart أثناء `placeOrder`
- **المشكلة الموصوفة في الاجتماع 1**:
  - User يفتح الكارت ويبدأ الطلب
  - في نفس الوقت admin يعدل أسعار أو يحذف items
  - الطلب يتم بأسعار قديمة أو بـ items غير موجودة
- **الحل**: Prisma transaction مع `SELECT FOR UPDATE` على الكارت
- **الـ Flow الجديد**:
  1. Lock Cart (row-level lock)
  2. Validate كل items وأسعارها مازالت متطابقة
  3. Snapshot الأسعار في OrderItems
  4. Create Order + OrderItems + OrderStatus
  5. Clear Cart (المرحلة 13)
  6. الـ transaction يُغلق فيُحرَّر الـ lock تلقائياً

### 🔟 Price Validation عند الـ Checkout
- **النقطة من الاجتماع 1**: مقارنة الأسعار في الكارت بأسعار `MenuItem` الحالية قبل تأكيد الطلب
- **لو السعر اختلف**:
  - **خيار أ**: رفض الطلب وإبلاغ المستخدم بالسعر الجديد
  - **خيار ب**: تحديث الكارت تلقائياً وطلب تأكيد جديد
- **يحتاج نقاش**: أي خيار نختار؟ (الاجتماع لم يحسم)

### 1️⃣1️⃣ Item Availability Check
- التأكد من أن كل `menuItemId` في الكارت مازال موجوداً (لم يُحذف من القائمة)
- لو item غير موجود: رفض الطلب أو حذفه تلقائياً من الكارت
- **يحتاج نقاش**: أي السلوكين؟

---

## ⏳ المرحلة السادسة: Inventory / Stock (مؤجل قابل للتفعيل)

### 1️⃣2️⃣ Stock Management (اختياري حسب البزنس)
- **النقطة من الاجتماع 1**: المراجع طلب التفكير في stock management
- **الملاحظة**: المشروع الحالي ليس عنده stock model
- **القرار المطلوب**: نضيفه الآن أم نؤجله؟
- **في حال الإضافة**:
  - إضافة حقل `stock` في `MenuItem` أو model جديد `Inventory`
  - تخفيض الـ stock عند `placeOrder` (داخل الـ transaction)
  - إرجاعه عند `cancelOrder`
- **التوصية**: نؤجلها لأنها feature جديد كامل وليست refactor

---

## ⏳ المرحلة السابعة: Clear Cart بعد Order

### 1️⃣3️⃣ مسح الكارت بعد إنشاء الطلب
- **حالياً**: الكارت لا يُمسح بعد placeOrder
- **التعديل**: استدعاء `cartService.clearCart(customerId)` داخل نفس الـ transaction
- **يحتاج نقاش**: المسح فوري أم نترك للـ user؟ (الاجتماع لم يحسم)

---

## ⏳ المرحلة الثامنة: Transaction Model (إعادة بناء)

### 1️⃣4️⃣ إعادة بناء Transaction Model (المحذوف في commit 18c36ac)
- **المراجع طلب صراحةً في الاجتماع 1**:
  - لا يكفي transaction model مرتبط بـ orders فقط
  - نحتاج جدول `Transaction` عام لـ ALL operations:
    - Order payments
    - Refunds (full / partial)
    - Returns
    - External integrations (Stripe, PayPal, etc.)
- **ملاحظة**: يوجد بالفعل `src/modules/transaction/transaction.repository.ts` بأخطاء type (بقايا من الحذف) — سنعالجها هنا
- **الـ Schema المقترح**:
  ```prisma
  model Transaction {
    id            String   @id @default(cuid())
    type          String   // ORDER_PAYMENT, REFUND, PARTIAL_REFUND, ...
    amount        Decimal
    currency      String   @default("EGP")
    status        String   // PENDING, SUCCESS, FAILED
    externalRef   String?  // stripe_transaction_id, etc.
    paymentMethod String   // CREDIT_CARD, PAYPAL, CASH, WALLET
    orderId       String?
    metadata      Json?
    order         Order?   @relation(...)
    createdAt     DateTime @default(now())
    updatedAt     DateTime @updatedAt
    @@index([orderId])
    @@index([externalRef])
  }
  ```
- **السبب**: لو الطلب جاء من Stripe، نحتاج نخزن الـ external reference لعمل refunds لاحقاً

### 1️⃣5️⃣ Transaction Service مستقل
- إنشاء `src/modules/transaction/transaction.service.ts`
- methods الأساسية:
  - `createTransaction(input)`
  - `findByExternalRef(ref)`
  - `findByOrder(orderId)`
  - `refund(transactionId, amount?)` — partial أو full
- **التكامل**: داخل `orderService.placeOrder` يستدعي `transactionService.createTransaction`

---

## ⏳ المرحلة التاسعة: Payment Strategy Pattern

### 1️⃣6️⃣ تطبيق Payment Strategy Pattern
- **المراجع طلبها صراحةً في الاجتماع 2**
- **الفكرة**: support لطرق دفع متعددة (Stripe, PayPal, Cash on Delivery, Wallet)
- **التنفيذ**:
  - `PaymentStrategy.interface.ts`:
    ```typescript
    interface PaymentStrategy {
      pay(amount: number, metadata: PaymentMetadata): Promise<TransactionResult>;
      refund(transactionId: string, amount?: number): Promise<TransactionResult>;
    }
    ```
  - implementations: `StripeStrategy`, `PayPalStrategy`, `CashOnDeliveryStrategy`, `WalletStrategy`
  - `PaymentContext` يختار الـ strategy بناءً على `paymentMethod`
- **التكامل**: `orderService.placeOrder` يستقبل `paymentMethod` ويستدعي `paymentService.pay(...)`

### 1️⃣7️⃣ Tax Calculation
- **نقاش الاجتماع 1**: المراجع تكلم عن الحاجة لحساب الضرائب وعرضها للمستخدم
- **التعديل**:
  - إضافة `subtotal`, `taxAmount`, `total` في `OrderResponse`
  - إنشاء `taxCalculator` service (utility function أو strategy)
- **يحتاج نقاش**:
  - نسبة الضريبة ثابتة (14% مثلاً)؟
  - أم متغيرة حسب المنطقة (من `Address`)؟
  - أم لكل `MenuItem` ضريبة مختلفة؟

### 1️⃣8️⃣ Shipping Fee
- إضافة `shippingFee` في الطلب
- **الحساب**: حسب `addressId` (المسافة) أو ثابت أو حسب الـ restaurant
- **يحتاج نقاش**: business logic للحساب

---

## ⏳ المرحلة العاشرة: JWT Authentication

### 1️⃣9️⃣ تطبيق JWT Auth الكامل
- استبدال `TEST_CUSTOMER_ID` بـ `req.user.id` من JWT middleware
- **الملفات المتأثرة**:
  - [src/middlewares/auth.middleware.ts](src/middlewares/auth.middleware.ts) — موجود بالفعل ✅
  - [src/modules/order/order.routes.ts](src/modules/order/order.routes.ts) — إضافة `authenticate`
  - [src/modules/cart/cart.routes.ts](src/modules/cart/cart.routes.ts) — إضافة `authenticate`
  - حماية admin routes (`updateOrderStatus`, `addOrderStatusTracking`) بـ `authorize(['admin'])`
- **الحذف**:
  - `getCurrentCustomerId` المؤقتة من cart + order controllers
  - `TEST_CUSTOMER_ID` من `.env.example`

---

## ⏳ المرحلة الحادية عشر: Pagination Improvements

### 2️⃣0️⃣ Date Range Filter للـ Orders
- **نقاش الاجتماع**: المستخدم قد يحتاج فقط orders آخر شهر بدل كل تاريخه
- **التعديل**: إضافة `from` و `to` query params في `getMyOrders`
- **الفائدة**: تقليل حجم البيانات المرتجعة للـ frontend

### 2️⃣1️⃣ (اختياري) Cursor-based Pagination
- **النقطة**: المراجع تكلم عن أن offset-based pagination سيء للأداء على كميات بيانات كبيرة
- **التوصية**: نؤجلها لأن offset-based يكفي للـ scale الحالي
- **يحتاج نقاش**: نضيفها الآن أم نؤجلها؟

---

## ⏳ المرحلة الثانية عشر: Architectural Pattern (متقدم/اختياري)

### 2️⃣2️⃣ Chain of Responsibility / Saga Pattern لـ `placeOrder`
- **اقتراح المراجع في الاجتماع 2**: تنظيم flow الطلب كـ chain من الـ handlers
- **الـ Handlers المقترحة**:
  1. `LockCartHandler`
  2. `ValidateCustomerHandler`
  3. `ValidateAddressHandler`
  4. `ValidateMenuItemsHandler`
  5. `ValidatePricesHandler` (snapshot)
  6. `CalculateTaxHandler`
  7. `CalculateShippingHandler`
  8. `CreateOrderHandler`
  9. `CreateOrderItemsHandler`
  10. `ProcessPaymentHandler` (Strategy)
  11. `ClearCartHandler`
  12. `CreateOrderStatusHandler`
- **المخاطر**: refactor كبير جداً
- **التوصية**: **مؤجَّل** — نطبقه فقط لو الـ flow أصبح معقداً جداً بعد كل التعديلات السابقة
- **البديل البسيط**: تنظيم الـ orderService methods كـ private methods منفصلة بدون pattern كامل

---

## 📊 ملخص حالة التقدم

| المرحلة | النقاط | الوقت المتوقع | المخاطر | الحالة |
|---------|--------|----------------|---------|--------|
| ~~تنظيف الكود~~ | ~~قديمة~~ | — | — | ✅ غير لازم (نظيف بالفعل) |
| **إعادة التسميات** | **1, 2** | **قليل** | **منخفضة** | **✅ مكتمل** |
| **Custom Exceptions** | **3** | **متوسط** | **منخفضة** | **✅ مكتمل** |
| **Service Abstraction** | **4, 5** | **متوسط** | **متوسطة** | **✅ مكتمل** |
| **Order Flow Optimizations** | **6, 7, 8** | **متوسط** | **منخفضة** | **✅ مكتمل** |
| Cart Locking | 9, 10, 11 | كبير | متوسطة | ⏳ التالي |
| Stock (اختياري) | 12 | كبير | متوسطة | ⏳ معلَّق |
| Clear Cart | 13 | قليل | منخفضة | ⏳ معلَّق |
| Transaction Model | 14, 15 | كبير | متوسطة | ⏳ معلَّق |
| Payment Strategy | 16, 17, 18 | كبير | متوسطة | ⏳ معلَّق |
| JWT Auth | 19 | متوسط | متوسطة | ⏳ معلَّق |
| Pagination | 20, 21 | متوسط | منخفضة | ⏳ معلَّق |
| Saga Pattern | 22 | كبير جداً | عالية | ⏳ معلَّق |

---

## 📝 سجل التغييرات (Changelog)

### ✅ المرحلة الأولى — مكتملة
**النقطة 1**: rename `addTracking` → `addOrderStatusTracking`
- [src/modules/order/order.service.ts](src/modules/order/order.service.ts) — method name
- [src/modules/order/order.controller.ts](src/modules/order/order.controller.ts) — handler name
- [src/modules/order/order.routes.ts](src/modules/order/order.routes.ts) — route binding

**النقطة 2**: Prisma model `orderTracking` → `OrderTracking`
- [prisma/schema.prisma](prisma/schema.prisma) — model name + `@@map("orderTracking")` للحفاظ على اسم الجدول
- [src/modules/order/order.model.ts](src/modules/order/order.model.ts) — type `orderTrackingModel` → `OrderTrackingModel`
- اكتشاف: `prisma.orderTracking` delegate يبقى camelCase تلقائياً (Prisma behavior)

**ملاحظة**: URL endpoint بقي `POST /api/v1/orders/:orderId/tracking` (عدم كسر API consumers)

---

### ✅ المرحلة الثانية — مكتملة

**النقطة 3**: ملف errors بسيط لكل module
- إنشاء [src/shared/exceptions/order.errors.ts](src/shared/exceptions/order.errors.ts) — `orderErrors` object بسيط `as const`
- إنشاء [src/shared/exceptions/cart.errors.ts](src/shared/exceptions/cart.errors.ts) — `cartErrors` object بسيط `as const`
- تعديل [src/modules/order/order.service.ts](src/modules/order/order.service.ts) — استبدال 12 استخدام لـ `AppError` باستخدام constants من `orderErrors`
- تعديل [src/modules/cart/cart.service.ts](src/modules/cart/cart.service.ts) — استبدال 5 استخدامات لـ `AppError` باستخدام constants من `cartErrors`

**النمط المعتمد** (بسيط جداً):
```typescript
// src/shared/exceptions/order.errors.ts
export const orderErrors = {
  ORDER_NOT_FOUND: { message: "Order not found", statusCode: 404 },
  ORDER_FORBIDDEN: { message: "This order does not belong to you", statusCode: 403 },
  ORDER_NOT_CANCELLABLE: { message: "Only PENDING orders can be cancelled", statusCode: 400 },
  // ...
} as const;

// في الـ service
throw new AppError(
  orderErrors.ORDER_NOT_FOUND.message,
  orderErrors.ORDER_NOT_FOUND.statusCode,
);
```

**المفاتيح المتاحة في `orderErrors`**:
- `ORDER_NOT_FOUND` (404)
- `ORDER_FORBIDDEN` (403)
- `ORDER_NOT_CANCELLABLE` (400)
- `INVALID_STATUS_TRANSITION` (400) — مع رسالة dynamic للـ from→to
- `MENU_ITEM_NOT_FOUND` (404)
- `CUSTOMER_NOT_FOUND` (404)
- `ADDRESS_NOT_FOUND` (404)
- `ADDRESS_FORBIDDEN` (403)

**ما تبقى من AppError بدون constants** (للأخطاء 500 — Internal Server Error):

في `order.service.ts` (5 استخدامات):
- "Order not found after creation" (في `placeOrder`)
- "Order not found after update" (3 مرات: cancelOrder, updateOrderStatus, addOrderStatusTracking)
- "Order has no status record" (updateOrderStatus)

في `cart.service.ts` (3 استخدامات):
- "Cart not found after update" (3 مرات: addItem, updateItem, removeItem)

كل هذه ستُعالَج في المرحلة 4 (Order Flow Optimizations — إزالة fetch مكرر)

---

### ✅ المرحلة الثالثة — مكتملة

**النقطة 4**: Service Abstraction
- إنشاء [src/modules/customer/customer.service.ts](src/modules/customer/customer.service.ts) — thin wrapper
- إنشاء [src/modules/address/address.service.ts](src/modules/address/address.service.ts) — thin wrapper
- إنشاء [src/modules/menuItem/menuItem.service.ts](src/modules/menuItem/menuItem.service.ts) — thin wrapper
- تعديل [src/modules/order/order.service.ts](src/modules/order/order.service.ts) — استبدال 3 cross-module repository imports بـ services
- تعديل [src/modules/cart/cart.service.ts](src/modules/cart/cart.service.ts) — استبدال 2 cross-module repository imports بـ services

**النقطة 5**: IN CLAUSE Optimization
- إضافة `findManyByIds(ids[])` في [src/modules/menuItem/menuItem.repository.ts](src/modules/menuItem/menuItem.repository.ts)
- إضافة wrapper في [src/modules/menuItem/menuItem.service.ts](src/modules/menuItem/menuItem.service.ts)
- إعادة كتابة منطق validation menu items في `placeOrder`:

```typescript
// قبل (N queries)
const menuItems = await Promise.all(
  input.items.map(async (item) => {
    const menuItem = await menuItemRepository.findById(item.menuItemId);
    if (!menuItem) throw new AppError(...);
    return { ...item, price, name };
  }),
);

// بعد (1 query)
const menuItemIds = input.items.map((i) => i.menuItemId);
const foundMenuItems = await menuItemService.findManyByIds(menuItemIds);
const menuItemMap = new Map(foundMenuItems.map((m) => [m.id, m]));

const menuItems = input.items.map((item) => {
  const menuItem = menuItemMap.get(item.menuItemId);
  if (!menuItem) throw new AppError(...);
  return { ...item, price: Number(menuItem.price), name: menuItem.name };
});
```

**الفوائد المحققة**:
- ✅ منع الوصول المباشر لـ DB من خارج الـ module
- ✅ تقليل query count من N إلى 1 في `placeOrder` (إذا كان الطلب يحتوي على 10 menu items: 10 queries → 1 query)
- ✅ سهولة إضافة caching/events/logging لاحقاً في الـ service

---

### ✅ المرحلة الرابعة — مكتملة

**النقطة 6**: إزالة fetch مكرر بعد update
- تحسين [order.service.ts](src/modules/order/order.service.ts) في 3 methods:

**`cancelOrder`** (قبل/بعد):
```typescript
// قبل (2 DB queries بعد التحقق)
await orderStatusRepository.updateStatus(orderId, "CANCELLED");
const updated = await orderRepository.findByIdWithDetails(orderId);  // ← fetch ثاني
if (!updated) throw new AppError("Order not found after update", 500);
return this.toOrderResponse(updated);

// بعد (1 DB query)
const updatedStatus = await orderStatusRepository.updateStatus(orderId, "CANCELLED");
order.orderStatus = [updatedStatus];  // ← update in-memory
return this.toOrderResponse(order);
```

**`updateOrderStatus`**: نفس النمط
**`addOrderStatusTracking`**:
- تغيير `findById` → `findByIdWithDetails` للحصول على full details من الأول
- بعد `createTracking`، نضيف الـ result للـ array في الذاكرة: `order.orderTrackings = [newTracking, ...order.orderTrackings]`

**النقطة 7**: `relationLoadStrategy: "join"`
- **اكتشاف**: Prisma 7.7 يستخدم JOIN strategy كـ **default** — لا حاجة للتحديد اليدوي
- الـ query الحالي محسَّن بالفعل

**النقطة 8**: JSDoc لـ Snapshot data
- إضافة `///` Prisma comments على `OrderItems.price` و `OrderItems.name` في [prisma/schema.prisma](prisma/schema.prisma):
  ```prisma
  /// Snapshot of menu item price at order time — never updated even if MenuItem.price changes later
  price      Decimal
  /// Snapshot of menu item name at order time — never updated even if MenuItem.name changes later
  name       String
  ```

**النتيجة الإجمالية**:
- ✅ توفير 3 round trips للـ DB في كل update operation
- ✅ حذف 3 من 5 AppError 500 errors (التي ستحدث نظرياً فقط لو تم حذف الـ order بين الـ queries — مشكلة race condition لم تعد قائمة)
- ✅ الكود أنظف وأسرع

**ما تبقى من AppError 500s** (2 فقط الآن):
- "Order not found after creation" في `placeOrder` (مبرر — يحدث لو فشلت الـ transaction بشكل غير متوقع)
- "Order has no status record" في `updateOrderStatus` (مبرر — defensive check)
