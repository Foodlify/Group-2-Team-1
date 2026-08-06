# 🗺️ خريطة فروع المشروع

> آخر تحديث: 2026-08-06 — **قرار الفريق: فروع الـ features تفضل موجودة على GitHub كفروع منفصلة** (جزء من الـ Git workflow المطلوب في المينتورشيب وبيدخل في التقييم). لو اتغير وضع الفروع حدّث الملف ده.

## ⭐ فرع التجميع: `develop` — فيه كل شغل الفريق

**ده الفرع اللي أي شغل جديد يتبني عليه** (متبني على `feat/admin-crud` + شغل كمال المنقول). فيه:
- كل شغل الخط الرئيسي + الـ Admin CRUD + التحصينات — **بدون الـ OpenAPI route-builder** (قرار فريق: النظام الكلاسيكي — Express Router + `routeRegistry.push`)
- **جدول RefreshToken مستقل** (منقول من شغل كمال): سيشن لكل جهاز + revocation + rotation
- **موديول OTP** (منقول من شغل كمال بإصلاحاته): الكود بيتبعت بالإيميل فعلاً ومش بيظهر في الـ response
- **Vitest + أول 17 unit test** (المطاعم + الـ OTP)

الـ workflow: الفيتشرات الجديدة تتفرع من `develop` وترجعله بـ PR، والدمج في `main` من `develop`.

## فروع GitHub (بالترتيب الزمني)

| # | الفرع | آخر كوميت | إيه هو |
|---|---|---|---|
| 1 | `main` | 2026-04-08 | الفرع الافتراضي — فاضي، مستني الدمج النهائي |
| 2 | `cart-managment` | 2026-05-02 | فيتشر الكارت (أول فيتشر) — متضمن بالكامل في الخط الرئيسي |
| 3 | `feat/user-management` | 2026-05-31 | فيتشر اليوزرز والـ Auth — مدموج في الخط الرئيسي |
| 4 | `feat/customer-management` | 2026-05-31 | فيتشر العملاء والعناوين — مدموج في الخط الرئيسي |
| 5 | `feat/order-management` | 2026-05-31 | فيتشر الأوردرات (+ مستندات التخطيط) — مدموج في الخط الرئيسي |
| 6 | `feat/restaurant-menu-management` | 2026-06-13 | فيتشر المطاعم والمنيو — على الريموت بيشمل نسخة الـ route-builder (اللي القرار إنها متتكملش) |
| 7 | ⚠️ `customer-management` | 2026-07-19 | **شغل كمال** — 14 كوميت فريد على معمارية قديمة، يُنقل منه يدوياً لا يُدمج (انظر تحت) |
| 8 | `feat/admin-crud` | 2026-08-06 | الخط الرئيسي كامل بالنظام الكلاسيكي (أساس develop) |
| 9 | ⭐ `develop` | 2026-08-06 | **فرع التجميع** — feat/admin-crud + شغل كمال المنقول (RefreshToken + OTP + tests) |

## 🌿 فروع الفيتشرات الجديدة (متفرعة من `develop` وبتترجع له بـ merge)

| الفرع | التاريخ | الفيتشر | الحالة |
|---|---|---|---|
| `feat/customer-ratings` | 2026-08-06 | Rating & Comments — تقييم المطعم (1–5 + كومنت) بعد أوردر DELIVERED، تقييم واحد لكل أوردر مضمون من الداتابيز، ومتوسط التقييم بيتحسب SQL | ✅ مدموج في develop |
| `feat/customer-default-address` | 2026-08-06 | العنوان الـ Default — أول عنوان بيبقى default تلقائياً + endpoint لتغييره + ترقية أحدث عنوان لو الـ default اتحذف (قاعدة S12: الأوردر بيفضل يختار عنوانه) | ✅ مدموج في develop |
| `feat/customer-preferred-payments` | 2026-08-06 | Preferred Payment Settings — الجدول الرسمي التاني في Customer Management: حفظ طريقة الدفع المفضلة (method بس، من غير أي بيانات كروت) بنفس دورة العناوين | ✅ مدموج في develop |
| `feat/customer-support` | 2026-08-06 | Customer Support — تذاكر دعم بتصنيفات وتوزيع تلقائي على أقل agent مشغول (تصميم G1T1 مع إصلاح ثغراته الثلاثة: ownership على القراءة + أكشنات الـ agent بقت ADMIN + العداد بيتحدث في transaction) | ✅ مدموج في develop |
| `feat/menu-search` | 2026-08-06 | Search Menu Items (بند رسمي) — بحث عام في الأصناف بالاسم مع سياق المنيو والمطعم في النتيجة. (قرار: Category وIngredients اتشالوا — مش في الـ mindmap الرسمي ومحدش من الفرق نفذهم) | ✅ مدموج في develop |
| `feat/restaurant-discovery` | 2026-08-06 | Top Rating Restaurants + Restaurants Recommendations (بندين رسميين) — ترتيب بمتوسط التقييم SQL groupBy، والتوصيات = الأعلى تقييماً من مطاعم العميل ما جربهاش | ✅ مدموج في develop |
| `feat/menu-history` | 2026-08-06 | View History List of Menu (بند رسمي) — جدول MenuChangeLog بيتكتب تلقائياً من عمليات الأدمن على المنيو وأصنافه (create/update/delete + snapshot) وendpoint أدمن لعرضه | ✅ مدموج في develop |
| `feat/auth-password-reset` | 2026-08-06 | Forgot / Reset Password فوق الـ OTP الجاهز — رد موحّد يمنع user enumeration، والريسِت بيلغي كل الـ refresh sessions | ✅ مدموج في develop |
| `feat/auth-account-status` | 2026-08-06 | ربط الـ OTP بالتسجيل (تفعيل الإيميل إجباري قبل استخدام الحساب) + Enable/Disable Account للأدمن + Account Deactivate للعميل نفسه | ✅ مدموج في develop |

> **مين متغطي بمين؟** الفروع 2→6 كلها محتواها موجود جوا `feat/admin-crud` (رقم 8) — بتفضل على GitHub كسجل للـ workflow، إنما الشغل الجديد كله فوق الأساس. الاستثناءان: الكوميتات الثلاثة بتوع الـ route-builder على رقم 6 (مستبعدين بقرار)، وشغل كمال (رقم 7).

## ⚠️ شغل كمال (`customer-management`) — يُنقل يدوياً، لا يُدمج

الفرع متفرع من `8a9174d` (2026-04-21) قبل إعادة تصميم الـ schema والـ auth — دمجه merge هيعمل تعارضات كارثية (schema بـ 23 جدول + Float للفلوس + auth بـ TEST_USER_ID).

**المكونات اللي تستاهل النقل فوق `feat/admin-crud`:**
1. **موديول الـ OTP** (توليد + bcrypt hash + صلاحية 10 دقايق + rate limiting ذاتي) — مع إصلاح: الكود ميرجعش في الـ response + تفعيل إرسال الإيميل فعلياً (nodemailer)
2. **جدول `RefreshToken` مستقل** (token + expiresAt + revoked) بدل عمود الـ hash الواحد على User — rotation وrevocation أنضف
3. **الـ unit tests** (10 تِستات Vitest لموديول المطاعم) — كنمط يُعمم على باقي الموديولات
4. **منظور صاحب المطعم** (register / me / me/orders) — لو الفريق قرر يدعم الـ actor ده

## 🏷️ الأرشيف (tags مرفوعة على GitHub — شبكة أمان إضافية)

| الـ tag | بيحفظ إيه |
|---|---|
| `archive/route-builder` | كوميتات الـ route-builder الثلاثة (نفس تيب `feat/restaurant-menu-management` الريموت) |
| `archive/cart-managment` | كوميت winston محلي كان فريد في فرع الكارت |
| `archive/study` | كوميت تحسينات Docker/compose من تجارب أبريل (الفرع نفسه محذوف من زمان) |

> استرجاع أي أرشيف: `git checkout -b <اسم-جديد> <الـtag>`

## 📝 ملاحظات تاريخية

- فروع `clone-setup-project-structure` و`momen-dev` و`study` كانت اتحذفت من GitHub قديماً (قبل أغسطس) — كوميت الـ Docker الفريد الوحيد فيهم محفوظ في `archive/study`.
- المشروع اتسمى **Foodlify** (اسم الـ org على GitHub) — الاسم الرسمي عند المينتور: Javeats Lite.
