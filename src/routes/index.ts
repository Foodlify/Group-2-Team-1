import { Router } from "express";
import cartRouter from "../modules/cart/cart.routes";
import customerRouter from "../modules/customer/customer.routes";
import orderRouter from "../modules/order/order.route";
const router: Router = Router();

router.use("/carts", cartRouter);
router.use("/orders", orderRouter);
router.use("/customers", customerRouter);

export default router;
