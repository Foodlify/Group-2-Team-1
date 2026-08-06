# 🗺️ خريطة فروع المشروع

> آخر تحديث: 2026-08-06 (بعد تنضيف الريموت) — لو اتغير وضع الفروع حدّث الملف ده.

## ⭐ الفرع الأساس: `feat/admin-crud`

**ده الفرع اللي أي شغل جديد يتبني عليه.** فيه كل شغل الخط الرئيسي + الـ Admin CRUD للكتالوج + التحصينات (rate limiting + helmet + ESLint/Prettier + tsconfig مشدد) — **بدون الـ OpenAPI route-builder** (قرار فريق: كل الـ routes بالنظام الكلاسيكي — Express Router + `routeRegistry.push` اليدوي).

## الفروع الحية بعد التنضيف

| الفرع | مكانه | دوره |
|---|---|---|
| ⭐ `feat/admin-crud` | محلي + GitHub | **الأساس** — كل الشغل الجديد فوقه |
| ⚠️ `customer-management` | GitHub | **شغل كمال** (14 كوميت فريد، لحد 2026-07-19) — يُنقل منه يدوياً، لا يُدمج (انظر تحت) |
| `main` | محلي + GitHub | فاضي — مستني الدمج النهائي |
| `feat/restaurant-menu-management` | محلي فقط | نسخة تاريخية من الخط الرئيسي (لحد كوميت الـ gap analysis) |

## الترتيب الزمني: مين اتغطى بمين

| # | الفرع (تاريخياً) | آخر كوميت | مصيره |
|---|---|---|---|
| 1 | `main` | 2026-04-08 | موجود (فاضي) |
| 2 | `clone-setup-project-structure` | 2026-04-17 | متغطي — **اتحذف من الريموت** |
| 3 | `momen-dev` · `study` | 2026-04-21/22 | متغطيين — **اتحذفوا** (كوميت الـ Docker الفريد في `study` متأرشف في tag `archive/study`) |
| 4 | `cart-managment` | 2026-05-02/06 | متضمن بالكامل — **اتحذف** (كوميت winston الفريد في tag `archive/cart-managment`) |
| 5 | `feat/user-management` · `feat/customer-management` · `feat/order-management` | 2026-05-31 | مدموجين في الخط الرئيسي — **اتحذفوا محلياً ومن الريموت** |
| 6 | `feat/restaurant-menu-management` | 2026-06-01 | الخط الرئيسي — لسه موجود محلياً كمرجع |
| 7 | نسخة الـ route-builder (كانت `try-ai` محلياً + `feat/restaurant-menu-management` على الريموت) | 2026-06-13 | مستبعدة بقرار الفريق — **اتحذفت** ومحفوظة في tag `archive/route-builder` |
| 8 | ⚠️ `customer-management` (كمال) | 2026-07-19 | **باقي على GitHub زي ما هو** بقرار الفريق |
| 9 | ⭐ `feat/admin-crud` | 2026-08-06 | **الأساس الحالي** — مرفوع على GitHub |

## ⚠️ شغل كمال (`customer-management`) — يُنقل يدوياً، لا يُدمج

الفرع متفرع من `8a9174d` (2026-04-21) قبل إعادة تصميم الـ schema والـ auth — دمجه merge هيعمل تعارضات كارثية (schema بـ 23 جدول + Float للفلوس + auth بـ TEST_USER_ID).

**المكونات اللي تستاهل النقل فوق `feat/admin-crud`:**
1. **موديول الـ OTP** (توليد + bcrypt hash + صلاحية 10 دقايق + rate limiting ذاتي) — مع إصلاح: الكود ميرجعش في الـ response + تفعيل إرسال الإيميل فعلياً (nodemailer)
2. **جدول `RefreshToken` مستقل** (token + expiresAt + revoked) بدل عمود الـ hash الواحد على User — rotation وrevocation أنضف
3. **الـ unit tests** (10 تِستات Vitest لموديول المطاعم) — كنمط يُعمم على باقي الموديولات
4. **منظور صاحب المطعم** (register / me / me/orders) — لو الفريق قرر يدعم الـ actor ده

## 🏷️ الأرشيف (tags مرفوعة على GitHub)

| الـ tag | بيحفظ إيه |
|---|---|
| `archive/route-builder` | كوميتات الـ route-builder الثلاثة (اللي كانت على try-ai) — لو حبيتوا ترجعولها يوم |
| `archive/cart-managment` | كوميت winston المحلي الفريد من فرع الكارت القديم |
| `archive/study` | كوميت تحسينات Docker/compose من تجارب أبريل |

> استرجاع أي أرشيف: `git checkout -b <اسم-جديد> <الـtag>`
