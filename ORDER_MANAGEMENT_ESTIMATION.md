# Order Management — Estimation

> **Expected** = الوقت المتوقع قبل البدء | **Actual** = الوقت الفعلي بعد الانتهاء

---

## Phase 1 — Database Schema

| # | Task | Expected | Actual |
|---|------|----------|--------|
| 1.1 | إضافة `Order` model | | |
| 1.2 | إضافة `OrderItem` model | | |
| 1.3 | إضافة `OrderStatus` model | | |
| 1.4 | إضافة `OrderTracking` model | | |
| 1.5 | إضافة back-relations على Customer, Address, MenuItem | | |
| 1.6 | تشغيل `prisma migrate dev` | | |

**Phase 1 — Expected:** &nbsp;&nbsp;&nbsp; / **Actual:**

---

## Phase 2 — Repository Layer

| # | Task | Expected | Actual |
|---|------|----------|--------|
| 2.1 | `OrderRepository` — uncomment + add methods | | |
| 2.2 | `OrderItemRepository` — uncomment + add `createManyWithTx` | | |
| 2.3 | `OrderStatusRepository` — uncomment + add `createStatus` / `updateStatus` | | |
| 2.4 | `OrderTrackingRepository` — uncomment + add `createTracking` / `findByOrderId` | | |

**Phase 2 — Expected:** &nbsp;&nbsp;&nbsp; / **Actual:**

---

## Phase 3 — Model Layer

| # | Task | Expected | Actual |
|---|------|----------|--------|
| 3.1 | `order.model.ts` — إضافة `OrderWithDetails` + `OrderListItem` | | |
| 3.2 | `orderStatus.model.ts` — إضافة `ORDER_STATUSES` + `VALID_TRANSITIONS` | | |
| 3.3 | `orderItem.model.ts` + `orderTracking.model.ts` — re-export types | | |

**Phase 3 — Expected:** &nbsp;&nbsp;&nbsp; / **Actual:**

---

## Phase 4 — Validation Layer

| # | Task | Expected | Actual |
|---|------|----------|--------|
| 4.1 | Request schemas (PlaceOrder, UpdateStatus, AddTracking, OrderIdParams) | | |
| 4.2 | Response schemas (OrderItem, OrderStatus, OrderTracking) | | |
| 4.3 | Response schemas (OrderResponse, OrderListItemResponse) | | |
| 4.4 | Success wrapper schemas + schemaRegistry + TS types | | |

**Phase 4 — Expected:** &nbsp;&nbsp;&nbsp; / **Actual:**

---

## Phase 5 — Service Layer

| # | Task | Expected | Actual |
|---|------|----------|--------|
| 5.1 | `placeOrder()` — atomic transaction | | |
| 5.2 | `getMyOrders()` — paginated | | |
| 5.3 | `getOrderById()` — مع ownership check | | |
| 5.4 | `cancelOrder()` — PENDING فقط | | |
| 5.5 | `updateOrderStatus()` — VALID_TRANSITIONS | | |
| 5.6 | `addTracking()` | | |
| 5.7 | `toOrderResponse()` + `toOrderListItemResponse()` helpers | | |

**Phase 5 — Expected:** &nbsp;&nbsp;&nbsp; / **Actual:**

---

## Phase 6 — Controller Layer

| # | Task | Expected | Actual |
|---|------|----------|--------|
| 6.1 | handlers: placeOrder, getMyOrders, getOrderById | | |
| 6.2 | handlers: cancelOrder, updateOrderStatus, addTracking | | |

**Phase 6 — Expected:** &nbsp;&nbsp;&nbsp; / **Actual:**

---

## Phase 7 — Routes Layer

| # | Task | Expected | Actual |
|---|------|----------|--------|
| 7.1 | تعريف الـ 6 routes في الـ router | | |
| 7.2 | OpenAPI docs للـ 6 endpoints | | |

**Phase 7 — Expected:** &nbsp;&nbsp;&nbsp; / **Actual:**

---

## Phase 8 — Wiring & Verification

| # | Task | Expected | Actual |
|---|------|----------|--------|
| 8.1 | mount `/orders` في `routes/index.ts` | | |
| 8.2 | import `order.validation` في `openapi/document.ts` | | |
| 8.3 | `npx tsc --noEmit` | | |
| 8.4 | manual testing (Postman / curl) | | |

**Phase 8 — Expected:** &nbsp;&nbsp;&nbsp; / **Actual:**

---

## Summary

| Phase | Description | Expected | Actual |
|-------|-------------|----------|--------|
| 1 | Database Schema | 1h | |
| 2 | Repository Layer | | |
| 3 | Model Layer | | |
| 4 | Validation Layer | | |
| 5 | Service Layer | | |
| 6 | Controller Layer | | |
| 7 | Routes Layer | | |
| 8 | Wiring & Verification | | |
| | **Total** | | |
