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

## ✅ المرحلة الخامسة: Cart Locking & Concurrency — **مكتملة**

### 🔄 تغيير الـ Design في `PlaceOrderRequest`
- **قبل**: الـ items تأتي في request body مباشرة (الكارت غير مشارك في checkout)
- **بعد**: الـ items تُقرأ من الكارت (الـ design الصحيح لـ e-commerce)
- **Breaking change** في API contract: `items` field removed من `PlaceOrderRequest`

### ✅ 9️⃣ Lock الـ Cart أثناء `placeOrder`
- **التطبيق**: Prisma transaction + UPDATE noop على `Cart.updatedAt` (يفرض row-level lock في Postgres)
- **الـ method الجديد**: [src/modules/cart/cart.repository.ts](src/modules/cart/cart.repository.ts) `lockByCustomerIdWithItems(customerId, tx)`
- **wrapper في service**: [src/modules/cart/cart.service.ts](src/modules/cart/cart.service.ts)
- **الـ Flow المُطَبَّق**:
  1. Lock Cart (row-level lock حتى تنتهي transaction)
  2. Validate availability + prices
  3. Create Order + OrderItems (snapshots) + OrderStatus
  4. الـ transaction commit → الـ lock يُحرَّر تلقائياً
- ✅ **تم التنفيذ**

### ✅ 🔟 Price Validation عند الـ Checkout
- **الخيار المعتمد**: **رفض الطلب** لو السعر تغير (`409 Conflict`)
- المقارنة: `Number(currentMenuItem.price) !== Number(cartItem.price)` (snapshot من الكارت ضد السعر الحالي)
- الخطأ الجديد: `PRICE_CHANGED` في [order.errors.ts](src/shared/exceptions/order.errors.ts)
- الـ frontend مسؤول عن إعادة تحميل الكارت بعد الخطأ
- ✅ **تم التنفيذ**

### ✅ 1️⃣1️⃣ Item Availability Check
- **الخيار المعتمد**: **رفض الطلب** لو item غير موجود (`409 Conflict`)
- استخدام `menuItemService.findManyByIds(ids[])` (IN CLAUSE من المرحلة 3)
- الخطأ الجديد: `MENU_ITEM_UNAVAILABLE` في [order.errors.ts](src/shared/exceptions/order.errors.ts)
- ✅ **تم التنفيذ**

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

## ✅ المرحلة السابعة: Clear Cart بعد Order (مُنجَزة)

### 1️⃣3️⃣ مسح الكارت بعد إنشاء الطلب ✅
- **القرار**: مسح فوري **داخل** الـ transaction (atomic)، وحذف الـ `Cart` row بالكامل
- **التنفيذ**:
  - `cartRepository.deleteByCustomerId(customerId, tx?)` — `deleteMany` (idempotent)
  - `cartService.clearCart` يستخدمها (الـ cascade يتولى الـ items)
  - `placeOrder` يستدعي `cartService.clearCart(customerId, tx)` كآخر خطوة في الـ transaction
- **مزايا**:
  - لو فشل أي شيء في الـ transaction، الكارت لا يُمسح
  - الـ row-level lock محفوظ حتى نهاية الـ transaction
  - عند الإضافة التالية، `resolveCart` ينشئ Cart جديداً تلقائياً
- **تنظيف**: حذف `cartItemRepository.deleteManyByCartId` (لم يعد مستخدماً)

---

## ✅ المرحلة الثامنة: Transaction Model (مُنجَزة)

### 1️⃣4️⃣ إعادة بناء Transaction Model ✅
- **الـ schema الجديد** (مُطبَّق في `prisma/schema.prisma`):
  ```prisma
  model Transaction {
    id            String   @id @default(cuid())
    type          String   // ORDER_PAYMENT, REFUND, PARTIAL_REFUND
    amount        Decimal
    currency      String   @default("EGP")
    status        String   // PENDING, SUCCESS, FAILED
    paymentMethod String   // CASH, CREDIT_CARD, PAYPAL, WALLET
    externalRef   String?
    orderId       String?
    metadata      Json?
    order         Order? @relation(fields: [orderId], references: [id], onDelete: Restrict)
    createdAt     DateTime @default(now())
    updatedAt     DateTime @updatedAt
    @@index([orderId])
    @@index([externalRef])
  }
  ```
- **التغيير عن القديم**:
  - 1:1 (`@unique`) → N:1 nullable (طلب واحد ممكن له عدة معاملات: payment + refund)
  - `referenceNumber` → `externalRef` (أوضح)
  - إضافة `type`, `amount`, `currency`, `metadata`
- **Migration**: `20260518180357_add_transaction_model`
- **Order model**: إضافة `transactions Transaction[]` relation

### 1️⃣5️⃣ Transaction Model + Repository + Service ✅
- **`transaction.model.ts`**: constants لـ `TRANSACTION_TYPES`, `TRANSACTION_STATUSES`, `PAYMENT_METHODS`
- **`transaction.repository.ts`**: `findById`, `findByOrderId` (returns array), `findByExternalRef`, `createTransaction`, `updateStatus`
- **`transaction.service.ts`** (جديد): thin wrapper

### ⏸️ مؤجَّل للمرحلة 9 (Payment Strategy)
- التكامل داخل `placeOrder` (إنشاء transaction عند الطلب)
- `refund(transactionId, amount?)` — يحتاج Payment Strategy
- Stripe/PayPal adapters

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
| **Cart Locking** | **9, 10, 11** | **كبير** | **متوسطة** | **✅ مكتمل** |
| Stock (اختياري) | 12 | كبير | متوسطة | ⏳ التالي |
| Clear Cart | 13 | قليل | منخفضة | ✅ مُنجَزة |
| Transaction Model | 14, 15 | كبير | متوسطة | ✅ مُنجَزة |
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

---

### ✅ المرحلة الخامسة — مكتملة

**التغيير الأكبر**: الـ `placeOrder` صار يقرأ من الكارت (breaking change في API).

**الـ Flow الجديد**:

```typescript
async placeOrder(customerId, input: { addressId }) {
  await assertCustomerExists(customerId);
  await assertAddressBelongsToCustomer(customerId, input.addressId);

  await orderRepository.transaction(async (tx) => {
    // 1. Lock cart (row-level lock)
    const cart = await cartService.lockByCustomerIdWithItems(customerId, tx);
    if (!cart) throw CART_NOT_FOUND;
    if (cart.cartItems.length === 0) throw CART_EMPTY;

    // 2. Verify availability + price for each cart item
    const ids = cart.cartItems.map(ci => ci.menuItemId);
    const current = await menuItemService.findManyByIds(ids);
    const currentMap = new Map(current.map(m => [m.id, m]));

    for (const ci of cart.cartItems) {
      const c = currentMap.get(ci.menuItemId);
      if (!c) throw MENU_ITEM_UNAVAILABLE;          // النقطة 11
      if (Number(c.price) !== Number(ci.price))     // النقطة 10
        throw PRICE_CHANGED;
    }

    // 3. Create order + items (using cart snapshots)
    const order = await orderRepository.createOrder({ customerId, addressId }, tx);
    await orderItemRepository.createManyWithTx(
      cart.cartItems.map(ci => ({
        orderId: order.id, menuItemId: ci.menuItemId,
        quantity: ci.quantity, price: Number(ci.price), name: ci.name,
      })),
      tx,
    );
    await orderStatusRepository.createStatus(order.id, "PENDING", tx);
  });
  // tx commit → cart lock released automatically
}
```

**كيف يعمل الـ Lock؟**

```typescript
// في cart.repository.ts
async lockByCustomerIdWithItems(customerId, tx) {
  // UPDATE noop على updatedAt يُجبر Postgres على وضع row-level lock
  await tx.cart.update({
    where: { customerId },
    data: { updatedAt: new Date() },
  });
  // الـ lock نشط حتى end of transaction
  return tx.cart.findUnique({
    where: { customerId },
    include: { cartItems: { orderBy: { createdAt: "asc" } } },
  });
}
```

**الأخطاء الجديدة** في [order.errors.ts](src/shared/exceptions/order.errors.ts):
- `CART_NOT_FOUND` (404) — الكارت غير موجود
- `CART_EMPTY` (400) — الكارت فارغ
- `MENU_ITEM_UNAVAILABLE` (409) — item في الكارت تم حذفه من القائمة
- `PRICE_CHANGED` (409) — السعر اختلف بين الكارت والـ MenuItem الحالي

**سيناريو race condition تم حله**:
1. User A: يبدأ checkout → يُقفل الكارت
2. User B (admin): يحاول تعديل أسعار menu items → الـ UPDATE على الكارت يجعل قراءة الكارت في tx الأخرى تنتظر
3. User A: يكمل الـ checkout بـ snapshot الكارت الحالي → يُحرَّر الـ lock
4. User B: تنفذ التغييرات بعد ذلك
- ✅ no race condition، no stale data، no overselling
