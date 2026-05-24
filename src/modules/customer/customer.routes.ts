import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware";
import * as controller from "./customer.controller";
import { UpdateAddressRequestSchema } from "../address/address.validation";

const router = Router();

router.get("/my-profile/:customerId", controller.getMyProfile);
router.patch("/my-profile/:customerId", controller.updateMyProfile);
router.patch(
  "/:customerId/address/:addressId",
  validate({ body: UpdateAddressRequestSchema }),
  controller.updateCustomerAddress,
);
router.get("/orders/:customerId", controller.getCustomerOrders);
router.get("/order-history/:customerId", controller.getCustomerOrderHistory);

export default router;
