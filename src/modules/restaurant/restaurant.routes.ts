import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import * as controller from "./restaurant.controller";
import {
  RegisterRestaurantRequestSchema,
  UpdateRestaurantRequestSchema,
  UpdateOrderStatusSchema,
} from "./restaurant.validation";

const router: Router = Router();

router.post("/register", validate({ body: RegisterRestaurantRequestSchema }), controller.register);
router.get("/me", controller.getMyRestaurant);
router.patch("/me", validate({ body: UpdateRestaurantRequestSchema }), controller.updateMyRestaurant);
router.get("/me/orders", controller.getOrders);
router.patch("/me/orders/:orderId", validate({ body: UpdateOrderStatusSchema }), controller.updateOrderStatus);

export default router;
