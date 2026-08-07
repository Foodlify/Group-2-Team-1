# Architecture & Flow Guide

> دليل بصري يشرح كيف يعمل المشروع من البداية إلى النهاية. مُوجَّه لأي مطور جديد يريد فهم البنية ودورة حياة أي Request خلال دقائق.

---

## 1. Overview

**Food Delivery API** — REST API مبني بـ:

| Layer      | Tech                              |
| ---------- | --------------------------------- |
| Runtime    | Node.js 25.8.1                    |
| Framework  | Express 5                         |
| Language   | TypeScript 6                      |
| ORM        | Prisma 7                          |
| Database   | PostgreSQL 17                     |
| Validation | Zod                               |
| API Docs   | OpenAPI 3.1 (Scalar + Swagger UI) |
| Logging    | Winston                           |

**النمط المعماري:** Layered Modular Architecture — كل موديول (entity) فولدر مستقل يحتوي نفس الـ 6 ملفات (routes, validation, controller, service, repository, model)، وكل طبقة لها مسؤولية واحدة واضحة.

---

## 2. High-Level Architecture

الصورة الكبرى لكل المكونات وكيف تتواصل:

```mermaid
graph TB
    Client[["🌐 Client<br/>(Postman / Frontend)"]]

    subgraph ExpressApp["🚀 Express Application"]
        direction TB
        MW[["Middlewares<br/>(JSON, Logger, Validation, Auth)"]]
        Router[["Router<br/>/api/v1/*"]]
        Docs[["OpenAPI Docs<br/>/api-docs"]]
        Health[["Health Check<br/>/health"]]
        ErrorMW[["Error Middleware"]]
    end

    subgraph Modules["📦 Business Modules (23 entities)"]
        direction TB
        Ctrl[["Controller"]]
        Svc[["Service<br/>(Business Logic)"]]
        Repo[["Repository<br/>(extends BaseRepository)"]]
    end

    Prisma[["🔷 Prisma Client"]]
    DB[("🗄️ PostgreSQL")]
    Logger[["📝 Winston Logger"]]

    Client -->|HTTP Request| MW
    MW --> Router
    Router --> Ctrl
    Ctrl --> Svc
    Svc --> Repo
    Repo --> Prisma
    Prisma --> DB

    MW -.-> Docs
    MW -.-> Health
    Ctrl -.->|on error| ErrorMW
    Svc -.->|on error| ErrorMW
    ErrorMW -->|JSON response| Client

    MW -.-> Logger
    ErrorMW -.-> Logger

    classDef client fill:#e1f5ff,stroke:#0288d1,color:#01579b
    classDef express fill:#fff3e0,stroke:#f57c00,color:#e65100
    classDef module fill:#f3e5f5,stroke:#7b1fa2,color:#4a148c
    classDef data fill:#e8f5e9,stroke:#388e3c,color:#1b5e20

    class Client client
    class MW,Router,Docs,Health,ErrorMW express
    class Ctrl,Svc,Repo module
    class Prisma,DB,Logger data
```

---

## 3. Server Startup Flow

ماذا يحدث عند تشغيل `npm run dev` — الملف المسؤول [src/server.ts](../src/server.ts):

```mermaid
graph TD
    Start([🟢 npm run dev]) --> Boot["startServer()"]
    Boot --> Connect["connectPrisma()<br/>الاتصال بقاعدة البيانات أولاً"]
    Connect -->|Success| Listen["app.listen(PORT)<br/>Express يبدأ الاستماع"]
    Connect -->|Fail| Exit1["logger.error + process.exit(1)"]

    Listen --> Log["logger.info<br/>Server running on PORT"]
    Log --> Handlers["تسجيل Signal Handlers"]

    Handlers --> SIGTERM["SIGTERM"]
    Handlers --> SIGINT["SIGINT (Ctrl+C)"]
    Handlers --> UR["unhandledRejection"]
    Handlers --> UE["uncaughtException"]

    SIGTERM --> Shutdown["shutdown()"]
    SIGINT --> Shutdown
    UR --> Shutdown
    UE --> Shutdown

    Shutdown --> Close["server.close()<br/>إيقاف استقبال requests جديدة"]
    Close --> Disconnect["disconnectPrisma()"]
    Disconnect --> Exit0["process.exit(0) ✅"]

    Shutdown -.->|timeout 10s| ForceExit["process.exit(1) ⚠️"]

    classDef start fill:#c8e6c9,stroke:#2e7d32
    classDef normal fill:#fff,stroke:#424242
    classDef error fill:#ffcdd2,stroke:#c62828
    classDef success fill:#bbdefb,stroke:#1565c0

    class Start,Exit0 start
    class Connect,Listen,Log,Handlers,Close,Disconnect normal
    class Exit1,ForceExit,UR,UE error
    class SIGTERM,SIGINT success
```

---

## 4. Express App Bootstrapping

ترتيب الـ middlewares في [src/app.ts](../src/app.ts) — **الترتيب مهم جدًا**:

```mermaid
graph LR
    Req([Incoming Request]) --> M1["1️⃣ express.json()"]
    M1 --> M2["2️⃣ express.urlencoded()"]
    M2 --> M3["3️⃣ Request Logger<br/>(Winston)"]
    M3 --> M4["4️⃣ serveOpenApi()<br/>/api-docs/*"]
    M4 --> M5["5️⃣ /api/v1 Router"]
    M5 --> M6["6️⃣ /health endpoint"]
    M6 --> M7["7️⃣ 404 Handler"]
    M7 --> M8["8️⃣ errorMiddleware<br/>(final catch)"]
    M8 --> Res([Response])

    classDef mw fill:#fff3e0,stroke:#f57c00,color:#e65100
    class M1,M2,M3,M4,M5,M6,M7,M8 mw
```

**ملاحظة:** `errorMiddleware` يجب أن يكون **آخر شيء** لأن Express يُميّز error-handling middlewares بـ 4 parameters `(err, req, res, next)`.

---

## 5. Request Lifecycle (الأهم)

رحلة أي Request من لحظة وصوله حتى رجوع الـ Response:

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Express as Express App
    participant Logger as Winston Logger
    participant Router as Router /api/v1
    participant Validate as validate() middleware
    participant Ctrl as Controller
    participant Svc as Service
    participant Repo as Repository
    participant Prisma as Prisma Client
    participant DB as PostgreSQL

    Client->>Express: HTTP Request<br/>(headers, body)
    Express->>Express: express.json() يفك الـ body
    Express->>Logger: logger.info("METHOD URL")
    Express->>Router: توجيه للـ route المناسب
    Router->>Validate: validate({ body, params, query })

    alt Validation Fails
        Validate-->>Client: 400 Bad Request<br/>{ errors: [...] }
    else Validation OK
        Validate->>Ctrl: next() → Controller handler
        Ctrl->>Ctrl: asyncHandler wraps للإمساك بالأخطاء
        Ctrl->>Svc: استدعاء business method
        Svc->>Svc: تحقق business rules<br/>(authorization, existence)

        alt Business Rule Violated
            Svc-->>Ctrl: throw new AppError("...", 4xx)
            Ctrl-->>Express: next(err)
            Express->>Express: errorMiddleware
            Express-->>Client: 4xx JSON { success: false, message }
        else Success
            Svc->>Repo: delegate CRUD
            Repo->>Prisma: delegate.findUnique/create/update...
            Prisma->>DB: SQL query
            DB-->>Prisma: rows
            Prisma-->>Repo: typed result
            Repo-->>Svc: result
            Svc-->>Ctrl: mapped response
            Ctrl-->>Client: 2xx JSON { success: true, data }
        end
    end
```

**النقاط المفتاحية:**

- **`asyncHandler`** — يلتقط أي promise rejection داخل الـ controller ويمررها لـ `next(err)` تلقائيًا. المصدر: [src/utils/asyncHandler.ts](../src/utils/asyncHandler.ts).
- **`validate` middleware** — يستخدم Zod لفحص `body/params/query`، ويستبدل القيم بالنسخة المُحوَّلة. المصدر: [src/middlewares/validate.middleware.ts](../src/middlewares/validate.middleware.ts).

---

## 6. Layered Architecture — مسؤولية كل طبقة

```mermaid
graph TB
    subgraph L1["🛣️ Routes Layer"]
        R["تعريف الـ endpoints<br/>+ ربط validation<br/>+ تسجيل OpenAPI"]
    end

    subgraph L2["✅ Validation Layer"]
        V["Zod schemas<br/>فحص body/params/query"]
    end

    subgraph L3["🎮 Controller Layer"]
        C["HTTP handling فقط<br/>استخراج بيانات req<br/>إرسال res"]
    end

    subgraph L4["💼 Service Layer"]
        S["Business logic<br/>Authorization<br/>استدعاء repositories متعددة"]
    end

    subgraph L5["💾 Repository Layer"]
        RP["CRUD فقط<br/>extends BaseRepository<br/>بدون business logic"]
    end

    subgraph L6["🔷 ORM Layer"]
        P["Prisma Client<br/>Query builder + type safety"]
    end

    subgraph L7["🗄️ Database"]
        D["PostgreSQL"]
    end

    L1 --> L2 --> L3 --> L4 --> L5 --> L6 --> L7

    classDef layer fill:#f3e5f5,stroke:#7b1fa2
    class L1,L2,L3,L4,L5,L6,L7 layer
```

### جدول المسؤوليات (مع أمثلة فعلية من موديول Cart):

| الطبقة         | المسؤولية                                           | مثال                                                         |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| **Routes**     | تعريف endpoints + ربط validation + OpenAPI registry | [cart.routes.ts](../src/modules/cart/cart.routes.ts)         |
| **Validation** | Zod schemas للـ request/response                    | [cart.validation.ts](../src/modules/cart/cart.validation.ts) |
| **Controller** | HTTP layer: req → service → res                     | [cart.controller.ts](../src/modules/cart/cart.controller.ts) |
| **Service**    | Business logic + Authorization rules                | [cart.service.ts](../src/modules/cart/cart.service.ts)       |
| **Repository** | Data access (بدون business logic)                   | [cart.repository.ts](../src/modules/cart/cart.repository.ts) |
| **Model**      | TypeScript types المشتقة من Prisma                  | [cart.model.ts](../src/modules/cart/cart.model.ts)           |

> **قاعدة ذهبية:** `Controller` لا يستدعي `Repository` مباشرةً، ولا يعرف شيئًا عن `Prisma`. كل شيء يمر عبر `Service`.

**`BaseRepository`** — موجود في [src/shared/repositories/base.repository.ts](../src/shared/repositories/base.repository.ts) ويوفّر `findUnique, findMany, findFirst, create, update, delete, count, upsert, findPaginated` بشكل type-safe لأي Prisma delegate. كل repository موديول يرث منه ويضيف استعلامات خاصة به فقط.

---

## 7. مثال عملي: Add Item to Cart

تدفق كامل لـ `POST /api/v1/carts/me/items` — أشمل مثال لأنه يغطّي validation + authorization + cross-entity logic:

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Router as cart.routes.ts
    participant Validate as validate()
    participant Ctrl as cart.controller.ts<br/>addItem
    participant Svc as cartService
    participant MIRepo as menuItemRepository
    participant CRepo as cartRepository
    participant CIRepo as cartItemRepository
    participant DB as PostgreSQL

    Client->>Router: POST /api/v1/carts/me/items<br/>{ menuItemId, quantity }
    Router->>Validate: AddCartItemRequestSchema
    Validate->>Validate: Zod يفحص الـ body

    alt Invalid body
        Validate-->>Client: 400 Validation failed
    end

    Validate->>Ctrl: next()
    Ctrl->>Ctrl: getCurrentCustomerId()<br/>(من req.user.id بعد المصادقة)
    Ctrl->>Svc: addItem(customerId, input)

    Svc->>MIRepo: findById(menuItemId)
    MIRepo->>DB: SELECT menuItem
    DB-->>MIRepo: row | null

    alt MenuItem not found
        MIRepo-->>Svc: null
        Svc-->>Ctrl: throw AppError("Menu item not found", 404)
        Ctrl-->>Client: 404 JSON
    end

    Svc->>CRepo: findUnique({ customerId })
    CRepo->>DB: SELECT cart
    DB-->>CRepo: cart | null

    alt No cart yet
        Svc->>CRepo: create({ customerId })
        CRepo->>DB: INSERT cart
    end

    Svc->>CIRepo: findByCartAndMenuItem(cartId, menuItemId)
    CIRepo->>DB: SELECT cartItem (composite unique)
    DB-->>CIRepo: existing | null

    alt Item exists
        Svc->>CIRepo: update(quantity = old + new)
    else New item
        Svc->>CIRepo: create({ cartId, menuItemId, quantity })
    end

    Svc->>Svc: getMyCart(customerId)<br/>يحسب totalPrice + itemCount
    Svc-->>Ctrl: CartResponse
    Ctrl-->>Client: 201 { success: true, data: cart }
```

**نقاط جديرة بالملاحظة:**

- **Upsert يدوي**: الخدمة تتحقق إذا كان الـ item موجودًا ثم تحدّث الكمية بدلًا من استبدالها — سلوك "add to existing quantity".
- **Computed fields**: `totalPrice` و `itemCount` لا يُحفظان في DB، بل يُحسبان في `toCartResponse()` وقت القراءة.
- **Authorization:** `updateItem` و `removeItem` يستخدمان `assertItemBelongsToUser` لضمان أن الـ cart item يخصّ المستخدم الحالي (throws 403 وإلا).

---

## 8. Error Handling Flow

كيف تُعالَج الأخطاء من أي طبقة حتى رجوعها للـ client:

```mermaid
graph TD
    Err([💥 Error حدث في أي طبقة])

    Err --> Type{نوع الخطأ؟}

    Type -->|AppError<br/>مُعرَّف يدويًا| Op["Operational Error<br/>statusCode + message<br/>(مثلاً 404, 403, 400)"]
    Type -->|Unknown Error<br/>crash غير متوقع| Unk["Unexpected Error"]
    Type -->|ZodError<br/>validation| Zod["Validation Error"]

    Op --> AsyncW["asyncHandler<br/>يلتقط الـ reject<br/>ويمرر لـ next(err)"]
    Unk --> AsyncW

    AsyncW --> EM["errorMiddleware<br/>(src/middlewares/error.middleware.ts)"]

    EM --> Check{err instanceof<br/>AppError?}

    Check -->|Yes| Log1["logger.warn<br/>Operational error"]
    Check -->|No| Log2["logger.error<br/>Unexpected error + stack"]

    Log1 --> Send1["res.status(err.statusCode)<br/>{ success: false, message }"]
    Log2 --> Send2["res.status(500)<br/>{ message: 'Internal Server Error' }"]

    Zod --> ValidateMW["validate middleware<br/>يمسك ZodError مباشرةً"]
    ValidateMW --> Send3["res.status(400)<br/>{ errors: [{ path, message }] }"]

    Send1 --> Client([📤 Client])
    Send2 --> Client
    Send3 --> Client

    Err404([🔍 Route غير موجود]) --> NotFound["404 Handler<br/>{ message: 'Route X not found' }"]
    NotFound --> Client

    classDef err fill:#ffcdd2,stroke:#c62828
    classDef process fill:#fff3e0,stroke:#f57c00
    classDef success fill:#c8e6c9,stroke:#2e7d32

    class Err,Err404,Op,Unk,Zod err
    class AsyncW,EM,Check,ValidateMW,Log1,Log2 process
    class Send1,Send2,Send3,NotFound,Client success
```

**القاعدة الأساسية:**

- **Known errors** → استخدم `throw new AppError("message", statusCode)` داخل الـ service. مثال:
  ```ts
  throw new AppError("Menu item not found", 404);
  ```
- **Unknown errors** → تترك تُرمى تلقائيًا، `asyncHandler` يلتقطها و `errorMiddleware` يعيد 500 دون كشف تفاصيل داخلية.
- **Validation errors** → تُعالَج مباشرةً في `validate()` middleware قبل الوصول للـ controller.

---

## 9. Database Schema Overview

مخطط العلاقات الكامل متاح في [docs/ERD.svg](ERD.svg). الـ entities الرئيسية (23 موديول) مُصنَّفة كالتالي:

| المجموعة            | الـ Entities                                                                    |
| ------------------- | ------------------------------------------------------------------------------- |
| 👤 **Users & Auth** | `user`, `userType`, `userRole`, `role`, `customer`                              |
| 🛒 **Cart**         | `cart`, `cartItem`                                                              |
| 🍽️ **Restaurants**  | `restaurant`, `restaurantDetails`, `menu`, `menuItem`                           |
| 📦 **Orders**       | `order`, `orderItem`, `orderStatus`, `orderTracking`                            |
| 💳 **Payments**     | `paymentIntegrationType`, `paymentTypeConfiguration`, `preferredPaymentSetting` |
| 💰 **Transactions** | `transaction`, `transactionDetails`, `transactionStatus`                        |
| 📍 **Misc**         | `address`, `auditingEvent`                                                      |

**Prisma schema:** [prisma/schema.prisma](../prisma/schema.prisma)

---

## 10. Module Anatomy

كل موديول (entity) في [src/modules/](../src/modules/) له نفس الهيكل تمامًا — مما يُسهِّل التعلم والإضافة:

```mermaid
graph TB
    subgraph Module["📦 module/ (مثال: cart)"]
        direction TB
        Routes["*.routes.ts<br/>───────────<br/>Endpoints + OpenAPI"]
        Validation["*.validation.ts<br/>───────────<br/>Zod schemas + types"]
        Controller["*.controller.ts<br/>───────────<br/>HTTP handlers"]
        Service["*.service.ts<br/>───────────<br/>Business logic"]
        Repository["*.repository.ts<br/>───────────<br/>Data access"]
        Model["*.model.ts<br/>───────────<br/>TypeScript types"]
    end

    Routes -->|validate()| Validation
    Routes -->|handlers| Controller
    Controller -->|calls| Service
    Service -->|uses| Repository
    Service -->|throws| AppError["AppError<br/>(shared)"]
    Repository -->|extends| BaseRepo["BaseRepository<br/>(shared)"]
    Repository -->|uses| Prisma["prisma client"]

    Controller -.->|types| Validation
    Service -.->|types| Model
    Service -.->|types| Validation

    classDef file fill:#fff,stroke:#424242
    classDef shared fill:#e1bee7,stroke:#6a1b9a
    class Routes,Validation,Controller,Service,Repository,Model file
    class AppError,BaseRepo,Prisma shared
```

### خطوات إضافة موديول جديد (Quick Reference)

1. أنشئ فولدر `src/modules/<entity>/`
2. أضف الـ 6 ملفات (`routes`, `validation`, `controller`, `service`, `repository`, `model`)
3. اجعل الـ repository يرث من `BaseRepository` ويمرّر `prisma.<entity>` في الـ constructor
4. سجّل الـ router في [src/routes/index.ts](../src/routes/index.ts):
   ```ts
   router.use("/<entities>", <entity>Router);
   ```
5. سجّل الـ OpenAPI paths عبر `routeRegistry.push()` داخل ملف الـ routes

---

## 11. Entry Points Summary

| نقطة             | المسار                                          | الوصف                                   |
| ---------------- | ----------------------------------------------- | --------------------------------------- |
| 🟢 Bootstrap     | [src/server.ts](../src/server.ts)               | `startServer()` — يُشغِّل كل شيء        |
| 🚀 App setup     | [src/app.ts](../src/app.ts)                     | Middlewares + routes mounting           |
| 🛣️ Routes root   | [src/routes/index.ts](../src/routes/index.ts)   | تجميع كل moduleRouters تحت `/api/v1`    |
| 🗄️ DB connection | [src/config/prisma.ts](../src/config/prisma.ts) | Prisma Client + connect/disconnect      |
| ⚙️ Env config    | [src/config/env.ts](../src/config/env.ts)       | `PORT`, `DATABASE_URL`, `NODE_ENV`, ... |
| 📝 Logger        | [src/config/logger.ts](../src/config/logger.ts) | Winston setup                           |
| 📚 API Docs      | [src/openapi/serve.ts](../src/openapi/serve.ts) | Scalar + Swagger UI على `/api-docs`     |
| ❤️ Health        | `/health` (in [app.ts](../src/app.ts))          | Liveness + DB connectivity check        |

---

## 12. أسئلة قد تخطر ببالك

**س: من أين يبدأ التطبيق فعليًا؟**
من [src/server.ts](../src/server.ts) — هو الذي يستدعي `connectPrisma()` ثم `app.listen()`. الـ `app` نفسه مُعدّ في [src/app.ts](../src/app.ts).

**س: أين أضع الـ business logic؟**
في **Service layer** فقط. الـ Controller مهمته الوحيدة استقبال `req` وإرجاع `res`. الـ Repository مهمته الوحيدة CRUD.

**س: كيف تعمل الـ Authentication؟**
عبر JWT (access + refresh) يُسلَّمان كـ **httpOnly cookies**. الـ middleware [src/middlewares/auth.middleware.ts](../src/middlewares/auth.middleware.ts) (`authenticate`) يقرأ الـ access token من الكوكي (أو `Authorization: Bearer` كبديل)، و`authorize("ADMIN")` يحمي مسارات الإدارة. التسجيل/الدخول في موديول `user` (`/api/v1/auth/*`). الـ controllers تقرأ هوية المستخدم من `req.user.id` (لا `TEST_CUSTOMER_ID`).

**س: أين أرى كل الـ endpoints المتاحة؟**
شغّل السيرفر ثم افتح:

- `http://localhost:<PORT>/api-docs` (Scalar)
- `http://localhost:<PORT>/api-docs/swagger` (Swagger UI)

**س: ما هي الموديولات المُفعَّلة حاليًا؟**
`auth` + `user` (مصادقة وإدارة مستخدمين)، `customer` (ملف + عناوين)، `restaurant`/`menu`/`menuItem` (تصفّح الكتالوج — قراءة)، `cart`، `order`. الباقي يُفعَّل تدريجيًا عبر [src/routes/index.ts](../src/routes/index.ts).

---

## 13. المراجع

- **README** الرئيسي: [README.md](../README.md) — setup + run + scripts
- **Troubleshooting:** [docs/troubleshooting.md](troubleshooting.md)
- **Database ERD:** [docs/ERD.svg](ERD.svg)
- **Prisma Schema:** [prisma/schema.prisma](../prisma/schema.prisma)
