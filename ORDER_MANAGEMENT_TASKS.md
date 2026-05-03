# Order Management — Tasks

## Phase 1 — Database Schema
- [ ] 1.1 إضافة `Order` model
- [ ] 1.2 إضافة `OrderItem` model
- [ ] 1.3 إضافة `OrderStatus` model
- [ ] 1.4 إضافة `OrderTracking` model
- [ ] 1.5 إضافة back-relations على Customer, Address, MenuItem
- [ ] 1.6 تشغيل `prisma migrate dev`

## Phase 2 — Repository Layer
- [ ] 2.1 `OrderRepository` — uncomment + add methods
- [ ] 2.2 `OrderItemRepository` — uncomment + add `createManyWithTx`
- [ ] 2.3 `OrderStatusRepository` — uncomment + add `createStatus` / `updateStatus`
- [ ] 2.4 `OrderTrackingRepository` — uncomment + add `createTracking` / `findByOrderId`

## Phase 3 — Model Layer
- [ ] 3.1 `order.model.ts` — إضافة `OrderWithDetails` + `OrderListItem`
- [ ] 3.2 `orderStatus.model.ts` — إضافة `ORDER_STATUSES` + `VALID_TRANSITIONS`
- [ ] 3.3 `orderItem.model.ts` + `orderTracking.model.ts` — re-export types

## Phase 4 — Validation Layer
- [ ] 4.1 Request schemas (PlaceOrder, UpdateStatus, AddTracking, OrderIdParams)
- [ ] 4.2 Response schemas (OrderItem, OrderStatus, OrderTracking)
- [ ] 4.3 Response schemas (OrderResponse, OrderListItemResponse)
- [ ] 4.4 Success wrapper schemas + schemaRegistry + TS types

## Phase 5 — Service Layer
- [ ] 5.1 `placeOrder()` — atomic transaction
- [ ] 5.2 `getMyOrders()` — paginated
- [ ] 5.3 `getOrderById()` — مع ownership check
- [ ] 5.4 `cancelOrder()` — PENDING فقط
- [ ] 5.5 `updateOrderStatus()` — VALID_TRANSITIONS
- [ ] 5.6 `addTracking()`
- [ ] 5.7 `toOrderResponse()` + `toOrderListItemResponse()` helpers

## Phase 6 — Controller Layer
- [ ] 6.1 handlers: placeOrder, getMyOrders, getOrderById
- [ ] 6.2 handlers: cancelOrder, updateOrderStatus, addTracking

## Phase 7 — Routes Layer
- [ ] 7.1 تعريف الـ 6 routes في الـ router
- [ ] 7.2 OpenAPI docs للـ 6 endpoints

## Phase 8 — Wiring & Verification
- [ ] 8.1 mount `/orders` في `routes/index.ts`
- [ ] 8.2 import `order.validation` في `openapi/document.ts`
- [ ] 8.3 `npx tsc --noEmit`
- [ ] 8.4 manual testing (Postman / curl)
