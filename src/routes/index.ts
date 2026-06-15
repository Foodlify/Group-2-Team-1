import { Router } from "express";
import cartRouter from "../modules/cart/cart.routes";
import customerRouter from "../modules/customer/customer.routes";
import orderRouter from "../modules/order/order.route";
import restaurantRouter from "../modules/restaurant/restaurant.routes";
import authRouter from "../modules/auth/auth.routes";
const router: Router = Router();

router.use("/carts", cartRouter);
router.use("/orders", orderRouter);
router.use("/customers", customerRouter);
router.use("/restaurants", restaurantRouter);
router.use("/auth", authRouter);

export default router;
