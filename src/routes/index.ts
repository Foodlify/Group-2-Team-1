import { Router } from "express";
import cartRouter from "../modules/cart/cart.routes";
// import userRouter from "../modules/user/user.routes";
import orderRouter from "../modules/order/order.route";
const router: Router = Router();

// router.use("/users", userRouter);
router.use("/carts", cartRouter);
router.use("/orders", orderRouter);

export default router;
