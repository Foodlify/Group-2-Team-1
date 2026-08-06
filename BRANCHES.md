# 🗺️ خريطة فروع المشروع

> آخر تحديث: 2026-08-06 — لو اتغير وضع الفروع حدّث الملف ده.

## ⭐ الفرع الأساس: `feat/admin-crud`

**ده الفرع اللي أي شغل جديد يتبني عليه.** فيه كل شغل الخط الرئيسي + الـ Admin CRUD للكتالوج + التحصينات (rate limiting + helmet + ESLint/Prettier + tsconfig مشدد) — **بدون الـ OpenAPI route-builder** (قرار فريق: كل الـ routes بالنظام الكلاسيكي — Express Router + `routeRegistry.push` اليدوي).

## الترتيب الزمني: مين اتغطى بمين

| # | الفرع | آخر كوميت | الحالة |
|---|---|---|---|
| 1 | `main` | 2026-04-08 | فاضي (README فقط) — مستني الدمج النهائي |
| 2 | `origin/clone-setup-project-structure` | 2026-04-17 | setup مبكر — متغطي بالكامل |
| 3 | `origin/momen-dev` · `origin/study` | 2026-04-21/22 | تجارب مبكرة (docs/Docker) — متغطية |
| 4 | `origin/cart-managment` | 2026-05-02 | **متضمن بالكامل** في الخط الرئيسي (ancestor) |
| 5 | `feat/user-management` · `feat/customer-management` · `feat/order-management` | 2026-05-31 | مدموجين في الخط الرئيسي — اتمسحوا محلياً |
| 6 | `feat/restaurant-menu-management` | 2026-06-01 | الخط الرئيسي (لحد كوميت الـ gap analysis) |
| 7 | `origin/feat/restaurant-menu-management` (كان local باسم `try-ai`) | 2026-06-13 | نفس الخط + **route-builder** — مستبعد بقرار الفريق |
| 8 | ⚠️ `origin/customer-management` (شغل كمال) | 2026-07-19 | **متفرع من معمارية قديمة (21 أبريل)** — انظر تحت |
| 9 | ⭐ `feat/admin-crud` | 2026-08-06 | **الأساس الحالي** |

## ⚠️ شغل كمال (`origin/customer-management`) — يُنقل يدوياً، لا يُدمج

الفرع متفرع من `8a9174d` (2026-04-21) قبل إعادة تصميم الـ schema والـ auth — دمجه merge هيعمل تعارضات كارثية (schema بـ 23 جدول + Float للفلوس + auth بـ TEST_USER_ID).

**المكونات اللي تستاهل النقل فوق `feat/admin-crud`:**
1. **موديول الـ OTP** (توليد + bcrypt hash + صلاحية 10 دقايق + rate limiting ذاتي) — مع إصلاح: الكود ميرجعش في الـ response + تفعيل إرسال الإيميل فعلياً (nodemailer)
2. **جدول `RefreshToken` مستقل** (token + expiresAt + revoked) بدل عمود الـ hash الواحد على User — rotation وrevocation أنضف
3. **الـ unit tests** (10 تِستات Vitest لموديول المطاعم) — كنمط يُعمم على باقي الموديولات
4. **منظور صاحب المطعم** (register / me / me/orders) — لو الفريق قرر يدعم الـ actor ده

## 🏷️ الأرشيف

- tag **`archive/cart-managment`** → كوميت winston المحلي الوحيد اللي كان فريد في فرع الكارت القديم (18638db) — محفوظ قبل حذف الفرع.
- الفروع المحلية المتغطية (`feat/user-management`، `feat/customer-management`، `feat/order-management`، `cart-managment`، `try-ai`) **اتمسحت محلياً** — محتواها كله موجود في `feat/admin-crud` أو على الريموت.
- فروع GitHub القديمة (`clone-setup-project-structure`، `momen-dev`، `study`، `cart-managment`) سايبينها على الريموت زي ما هي — حذفها قرار فريق ومش مستعجل.
