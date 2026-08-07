# خطة موديول: Restaurant + Menu (نطاق الكتالوج / Catalog)

> اقرأ أولًا [`00-shared-concerns.plan.md`](./00-shared-concerns.plan.md) — قرارات الـ Roles
> (سؤال مشترك #2) حاسمة هنا لأن إدارة المطاعم/القوائم تحتاج صلاحية ADMIN.
>
> **طريقة الإجابة:** ضع قرارك أسفل كل سؤال في سطر `> ✅ القرار:`.

---

## 1. الغرض والنطاق

«الكتالوج» = ما يتصفّحه العميل قبل الطلب. يتكوّن من 3 كيانات متداخلة هرميًا:

```
Restaurant (1) ──< Menu (N) ──< MenuItem (N)
```

```prisma
model Restaurant { id, name, menus[], carts[], orders[], ... }
model Menu       { id, name, restaurantId, menuItems[], restaurant→ , ... }
model MenuItem   { id, menuId, name, price Decimal, ... }
```

**الوضع الحالي في الكود:**

- [`restaurant.repository.ts`](../../src/modules/restaurant/restaurant.repository.ts) — `findById` فقط.
- [`menu.repository.ts`](../../src/modules/menu/menu.repository.ts) — `findById` فقط.
- [`menuItem.repository.ts`](../../src/modules/menuItem/menuItem.repository.ts) + [`menuItem.service.ts`](../../src/modules/menuItem/menuItem.service.ts) — `findById`, `findByIdWithMenu`, `findManyByIds` (يستخدمها cart/order داخليًا).
- لا توجد ملفات `controller / routes / validation` لأي منها، ولا شيء مكشوف في `routes/index.ts`.

> ⚠️ **مهم:** `menuItem.service.findByIdWithMenu` و`findManyByIds` يعتمد عليها cart/order.
> أي توسيع يجب أن **يحافظ على هذه التواقيع** كما هي.

> **ملاحظة معمارية:** رغم أننا نخطط لها كـ «نطاق واحد» (catalog)، تبقى **3 موديولات منفصلة**
> (`restaurant`, `menu`, `menuItem`) حسب قاعدة المشروع (موديول لكل entity). الملف هنا يخطط
> للثلاثة معًا لأنها مترابطة.

---

## 2. هل نحتاج تعديل schema؟

النماذج الحالية بسيطة. نقاط محتملة:

❓ **سؤال R-1 — ملكية المطعم (Restaurant ownership):**
`Restaurant` حاليًا **بلا مالك** (لا `userId`/owner). هذا يعني أن «من يُدير المطعم» غير محدد بالبيانات.

- **الخيار A —** الإدارة كلها لـ ADMIN فقط، بلا مفهوم «مالك مطعم». (أبسط، بلا migration.)
- **الخيار B —** إضافة `ownerId` (+ علاقة لـ User بدور `RESTAURANT_OWNER`) ليدير كل مالك مطعمه فقط.
  (أقوى، لكن يتطلب migration + دور إضافي في سؤال مشترك #2.)
  > 🟡 التوصية: الخيار A الآن (ADMIN فقط)، وتأجيل ملكية المطاعم لمرحلة لاحقة.
  > ✅ القرار: A

❓ **سؤال R-2 — حقول إضافية للكتالوج:**
هل نضيف حقولًا واقعية مثل: `Restaurant.description/address/isActive`،
`MenuItem.description/imageUrl/isAvailable`؟

- **الخيار A —** نكتفي بالحقول الحالية (`name`, `price`) — أبسط، بلا migration.
- **الخيار B —** نضيف الحد الأدنى المفيد: `MenuItem.isAvailable Boolean @default(true)` (لإخفاء صنف نافد)
  و`Restaurant.isActive Boolean @default(true)`.
  > 🟡 التوصية: الخيار B خفيف ومفيد عمليًا (يمنع الطلب من صنف غير متاح). لكن القرار لك.
  > ✅ القرار: A

> 💡 لو اخترت إضافة `isAvailable`: يجب أن يتحقق منه **cart.addItem** و**order.placeOrder**
> (منع إضافة/طلب صنف غير متاح). هذا يلمس موديولات قائمة — يُراعى في التنفيذ.

---

## 3. الـ Endpoints المقترحة

### قراءة (عامة / للعميل — تصفّح الكتالوج)

| Method | Path                            | الوصف                                         |
| ------ | ------------------------------- | --------------------------------------------- |
| GET    | `/api/v1/restaurants`           | قائمة المطاعم (paginated، بحث بالاسم اختياري) |
| GET    | `/api/v1/restaurants/:id`       | مطعم واحد                                     |
| GET    | `/api/v1/restaurants/:id/menus` | قوائم مطعم معيّن                              |
| GET    | `/api/v1/menus/:id`             | قائمة واحدة (مع أصنافها)                      |
| GET    | `/api/v1/menus/:id/items`       | أصناف قائمة معيّنة                            |
| GET    | `/api/v1/menu-items/:id`        | صنف واحد                                      |

### إدارة (ADMIN) — ⏸️ **مؤجَّلة لـ PR لاحق** (R-3=A: هذه الجولة **قراءة فقط**). تقنيًا جاهزة (ADMIN متاح بعد قرار #2) وتُحمى بـ `authenticate` + `authorize("ADMIN")` عند بنائها

| Method | Path                            | الوصف                                  |
| ------ | ------------------------------- | -------------------------------------- |
| POST   | `/api/v1/restaurants`           | إنشاء مطعم                             |
| PATCH  | `/api/v1/restaurants/:id`       | تعديل مطعم                             |
| DELETE | `/api/v1/restaurants/:id`       | حذف مطعم (Cascade على menus→menuItems) |
| POST   | `/api/v1/restaurants/:id/menus` | إنشاء قائمة داخل مطعم                  |
| PATCH  | `/api/v1/menus/:id`             | تعديل قائمة                            |
| DELETE | `/api/v1/menus/:id`             | حذف قائمة                              |
| POST   | `/api/v1/menus/:id/items`       | إضافة صنف لقائمة                       |
| PATCH  | `/api/v1/menu-items/:id`        | تعديل صنف                              |
| DELETE | `/api/v1/menu-items/:id`        | حذف صنف                                |

❓ **سؤال R-3 — نطاق هذه الجولة:** _(لم يعد محجوبًا بالأدوار — `ADMIN` صار متاحًا بعد قرار #2)_

- **الخيار A —** قراءة فقط (تصفّح الكتالوج) — الأسرع.
- **الخيار B —** قراءة + إدارة كاملة (CRUD) محميّة بـ `authorize("ADMIN")` — صار **ممكنًا الآن** تقنيًا.
  > 🟡 التوصية: الخيار A أولًا (قراءة) في PR، ثم الإدارة في PR تالٍ — أو B مباشرة لو أردت إدخال
  > بيانات الكتالوج عبر الـ API بدل الـ seed (الأدوار جاهزة، فلا مانع تقني).
  > ✅ القرار: A

❓ **سؤال R-4 — تقسيم الـ routes على الموديولات:**
المسارات متشابكة (`/restaurants/:id/menus`, `/menus/:id/items`). كيف نوزّعها؟

- **الخيار A —** كل موديول يملك ملف routes خاص: `restaurant.routes.ts` يحمل `/restaurants*`
  (بما فيها nested menus)، `menu.routes.ts` يحمل `/menus*`، `menuItem.routes.ts` يحمل `/menu-items*`.
- **الخيار B —** ملف routes واحد للكتالوج كله. _(يخالف نمط «ملف لكل موديول» — غير مُفضَّل.)_
  > 🟡 التوصية: الخيار A (التزامًا بنمط المشروع).
  > ✅ القرار: A

---

## 4. تفصيل الملفات (لكل موديول من الثلاثة، نمط الـ 6 ملفات)

### Restaurant

- **validation:** `CreateRestaurantRequestSchema` { name }، `UpdateRestaurantRequestSchema`،
  `RestaurantIdParamsSchema`، `RestaurantQuerySchema` (pagination + `search?`)،
  `RestaurantResponseSchema`، `RestaurantListSuccessResponseSchema`.
- **repository:** فوق `findById` → `findManyPaginated(search)`، `findByIdWithMenus`.
- **service:** `list`, `getById` (404)، و(لو R-3 B) `create/update/remove`.
- **controller/routes:** القراءة + (اختياريًا) الإدارة + `routeRegistry`.
- **model:** `RestaurantWithMenus` عند الحاجة.

### Menu

- **validation:** `CreateMenuRequestSchema` { name, (restaurantId من الـ param) }،
  `UpdateMenuRequestSchema`، `MenuIdParamsSchema`، `MenuResponseSchema` (مع `items?`).
- **repository:** فوق `findById` → `findByRestaurantId`, `findByIdWithItems`.
- **service:** `listByRestaurant`، `getByIdWithItems` (404)، و(لو إدارة) `create/update/remove`
  مع التحقق من وجود المطعم الأب.
- **controller/routes/model** كالمعتاد.

### MenuItem

- **validation:** `CreateMenuItemRequestSchema` { name, price (`z.number().positive()`) }،
  `UpdateMenuItemRequestSchema`، `MenuItemIdParamsSchema`، `MenuItemResponseSchema`.
- **repository:** موجود (`findById/findByIdWithMenu/findManyByIds`) — تُضاف `findByMenuId`، وعمليات الإدارة.
- **service:** توسيع الحالي بـ `listByMenu`, و(لو إدارة) `create/update/remove` مع التحقق من القائمة الأب.
  **مع الحفاظ التام على `findByIdWithMenu`/`findManyByIds`** المستخدمَين من cart/order.
- **ملاحظة Decimal:** `price` من نوع `Decimal` في Prisma — يُحوَّل بـ `Number(item.price)` في الـ response
  (نفس ما يفعله cart/order).

---

## 5. كتالوج الأخطاء — `src/shared/exceptions/catalog.errors.ts` (أو ملف لكل موديول)

```ts
export const catalogErrors = {
  RESTAURANT_NOT_FOUND: { message: "Restaurant not found", statusCode: 404 },
  MENU_NOT_FOUND: { message: "Menu not found", statusCode: 404 },
  MENU_ITEM_NOT_FOUND: { message: "Menu item not found", statusCode: 404 },
  FORBIDDEN: {
    message: "You are not allowed to manage the catalog",
    statusCode: 403,
  },
} as const;
```

> `MENU_ITEM_NOT_FOUND` موجود أصلًا في `cart.errors.ts` لسياق cart — لا نكسره. هذا الكتالوج
> لاستخدام موديولات restaurant/menu/menuItem نفسها.

---

## 6. قواعد العمل

- القراءة عامة (لا تتطلب صلاحية) — تصفّح الكتالوج متاح.
- الإدارة (إنشاء/تعديل/حذف) لـ ADMIN فقط (حسب سؤال مشترك #2).
- إنشاء قائمة يتطلب وجود المطعم الأب (404 وإلا). إنشاء صنف يتطلب وجود القائمة الأب.
- الحذف يعتمد على `onDelete: Cascade` القائم (مطعم→قوائم→أصناف).
  ⚠️ لكن `MenuItem` له `onDelete: Restrict` من `OrderItems`/`CartItem` — حذف صنف مرتبط بطلب/عربة
  قد يفشل على مستوى قاعدة البيانات. يجب التقاط ذلك وإرجاع `409 Conflict` برسالة واضحة بدل 500.
  ❓ **سؤال R-5:** سلوك حذف صنف مُستخدَم في طلبات سابقة؟
  - (1) منع الحذف وإرجاع 409. (2) Soft-delete عبر `isAvailable=false` بدل الحذف الفعلي.
    > ✅ **مُحسوم ضمنًا بإجاباتك:** لا حذف في هذه الجولة (**R-3=A** قراءة فقط)، و**R-2=A** ألغى
    > `isAvailable` فالـ soft-delete (الخيار 2) غير متاح. لذا عند بناء الحذف لاحقًا → **الخيار (1): منع + `409`**.
    > (لا حاجة لإجابة الآن.)

---

## 7. نقاط الالتزام / المخاطر

- ⚠️ **عدم كسر cart/order:** الحفاظ على تواقيع `menuItemService.findByIdWithMenu/findManyByIds`.
- إضافة side-effect imports للـ `restaurant.validation` / `menu.validation` / `menuItem.validation` في `document.ts`.
- ربط 3 routers في `routes/index.ts`: `/restaurants`, `/menus`, `/menu-items`.
- `price` (Decimal) → `Number()` عند الإخراج، و`z.number().positive()` عند الإدخال.
- لو فُعِّلت الإدارة دون أدوار جاهزة، تبقى endpoints الكتابة مكشوفة بلا حماية — **يُفضَّل عدم كشفها**
  حتى تجهز الأدوار (مرتبط بقرار سؤال R-3 وسؤال مشترك #2).

---

## 8. 🔍 مراجعة مقابل Group-1-Team-1 (فرع `feature/restaurant-menu-management`)

عند Group-1، موديول المطعم/القائمة **للقراءة فقط** — وهذا يؤكّد توصيتنا في R-3:

- **الـ endpoints لديهم (GET فقط، بلا أي CRUD إداري مكشوف):**
  - `GET /restaurants` — قائمة المطاعم.
  - `GET /restaurants/:restaurantId` — مطعم واحد.
  - `GET /restaurants/:restaurantId/menus/:menuId` — قائمة داخل مطعم.
  - `GET /restaurants/menus/:menuId/menuItem/:menuItemId` — صنف.
  - يستخدمون **Redis caching** (`restaurant.redis.service`) لتسريع القراءة.
- **قرارات تؤثر علينا:**
  1. **R-3 (النطاق):** يؤكّد توصيتنا **قراءة فقط** أولًا. ✔️
  2. **R-4 (المسارات):** Group-1 يدمجها تحت **راوتر مطعم واحد متداخل**
     (`/restaurants/:id/menus/:menuId`) بدل راوترات منفصلة لكل entity. خيار وجيه، لكنه يخالف
     قاعدة «ملف routes لكل موديول» في مشروعنا.
     - يبقى **الخيار A** (راوتر لكل موديول) أنسب لقواعد مشروعنا، مع إمكانية وضع المسارات المتداخلة
       (`/restaurants/:id/menus`) في `restaurant.routes.ts` لأنها تبدأ بـ `/restaurants`.
  3. **R-2 (حقول الصنف):** Group-1 أضاف **`stock Int` (مخزون فعلي)** بدل `isAvailable` Boolean،
     و`price Int` (لا Decimal)، و`itemName`، مع `restaurantId` مُكرَّر على `MenuItem` (denormalization).
     - **مخزون مقابل توفّر:** بديل أقوى من `isAvailable` — يتيح خصم الكمية عند الطلب. لكنه يفتح
       تعقيدًا (تتبّع مخزون، تزامن). توصيتنا تبقى: `isAvailable` خفيف الآن، و`stock` لاحقًا إن لزم.
     - **Decimal مقابل Int:** **لا نغيّر** — schema مشروعنا يستخدم `Decimal` للسعر، وهو أدق ماليًا.
  4. **R-1 (الملكية):** Group-1 **لم يربط** `ownerId` بالمطعم رغم وجود دور `RESTAURANT_OWNER`.
     يدعم توصيتنا: تأجيل ملكية المطاعم، والإدارة لـ ADMIN فقط مبدئيًا.

### تحديث توصياتنا:

- **R-3:** قراءة فقط (مؤكَّد). الإدارة في PR لاحق بعد جهوزية الأدوار.
- **R-2:** `isAvailable Boolean` الآن (أخفّ)، مع وضع `stock` على الرادار كتحسين مستقبلي.
- **R-4:** راوتر لكل موديول (التزامًا بقواعدنا)، مع السماح بالمسارات المتداخلة داخل راوتر المطعم.
- **caching:** Redis غير موجود في مشروعنا حاليًا — خارج النطاق، لكن نُبقي الـ service layer نظيفًا
  ليسهل إضافة كاش لاحقًا.
