import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";

import * as controller from "./order.controller";
import {
  CreateOrderRequestSchema,
  UpdateOrderRequestSchema,
  OrderIdParamsSchema,
} from "./order.validation";

const router: Router = Router();

router.get(
  "/me",
  controller.getMyOrders,
);

router.post(
  "/",
  validate({ body: CreateOrderRequestSchema }),
  controller.createOrder,
);

router.get(
  "/:orderId",
  validate({ params: OrderIdParamsSchema }),
  controller.getOrderById,
);

router.put(
  "/:orderId",
  validate({ params: OrderIdParamsSchema, body: UpdateOrderRequestSchema }),
  controller.updateOrder,
);

router.delete(
  "/:orderId",
  validate({ params: OrderIdParamsSchema }),
  controller.cancelOrder,
);

export default router;
