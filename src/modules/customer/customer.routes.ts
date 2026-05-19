import { Router } from "express";
import * as controller from "./customer.controller";

const router = Router();

router.get("/my-profile/:customerId", controller.getMyProfile);
router.get("/orders/:customerId", controller.getCustomerOrders);
router.get("/order-history/:customerId", controller.getCustomerOrderHistory);

export default router;
