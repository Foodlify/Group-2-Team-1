# Cart Restaurant Validation — DB Constraint vs Application-level

## المشكلة

في تطبيق توصيل الأكل، السلة يجب أن تحتوي على أصناف من **مطعم واحد فقط**.
السؤال: أين نفرض هذا القيد؟

---

## الطريقة الأولى: Application-level Validation

### الفكرة
الـ Schema لا يحتوي على `restaurantId` في الـ `Cart`.
الكود هو المسؤول عن التحقق قبل كل إضافة.

### Schema
```prisma
model Cart {
  id         String     @id @default(cuid())
  customerId String     @unique
  items      CartItem[]
}
```

### Flow

```
                    [ المستخدم يطلب إضافة صنف للسلة ]
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   جيب الـ Cart الخاصة بالعميل  │
                    └───────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │       السلة فاضية؟             │
                    └───────────────────────────────┘
                           │                │
                          لا               نعم
                           │                │
                           ▼                ▼
         ┌─────────────────────────┐   ┌───────────────┐
         │ جيب restaurantId        │   │  أضف الصنف    │
         │ من أول صنف في السلة     │   │  مباشرة ✅    │
         └─────────────────────────┘   └───────────────┘
                           │
                           ▼
         ┌─────────────────────────────────────────┐
         │  الصنف الجديد من نفس مطعم السلة؟        │
         └─────────────────────────────────────────┘
                    │                   │
                   نعم                  لا
                    │                   │
                    ▼                   ▼
          ┌──────────────┐    ┌──────────────────────────┐
          │ أضف الصنف ✅ │    │ ارفض الطلب ❌            │
          └──────────────┘    │ "السلة من مطعم مختلف"    │
                              └──────────────────────────┘
```

### مثال كود (Service Layer)
```typescript
async addItemToCart(customerId: string, menuItemId: string, quantity: number) {
  const menuItem = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    include: { menu: true },
  });

  const cart = await prisma.cart.findUnique({
    where: { customerId },
    include: {
      items: {
        include: { menuItem: { include: { menu: true } } },
      },
    },
  });

  if (cart && cart.items.length > 0) {
    const cartRestaurantId = cart.items[0].menuItem.menu.restaurantId;
    const newItemRestaurantId = menuItem.menu.restaurantId;

    if (cartRestaurantId !== newItemRestaurantId) {
      throw new Error("لا يمكن إضافة أصناف من مطاعم مختلفة في نفس السلة");
    }
  }

  await prisma.cartItem.upsert({ ... });
}
```

---

## الطريقة الثانية: DB Constraint

### الفكرة
الـ `Cart` يحتوي على `restaurantId` مباشرة.
الداتابيز نفسه يضمن أن السلة مرتبطة بمطعم واحد فقط.

### Schema
```prisma
model Cart {
  id           String     @id @default(cuid())
  customerId   String     @unique
  restaurantId String                        // ← القيد في الداتابيز
  items        CartItem[]

  customer   Customer   @relation(fields: [customerId], references: [id])
  restaurant Restaurant @relation(fields: [restaurantId], references: [id])
}

model Restaurant {
  id    String @id @default(cuid())
  name  String
  menus Menu[]
  carts Cart[]  // ← مطعم ممكن يكون في سلال كتير (لعملاء مختلفين)
}
```

### Flow

```
                    [ المستخدم يطلب إضافة صنف للسلة ]
                                    │
                                    ▼
                    ┌───────────────────────────────────┐
                    │  جيب restaurantId من الصنف المطلوب │
                    │  MenuItem → Menu → restaurantId    │
                    └───────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   في Cart موجودة للعميل؟       │
                    └───────────────────────────────┘
                           │                │
                          لا               نعم
                           │                │
                           ▼                ▼
         ┌─────────────────────────┐   ┌─────────────────────────────────┐
         │  إنشئ Cart جديدة        │   │  Cart.restaurantId              │
         │  مع restaurantId        │   │  == الصنف الجديد.restaurantId ? │
         │  للمطعم المطلوب         │   └─────────────────────────────────┘
         │  ثم أضف الصنف ✅        │          │                │
         └─────────────────────────┘         نعم               لا
                                              │                │
                                              ▼                ▼
                                   ┌──────────────┐  ┌──────────────────────┐
                                   │ أضف الصنف ✅ │  │ ❌ Error             │
                                   └──────────────┘  │ "السلة من مطعم       │
                                                      │  مختلف"             │
                                                      └──────────────────────┘
```

### مثال كود (Service Layer)
```typescript
async addItemToCart(customerId: string, menuItemId: string, quantity: number) {
  const menuItem = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    include: { menu: true },
  });

  const restaurantId = menuItem.menu.restaurantId;

  let cart = await prisma.cart.findUnique({ where: { customerId } });

  if (cart && cart.restaurantId !== restaurantId) {
    throw new Error("السلة من مطعم مختلف");
  }

  if (!cart) {
    cart = await prisma.cart.create({
      data: { customerId, restaurantId },
    });
  }

  await prisma.cartItem.upsert({ ... });
}
```

---

## المقارنة المباشرة

| المعيار | Application-level | DB Constraint |
|---|---|---|
| **Schema** | أبسط | أكثر وضوحاً |
| **الحماية** | تعتمد على الكود | 100% — الداتابيز يرفض تلقائياً |
| **لو في bug في الكود** | ❌ ممكن يتضاف أصناف مختلطة | ✅ الداتابيز يرفض حتى لو الكود غلط |
| **جلب مطعم السلة** | غير مباشر `CartItem → MenuItem → Menu → Restaurant` | مباشر `Cart.restaurantId` |
| **تغيير القيد مستقبلاً** | سهل — فقط غير الكود | يحتاج DB migration |
| **مشاريع تعليمية** | ✅ كافي تماماً | ✅ أفضل |
| **Production systems** | ⚠️ مقبول مع حذر | ✅ الأنسب |

---

## سيناريو الـ Bug — الفرق الحقيقي

```
الموقف: في bug في الكود خلى الـ validation لا تشتغل
─────────────────────────────────────────────────────────────────────

❌ Application-level (بدون DB constraint)
─────────────────────────────────────────────────────────────────────

  الخطوة 1: CartItem #1 ← MenuItem من Pizza Hut   → تضاف ✅
  الخطوة 2: CartItem #2 ← MenuItem من KFC          → تضاف ✅ (BUG!)

  النتيجة: سلة فيها مطعمين → بيانات فاسدة في الداتابيز ☠️

─────────────────────────────────────────────────────────────────────

✅ DB Constraint (مع restaurantId على Cart)
─────────────────────────────────────────────────────────────────────

  Cart.restaurantId = Pizza Hut

  الخطوة 1: CartItem #1 ← MenuItem من Pizza Hut   → تضاف ✅
  الخطوة 2: CartItem #2 ← MenuItem من KFC
            └→ الكود الغلط حاول يضيفها
            └→ لكن الداتابيز يعرف Cart = Pizza Hut
            └→ ❌ Error تلقائي — البيانات محمية ✅

  النتيجة: بيانات سليمة دائماً حتى لو الكود به خطأ ✅
```

---

## الخلاصة

> **للمشروع التعليمي** — الطريقة الأولى (Application-level) كافية تماماً،
> بشرط أن يكون الـ validation في **Service Layer** وليس في الـ Controller مباشرة.
>
> **للـ Production** — الطريقة الثانية (DB Constraint) أفضل لأن الداتابيز
> يحمي البيانات حتى لو الكود به خطأ.
